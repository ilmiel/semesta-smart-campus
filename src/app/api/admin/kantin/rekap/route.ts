/** GET /api/admin/kantin/rekap?dari=&sampai= — rekap per terminal (F-46) + menu terlaris. */
import { q } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { wajibPeran } from "@/server/sesi";
import { bacaQuery, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req, "kasir", "tu", "keuangan", "admin_it", "manajemen");
  const f = bacaQuery(req, v.obj({ dari: v.tanggal().opsional(), sampai: v.tanggal().opsional() }));
  const [terminal, terlaris] = await Promise.all([
    q(`SELECT * FROM v_rekap_terminal_harian WHERE tanggal BETWEEN COALESCE($1::date, hari_ini() - 7) AND COALESCE($2::date, hari_ini()) ORDER BY tanggal DESC, device`, [f.dari ?? null, f.sampai ?? null]),
    q(`SELECT nama, SUM(qty) AS qty, SUM(nilai_rp) AS nilai_rp FROM v_menu_terlaris WHERE tanggal BETWEEN COALESCE($1::date, hari_ini() - 7) AND COALESCE($2::date, hari_ini()) GROUP BY nama ORDER BY qty DESC LIMIT 20`, [f.dari ?? null, f.sampai ?? null]),
  ]);
  return ok({ terminal, terlaris, catatan: "Menu terlaris hanya dari mode menu + PO (F-47)." });
});
