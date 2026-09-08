/**
 * Sesi → "principal": siapa pemanggil ini dan peran apa yang dia punya.
 *
 * Satu email bisa punya lebih dari satu kapasitas (guru yang juga orang tua).
 * Semua diambil dari tabel sekolah pada setiap request — mencabut peran di
 * tabel `staf` berlaku seketika tanpa menunggu sesi kedaluwarsa.
 *
 * Peran ditegakkan DI SINI (server), bukan dengan menyembunyikan tombol.
 */
import { createHmac } from "node:crypto";
import { auth } from "@/server/auth";   // alias (bukan relatif) supaya uji bisa menggantinya
import { q, satu } from "./db";
import { HttpError, ipDariHeaders } from "./http";

export type Peran =
  | "admin_it" | "keuangan" | "tu" | "kasir" | "laundry" | "asrama"
  | "pustakawan" | "kesiswaan" | "wali_kelas" | "manajemen";

export interface ImpersonasiInfo {
  tipe: "siswa" | "ortu";
  targetId: number;
  targetNama: string;
  targetEmail: string;
  adminEmail: string;
}

export interface Principal {
  email: string;
  nama: string;
  peran: Peran[];                                   // kosong = bukan staf
  siswa: { id: number; nis: string; nama: string } | null;
  wali: { waliId: number; siswaId: number; utama: boolean }[];   // anak-anak yang dia wali-i
  ip: string | null;
  impersonasi?: ImpersonasiInfo | null;
}

const SECRET = process.env.BETTER_AUTH_SECRET || "semesta-smart-campus-impersonate-secret";
export const COOKIE_IMPERSONASI = "semesta_impersonasi";

export function buatTokenImpersonasi(payload: { tipe: "siswa" | "ortu"; id: number; adminEmail: string }): string {
  const exp = Date.now() + 2 * 60 * 60 * 1000; // 2 jam
  const data = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifikasiTokenImpersonasi(token: string): { tipe: "siswa" | "ortu"; id: number; adminEmail: string } | null {
  try {
    const [data, sig] = token.split(".");
    if (!data || !sig) return null;
    const expectedSig = createHmac("sha256", SECRET).update(data).digest("base64url");
    if (sig !== expectedSig) return null;
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || !parsed || Date.now() > parsed.exp) return null;
    return { tipe: parsed.tipe, id: Number(parsed.id), adminEmail: String(parsed.adminEmail) };
  } catch {
    return null;
  }
}

/**
 * `peran_staf()` mengembalikan `peran[]` — array bertipe enum buatan sendiri.
 * OID tipe kustom ditentukan saat CREATE TYPE, jadi driver `pg` tidak punya
 * pengurai untuknya dan menyerahkan literal Postgres apa adanya sebagai TEKS:
 * '{}' atau '{keuangan,tu}'. Teks '{}' panjangnya 2, sehingga penjaga
 * `p.peran.length === 0` tidak pernah menyala dan bukan-staf lolos.
 *
 * Kueri di bawah sudah di-cast ke text[] (OID 1009, dikenal driver) sehingga
 * hasilnya array betulan. Fungsi ini lapis kedua: apa pun yang datang,
 * yang keluar pasti array. Penjaga peran tidak boleh bergantung pada
 * perilaku driver.
 */
function normalkanPeran(v: unknown): Peran[] {
  if (Array.isArray(v)) return v as Peran[];
  if (typeof v === "string") {
    const isi = v.replace(/^\{/, "").replace(/\}$/, "").trim();
    if (!isi) return [];
    return isi.split(",").map((s) => s.trim().replace(/^"|"$/g, "")) as Peran[];
  }
  return [];
}

/**
 * Versi berbasis Headers.
 *
 * Route handler punya `Request`; Server Component tidak — ia hanya punya
 * `headers()`. Layout admin memakai jalur ini supaya penjaga akses halaman
 * memakai kode yang PERSIS SAMA dengan penjaga API, bukan salinan yang
 * lama-lama menyimpang.
 */
export async function principalDariHeaders(h: Headers): Promise<Principal | null> {
  const sesi = await auth.api.getSession({ headers: h });
  if (!sesi?.user?.email) return null;
  const email = sesi.user.email.toLowerCase();
  const [peran, siswa, wali] = await Promise.all([
    satu<{ peran: unknown }>(`SELECT peran_staf($1)::text[] AS peran`, [email]),
    satu<{ id: number; nis: string; nama: string }>(
      `SELECT id, nis, nama FROM siswa WHERE lower(email) = $1 AND status IN ('aktif','cuti')`, [email]),
    q<{ wali_id: number; siswa_id: number; utama: boolean }>(
      `SELECT w.id AS wali_id, w.siswa_id, w.utama FROM wali w JOIN siswa s ON s.id = w.siswa_id
        WHERE lower(w.email) = $1 AND s.status <> 'keluar'`, [email]),
  ]);

  const normalPeran = normalkanPeran(peran?.peran);

  // Periksa apakah staf dengan peran admin_it / tu sedang mengaktifkan mode impersonasi pengecekan
  const cookieStr = h.get("cookie") ?? "";
  const match = cookieStr.match(new RegExp(`(?:^|;\\s*)${COOKIE_IMPERSONASI}=([^;]+)`));
  const token = match ? decodeURIComponent(match[1]) : null;
  const imp = token ? verifikasiTokenImpersonasi(token) : null;

  if (imp && imp.adminEmail.toLowerCase() === email && (normalPeran.includes("admin_it") || normalPeran.includes("tu"))) {
    if (imp.tipe === "siswa") {
      const targetSiswa = await satu<{ id: number; nis: string; nama: string; email: string | null }>(
        `SELECT id, nis, nama, email FROM siswa WHERE id = $1`, [imp.id]
      );
      if (targetSiswa) {
        return {
          email,
          nama: targetSiswa.nama,
          peran: normalPeran,
          siswa: { id: targetSiswa.id, nis: targetSiswa.nis, nama: targetSiswa.nama },
          wali: [],
          ip: ipDariHeaders(h),
          impersonasi: {
            tipe: "siswa",
            targetId: targetSiswa.id,
            targetNama: targetSiswa.nama,
            targetEmail: targetSiswa.email ?? targetSiswa.nis,
            adminEmail: email,
          },
        };
      }
    } else if (imp.tipe === "ortu") {
      const targetWali = await satu<{ id: number; nama: string; email: string | null; siswa_id: number }>(
        `SELECT id, nama, email, siswa_id FROM wali WHERE id = $1`, [imp.id]
      );
      if (targetWali) {
        const anakWali = await q<{ wali_id: number; siswa_id: number; utama: boolean }>(
          `SELECT w.id AS wali_id, w.siswa_id, w.utama FROM wali w JOIN siswa s ON s.id = w.siswa_id
           WHERE (w.id = $1 OR ($2 <> '' AND lower(w.email) = lower($2))) AND s.status <> 'keluar'`,
          [targetWali.id, (targetWali.email ?? "").trim()]
        );
        const waliList = anakWali.length > 0
          ? anakWali.map((w) => ({ waliId: w.wali_id, siswaId: w.siswa_id, utama: w.utama }))
          : [{ waliId: targetWali.id, siswaId: targetWali.siswa_id, utama: true }];

        return {
          email,
          nama: targetWali.nama,
          peran: normalPeran,
          siswa: null,
          wali: waliList,
          ip: ipDariHeaders(h),
          impersonasi: {
            tipe: "ortu",
            targetId: targetWali.id,
            targetNama: targetWali.nama,
            targetEmail: targetWali.email ?? "",
            adminEmail: email,
          },
        };
      }
    }
  }

  // Audit §3.9: lewat ipDariHeaders() supaya nilai non-IP tidak sampai ke kolom INET.
  return {
    email,
    // `||` bukan `??`: Better Auth mengisi name dengan string kosong untuk
    // akun magic link yang belum punya nama.
    nama: sesi.user.name || email,
    peran: normalPeran,
    siswa: siswa ?? null,
    wali: wali.map((w) => ({ waliId: w.wali_id, siswaId: w.siswa_id, utama: w.utama })),
    ip: ipDariHeaders(h),
  };
}

export async function principalDariRequest(req: Request): Promise<Principal | null> {
  return principalDariHeaders(req.headers);
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
export function aktor(p: Principal): string {
  return p.email;
}

