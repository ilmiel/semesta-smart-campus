/**
 * Sesi → "principal": siapa pemanggil ini dan peran apa yang dia punya.
 *
 * Satu email bisa punya lebih dari satu kapasitas (guru yang juga orang tua).
 * Semua diambil dari tabel sekolah pada setiap request — mencabut peran di
 * tabel `staf` berlaku seketika tanpa menunggu sesi kedaluwarsa.
 *
 * Peran ditegakkan DI SINI (server), bukan dengan menyembunyikan tombol.
 */
import { auth } from "@/server/auth";   // alias (bukan relatif) supaya uji bisa menggantinya
import { q, satu } from "./db";
import { HttpError } from "./http";

export type Peran =
  | "admin_it" | "keuangan" | "tu" | "kasir" | "laundry" | "asrama"
  | "pustakawan" | "kesiswaan" | "wali_kelas" | "manajemen";

export interface Principal {
  email: string;
  nama: string;
  peran: Peran[];                                   // kosong = bukan staf
  siswa: { id: number; nis: string; nama: string } | null;
  wali: { waliId: number; siswaId: number; utama: boolean }[];   // anak-anak yang dia wali-i
  ip: string | null;
}

export async function principalDariRequest(req: Request): Promise<Principal | null> {
  const sesi = await auth.api.getSession({ headers: req.headers });
  if (!sesi?.user?.email) return null;
  const email = sesi.user.email.toLowerCase();
  const [peran, siswa, wali] = await Promise.all([
    satu<{ peran: Peran[] }>(`SELECT peran_staf($1) AS peran`, [email]),
    satu<{ id: number; nis: string; nama: string }>(
      `SELECT id, nis, nama FROM siswa WHERE lower(email) = $1 AND status IN ('aktif','cuti')`, [email]),
    q<{ wali_id: number; siswa_id: number; utama: boolean }>(
      `SELECT w.id AS wali_id, w.siswa_id, w.utama FROM wali w JOIN siswa s ON s.id = w.siswa_id
        WHERE lower(w.email) = $1 AND s.status <> 'keluar'`, [email]),
  ]);
  const xf = req.headers.get("x-forwarded-for");
  return {
    email,
    nama: sesi.user.name ?? email,
    peran: peran?.peran ?? [],
    siswa: siswa ?? null,
    wali: wali.map((w) => ({ waliId: w.wali_id, siswaId: w.siswa_id, utama: w.utama })),
    ip: xf ? xf.split(",")[0].trim() : req.headers.get("x-real-ip"),
  };
}

export async function wajibLogin(req: Request): Promise<Principal> {
  const p = await principalDariRequest(req);
  if (!p) throw new HttpError(401, "BELUM_LOGIN", "silakan masuk terlebih dahulu");
  return p;
}

/** Staf dengan salah satu peran yang disebut. Kosong = staf apa pun. */
export async function wajibPeran(req: Request, ...peran: Peran[]): Promise<Principal> {
  const p = await wajibLogin(req);
  if (p.peran.length === 0) throw new HttpError(403, "BUKAN_STAF", "akun ini tidak punya akses staf");
  if (peran.length > 0 && !peran.some((r) => p.peran.includes(r))) {
    throw new HttpError(403, "PERAN_TIDAK_CUKUP", `butuh peran: ${peran.join(" / ")}`);
  }
  return p;
}

export function punyaPeran(p: Principal, ...peran: Peran[]): boolean {
  return peran.some((r) => p.peran.includes(r));
}

/** Pemanggil adalah siswa (akun Google siswa). */
export async function wajibSiswa(req: Request): Promise<Principal & { siswa: NonNullable<Principal["siswa"]> }> {
  const p = await wajibLogin(req);
  if (!p.siswa) throw new HttpError(403, "BUKAN_SISWA", "akun ini bukan akun siswa");
  return p as Principal & { siswa: NonNullable<Principal["siswa"]> };
}

/**
 * Pemanggil adalah wali dari siswa tertentu (F-103: tidak pernah lintas anak).
 * Mengembalikan wali_id yang dipakai untuk aksi (limit, PO, dsb.).
 */
export async function wajibWaliDari(req: Request, siswaId: number): Promise<{ p: Principal; waliId: number }> {
  const p = await wajibLogin(req);
  const w = p.wali.find((x) => x.siswaId === siswaId);
  if (!w) throw new HttpError(403, "BUKAN_WALI", "Anda bukan wali dari siswa ini");
  return { p, waliId: w.waliId };
}

/** Aktor untuk audit_log / kolom `oleh`. */
export function aktor(p: Principal): string { return p.email; }
