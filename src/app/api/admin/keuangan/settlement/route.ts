/** GET /api/admin/keuangan/settlement?dari=&sampai= — per unit per hari (F-92). */
import { q } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { wajibPeran } from "@/server/sesi";
import { bacaQuery, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req, "keuangan", "manajemen", "admin_it");
  const f = bacaQuery(req, v.obj({ dari: v.tanggal().opsional(), sampai: v.tanggal().opsional() }));
  const rows = await q(`SELECT * FROM v_settlement_unit WHERE tanggal BETWEEN COALESCE($1::date, date_trunc('month', hari_ini())::date) AND COALESCE($2::date, hari_ini()) ORDER BY tanggal DESC, layanan`, [f.dari ?? null, f.sampai ?? null]);
  const total = await q(`SELECT layanan, SUM(bersih_rp) AS bersih_rp, SUM(jumlah_transaksi) AS jumlah FROM v_settlement_unit WHERE tanggal BETWEEN COALESCE($1::date, date_trunc('month', hari_ini())::date) AND COALESCE($2::date, hari_ini()) GROUP BY layanan`, [f.dari ?? null, f.sampai ?? null]);
  return ok({ harian: rows, total });
});
