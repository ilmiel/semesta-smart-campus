/** GET /api/terminal/laundry/order?status=siap — daftar order untuk tab "ambil & bayar". */
import { q } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { ok, tangani } from "@/server/http";
import { bacaQuery, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibDevice(req, "laundry");
  const { status, cari } = bacaQuery(req, v.obj({ status: v.enum(["diterima", "diproses", "siap"] as const).opsional(), cari: v.str({ max: 40 }).opsional() }));
  const rows = await q(
    `SELECT * FROM v_laundry_aktif WHERE ($1::text IS NULL OR status::text = $1)
        AND ($2::text IS NULL OR nama ILIKE '%' || $2 || '%' OR kode ILIKE '%' || $2 || '%')
      ORDER BY siap_pada NULLS LAST, dibuat LIMIT 200`, [status ?? null, cari ?? null]);
  return ok({ order: rows });
});
