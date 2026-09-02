/** GET /api/admin/laporan/transaksi?dari=&sampai=&layanan=&format=csv — ekspor (F-92). */
import { q } from "@/server/db";
import { csv, ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { catatAudit } from "@/server/audit";
import { bacaQuery, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  const p = await wajibPeran(req, "keuangan", "manajemen", "admin_it");
  const f = bacaQuery(req, v.obj({ dari: v.tanggal(), sampai: v.tanggal(), layanan: v.str({ max: 20 }).opsional(), format: v.enum(["json", "csv"] as const).default("json") }));
  const rows = await q(
    `SELECT * FROM v_ekspor_transaksi WHERE waktu::date BETWEEN $1::date AND $2::date AND ($3::text IS NULL OR layanan::text = $3) ORDER BY waktu`,
    [f.dari, f.sampai, f.layanan ?? null]);
  await catatAudit(aktor(p), "keuangan", "ekspor_transaksi", null, { dari: f.dari, sampai: f.sampai, layanan: f.layanan, baris: rows.length }, p.ip);
  return f.format === "csv" ? csv(rows, `transaksi-${f.dari}-${f.sampai}.csv`) : ok({ transaksi: rows });
});
