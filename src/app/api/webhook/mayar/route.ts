/**
 * POST /api/webhook/mayar — webhook dari mayar.id.
 * Raw body dibaca APA ADANYA (tanda tangan dihitung atas byte asli).
 * Selalu 200 setelah tersimpan — gateway tidak perlu mengulang; yang tidak
 * valid tersimpan & ditandai, tidak dieksekusi (F-21).
 */
import { gatewayMayar } from "@/server/gateway/mayar";
import { ok, tangani } from "@/server/http";
import { prosesWebhook } from "@/server/topup";

export const POST = tangani(async (req) => {
  const raw = await req.text();
  const r = await prosesWebhook(gatewayMayar, raw, req.headers);
  return ok({ diterima: true, id: r.id, valid: r.valid });
});
