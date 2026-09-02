/** POST /api/webhook/simulasi — webhook gateway simulasi (dev/uji saja). */
import { gatewaySimulasi } from "@/server/gateway/simulasi";
import { HttpError, ok, tangani } from "@/server/http";
import { prosesWebhook } from "@/server/topup";

export const POST = tangani(async (req) => {
  if (process.env.NODE_ENV === "production" && process.env.IZINKAN_SIMULASI_PRODUKSI !== "ya") {
    throw new HttpError(404, "TIDAK_ADA", "tidak tersedia");
  }
  const raw = await req.text();
  return ok(await prosesWebhook(gatewaySimulasi, raw, req.headers));
});
