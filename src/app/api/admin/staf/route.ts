/**
 * GET/POST/PATCH /api/admin/staf — akun staf & perannya (RBAC).
 * Email = akun Google Workspace sekolah.
 *
 * POST  { email, nama, peran[], aktif } — buat/ubah akun sepenuhnya.
 * PATCH { email, aktif }                — aktifkan/nonaktifkan saja.
 *
 * PATCH sengaja tidak lewat staf_simpan: mencabut akses adalah aksi yang
 * paling mendesak saat ada masalah, dan tidak boleh gagal karena kolom yang
 * tidak disentuh (nama, email, atau peran warisan) melanggar aturan yang
 * baru berlaku. Penjaga admin IT terakhir tetap ditegakkan di SQL.
 */
import { q, skalar } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

const PERAN = ["admin_it", "keuangan", "tu", "kasir", "laundry", "asrama", "pustakawan", "kesiswaan", "wali_kelas", "manajemen"] as const;

export const GET = tangani(async (req) => {
  await wajibPeran(req, "admin_it", "manajemen");
  return ok({ staf: await q(`SELECT id, email, nama, peran::text[] AS peran, aktif, dibuat, diubah FROM staf ORDER BY nama`) });
});

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "admin_it");
  const b = await bacaBody(req, v.obj({ email: v.email(), nama: v.str({ min: 2, max: 80 }), peran: v.arr(v.enum(PERAN), { max: 10 }), aktif: v.bool().default(true) }));
  const id = await skalar<number>("staf_simpan", [b.email, b.nama, b.peran, b.aktif, aktor(p)]);
  return ok({ id });
});

export const PATCH = tangani(async (req) => {
  const p = await wajibPeran(req, "admin_it");
  // Sengaja v.str, bukan v.email(): email di sini adalah KUNCI PENCARIAN,
  // bukan data yang sedang ditulis. Baris warisan bisa saja beralamat
  // 'it@semesta' (tanpa TLD) — kolomnya hanya menuntut huruf kecil. Kalau
  // divalidasi ulang di sini, akun itu tidak bisa dicabut aksesnya, yaitu
  // persis kegagalan yang PATCH ini dibuat untuk menghilangkan.
  // staf_status() sudah melakukan lower(trim(...)) sendiri, dan email yang
  // tidak ada menjadi TIDAK_DITEMUKAN → 404.
  const b = await bacaBody(req, v.obj({ email: v.str({ min: 3, max: 120 }), aktif: v.bool() }));
  const id = await skalar<number>("staf_status", [b.email, b.aktif, aktor(p)]);
  return ok({ id, aktif: b.aktif });
});
