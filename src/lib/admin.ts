"use client";

/**
 * Perkakas halaman admin: pemanggilan API + pemuatan data.
 *
 * Bedanya dengan `lib/terminal.ts`: di sini identitas datang dari cookie sesi
 * Better Auth, bukan kunci perangkat, jadi tidak ada header khusus. Yang perlu
 * ditangani justru kebalikannya — sesi bisa habis di tengah kerja, dan staf
 * harus tahu itu alih-alih melihat tabel kosong tanpa penjelasan.
 *
 * Tidak ada aturan bisnis di berkas ini. Semua keputusan (boleh/tidak, batas,
 * urutan) tetap di server; halaman admin hanya menampilkan dan meminta.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface Jawaban<T> {
  status: number;
  ok: boolean;
  data?: T;
  kode?: string;
  pesan?: string;
  /** true kalau permintaan tidak sampai ke server sama sekali. */
  putus?: boolean;
}

export async function apiAdmin<T>(
  jalur: string,
  opsi: { metode?: string; body?: unknown } = {},
): Promise<Jawaban<T>> {
  try {
    const res = await fetch(jalur, {
      method: opsi.metode ?? "GET",
      headers: opsi.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: opsi.body !== undefined ? JSON.stringify(opsi.body) : undefined,
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) {
      return { status: 401, ok: false, kode: "SESI_HABIS", pesan: "Sesi berakhir — muat ulang halaman dan login lagi." };
    }
    return { status: res.status, ok: res.ok && j?.ok !== false, data: j?.data, kode: j?.kode, pesan: j?.pesan };
  } catch {
    return { status: 0, ok: false, putus: true, kode: "TIDAK_TERJANGKAU", pesan: "Server tidak terjangkau" };
  }
}

/**
 * Muat data GET sekali + sediakan `muatUlang` untuk dipanggil setelah aksi.
 *
 * Setiap aksi admin WAJIB memanggil muatUlang, bukan menebak keadaan baru di
 * sisi klien: server yang memegang kebenaran, dan menebak adalah cara layar
 * admin perlahan berbohong tentang isi database.
 */
export function useMuat<T>(jalur: string) {
  const [data, setData] = useState<T | null>(null);
  const [galat, setGalat] = useState("");
  const [sedang, setSedang] = useState(true);
  // Nomor urut permintaan. Halaman yang memuat ulang saat staf mengetik
  // (daftar siswa) bisa menerima jawaban lama SETELAH jawaban baru; tanpa
  // penjaga ini layar diam-diam menampilkan hasil pencarian sebelumnya.
  const urut = useRef(0);

  const muatUlang = useCallback(async () => {
    const punyaku = ++urut.current;
    setSedang(true);
    const r = await apiAdmin<T>(jalur);
    if (punyaku !== urut.current) return;   // sudah didahului permintaan lebih baru
    setSedang(false);
    if (!r.ok) { setGalat(r.pesan ?? "Gagal memuat data"); return; }
    setGalat("");
    setData(r.data!);
  }, [jalur]);

  useEffect(() => { void muatUlang(); }, [muatUlang]);
  return { data, galat, sedang, muatUlang, setGalat };
}

/** Tanggal/waktu singkat untuk tabel. Kosong kalau null. */
export function waktuSingkat(x: string | null | undefined): string {
  if (!x) return "—";
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("id-ID", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/** "3 mnt lalu" — untuk kolom terakhir online. */
export function sejak(x: string | null | undefined): string {
  if (!x) return "belum pernah";
  const ms = Date.now() - new Date(x).getTime();
  if (Number.isNaN(ms)) return "—";
  const menit = Math.floor(ms / 60000);
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} mnt lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}
