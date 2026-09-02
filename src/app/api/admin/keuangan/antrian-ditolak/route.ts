/** GET /api/admin/keuangan/antrian-ditolak — transaksi offline yang ditolak server, untuk ditindaklanjuti (F-44). */
import { q } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { wajibPeran } from "@/server/sesi";

export const GET = tangani(async (req) => {
  await wajibPeran(req, "keuangan", "admin_it", "manajemen");
  return ok({ ditolak: await q(`SELECT * FROM v_antrian_ditolak ORDER BY diterima DESC LIMIT 500`) });
});
