/**
 * POST /api/simulasi-bayar { invoice_id, event: "payment.paid"|"payment.expired", nominal_rp }
 * Halaman "bayar" gateway simulasi (dev). Menandatangani payload dengan
 * SIMULASI_SECRET di server lalu melewati jalur webhook yang sama dengan
 * gateway sungguhan. Tidak tersedia di produksi.
 */
import { gatewaySimulasi, tandaTanganSimulasi } from "@/server/gateway/simulasi";
import { HttpError, ok, tangani } from "@/server/http";
import { prosesWebhook } from "@/server/topup";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  if (process.env.NODE_ENV === "production" && process.env.IZINKAN_SIMULASI_PRODUKSI !== "ya") throw new HttpError(404, "TIDAK_ADA", "tidak tersedia");
  const b = await bacaBody(req, v.obj({ invoice_id: v.str({ min: 5, max: 60 }), event: v.enum(["payment.paid", "payment.expired"] as const), nominal_rp: v.rupiah({ min: 1 }) }));
  const body = JSON.stringify({ event: b.event, invoice_id: b.invoice_id, nominal_rp: b.nominal_rp, dibayar: new Date().toISOString() });
  const headers = new Headers({ "x-simulasi-signature": tandaTanganSimulasi(body) });
  return ok(await prosesWebhook(gatewaySimulasi, body, headers));
});
