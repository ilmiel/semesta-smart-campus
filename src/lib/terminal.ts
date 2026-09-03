"use client";

/**
 * Perkakas terminal: kunci perangkat, pemanggilan API, dan antrian offline.
 *
 * Dipakai halaman /terminal/*. Semua aturan uang ada di server — berkas ini
 * hanya mengurus "bagaimana memanggil" dan "apa yang disimpan lokal saat
 * jaringan putus". Tidak ada perhitungan rupiah di sini.
 */

const KUNCI_PERANGKAT = "smartcampus.kunci_perangkat";
const KUNCI_ANTRIAN = "smartcampus.antrian_offline";

// ---------------------------------------------------------------- kunci

export function ambilKunci(): string | null {
  try { return localStorage.getItem(KUNCI_PERANGKAT); } catch { return null; }
}

export function simpanKunci(k: string): void {
  try { localStorage.setItem(KUNCI_PERANGKAT, k.trim()); } catch { /* penyimpanan diblokir */ }
}

export function hapusKunci(): void {
  try { localStorage.removeItem(KUNCI_PERANGKAT); } catch { /* abaikan */ }
}

// ---------------------------------------------------------------- API

export interface Jawaban<T> {
  status: number;
  ok: boolean;
  data?: T;
  kode?: string;
  pesan?: string;
  /** true kalau permintaan tidak sampai ke server sama sekali (jaringan putus). */
  putus?: boolean;
}

export async function apiTerminal<T>(
  jalur: string,
  opsi: { metode?: string; body?: unknown } = {},
): Promise<Jawaban<T>> {
  const kunci = ambilKunci();
  if (!kunci) return { status: 0, ok: false, kode: "KUNCI_KOSONG", pesan: "Kunci perangkat belum diisi" };
  try {
    const res = await fetch(jalur, {
      method: opsi.metode ?? "GET",
      headers: { "content-type": "application/json", "x-device-key": kunci },
      body: opsi.body !== undefined ? JSON.stringify(opsi.body) : undefined,
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok && j?.ok !== false, data: j?.data, kode: j?.kode, pesan: j?.pesan };
  } catch {
    // fetch gagal = server tidak terjangkau. Bedakan dari penolakan server,
    // karena hanya kasus ini yang boleh masuk antrian offline.
    return { status: 0, ok: false, putus: true, kode: "TIDAK_TERJANGKAU", pesan: "Server tidak terjangkau" };
  }
}

/**
 * Ambil foto siswa. Endpoint /api/terminal/foto/[nis] butuh header kunci
 * perangkat, jadi TIDAK bisa dipakai langsung sebagai src <img> — harus
 * lewat fetch lalu diubah jadi object URL.
 *
 * Mengembalikan null kalau tidak ada foto (server menjawab 204) atau gagal.
 * Pemanggil WAJIB memanggil URL.revokeObjectURL saat selesai (§8.1: terminal
 * tidak menyimpan foto lebih lama dari sesi).
 */
export async function ambilFoto(nis: string): Promise<string | null> {
  const kunci = ambilKunci();
  if (!kunci) return null;
  try {
    const res = await fetch(`/api/terminal/foto/${encodeURIComponent(nis)}`, {
      headers: { "x-device-key": kunci }, cache: "no-store",
    });
    if (res.status !== 200) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- antrian offline

/** Bentuknya mengikuti persis kontrak POST /api/terminal/sinkron. */
export interface ItemAntrian {
  idempotency_key: string;
  kartu_uid: string;
  nominal_rp: number;
  waktu_terminal: string;
  keterangan?: string;
  items?: { nama: string; harga_rp: number; qty: number; ref_id?: number }[];
}

export function bacaAntrian(): ItemAntrian[] {
  try { return JSON.parse(localStorage.getItem(KUNCI_ANTRIAN) ?? "[]") as ItemAntrian[]; } catch { return []; }
}

export function tulisAntrian(a: ItemAntrian[]): void {
  try { localStorage.setItem(KUNCI_ANTRIAN, JSON.stringify(a)); } catch { /* abaikan */ }
}

export function tambahAntrian(item: ItemAntrian): number {
  const a = bacaAntrian();
  a.push(item);
  tulisAntrian(a);
  return a.length;
}

export interface HasilSinkron {
  diterima: number;
  duplikat: number;
  diproses: number;
  ditolak: number;
  /** Status akhir tiap kunci yang dikirim — dipakai kasir untuk melihat sebab penolakan. */
  hasil: { idempotency_key: string; status: string; transaksi_id: number | null; alasan_tolak: string | null }[];
}

/**
 * Kirim antrian ke server. Antrian lokal HANYA dikosongkan kalau server
 * menjawab — kalau gagal, isinya dibiarkan supaya tidak ada transaksi hilang.
 * Aman dikirim berulang: server menolak duplikat lewat idempotency key.
 */
export async function kirimAntrian(): Promise<Jawaban<HasilSinkron>> {
  const items = bacaAntrian();
  if (items.length === 0) return { status: 200, ok: true, data: { diterima: 0, duplikat: 0, diproses: 0, ditolak: 0, hasil: [] } };
  const r = await apiTerminal<HasilSinkron>("/api/terminal/sinkron", { metode: "POST", body: { items } });
  if (r.ok) tulisAntrian([]);
  return r;
}

/** Kunci idempotensi sekali pakai; dipakai ulang saat kirim ulang dengan PIN. */
export function kunciIdem(): string {
  const acak = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
    : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  return `t${Date.now().toString(36)}${acak}`;
}
