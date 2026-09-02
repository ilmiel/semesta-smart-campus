/** GET /api/admin/keuangan/webhook — webhook mentah (F-21): valid/tidak, diproses/tidak. */
import { q } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { wajibPeran } from "@/server/sesi";

export const GET = tangani(async (req) => {
  await wajibPeran(req, "keuangan", "admin_it");
  const [webhook, topup] = await Promise.all([
    q(`SELECT id, gateway, event, invoice_id, valid, diproses, catatan, diterima FROM webhook_masuk ORDER BY id DESC LIMIT 200`),
    q(`SELECT t.id, t.siswa_id, s.nama, t.nominal_rp, t.status, t.gateway, t.invoice_id, t.dibuat, t.kedaluwarsa, t.dibayar FROM topup t JOIN siswa s ON s.id = t.siswa_id ORDER BY t.id DESC LIMIT 200`),
  ]);
  return ok({ webhook, topup });
});
