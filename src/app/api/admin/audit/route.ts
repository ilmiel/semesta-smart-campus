/** GET /api/admin/audit?objek=siswa:12&aktor=&aksi=&limit= — jejak audit (F-95). */
import { q } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { wajibPeran } from "@/server/sesi";
import { bacaQuery, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req, "admin_it", "keuangan", "manajemen");
  const f = bacaQuery(req, v.obj({ objek: v.str({ max: 60 }).opsional(), aktor: v.str({ max: 80 }).opsional(), aksi: v.str({ max: 40 }).opsional(), limit: v.int({ min: 1, max: 1000 }).default(200) }));
  const rows = await q(
    `SELECT id, waktu, aktor, peran, aksi, objek, ip, meta FROM audit_log
      WHERE ($1::text IS NULL OR objek = $1) AND ($2::text IS NULL OR aktor = $2) AND ($3::text IS NULL OR aksi = $3)
      ORDER BY id DESC LIMIT $4`, [f.objek ?? null, f.aktor ?? null, f.aksi ?? null, f.limit]);
  return ok({ audit: rows });
});
