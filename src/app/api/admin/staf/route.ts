/** GET/POST /api/admin/staf — akun staf & perannya (RBAC). Email = akun Google Workspace. */
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
