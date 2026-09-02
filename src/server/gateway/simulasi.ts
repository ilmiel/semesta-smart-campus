/**
 * Gateway SIMULASI — hanya untuk dev/uji, tanpa uang sungguhan.
 *
 * Alur: buatInvoice() mengembalikan URL /simulasi-bayar/<invoice> di aplikasi
 * ini sendiri. Halaman itu punya tombol "Bayar" / "Kedaluwarsa" yang mem-POST
 * ke /api/webhook/simulasi dengan tanda tangan HMAC memakai SIMULASI_SECRET —
 * sehingga jalur webhook (simpan mentah → verifikasi → topup_lunas) diuji
 * persis seperti gateway sungguhan.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Gateway, HasilWebhook } from "./index";

const SECRET = () => process.env.SIMULASI_SECRET ?? "simulasi-dev-secret";
const BASE = () => process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export function tandaTanganSimulasi(body: string): string {
  return createHmac("sha256", SECRET()).update(body).digest("hex");
}

export const gatewaySimulasi: Gateway = {
  nama: "simulasi",

  async buatInvoice(p) {
    const invoiceId = `SIM-${p.topupId}-${randomBytes(3).toString("hex").toUpperCase()}`;
    return {
      invoiceId,
      url: `${BASE()}/simulasi-bayar/${invoiceId}?nominal=${p.nominalRp}`,
      kedaluwarsa: new Date(Date.now() + p.kedaluwarsaMenit * 60_000),
    };
  },

  async uraiWebhook(rawBody, headers): Promise<HasilWebhook> {
    const sig = headers.get("x-simulasi-signature") ?? "";
    const harap = tandaTanganSimulasi(rawBody);
    const valid = sig.length === harap.length && timingSafeEqual(Buffer.from(sig), Buffer.from(harap));
    let b: { event?: string; invoice_id?: string; nominal_rp?: number; dibayar?: string } = {};
    try { b = JSON.parse(rawBody); } catch { return { valid: false, event: null, invoiceId: null, lunas: false, gagal: false, nominalRp: null, dibayarPada: null, catatan: "JSON tidak valid" }; }
    return {
      valid,
      event: b.event ?? null,
      invoiceId: b.invoice_id ?? null,
      lunas: valid && b.event === "payment.paid",
      gagal: valid && (b.event === "payment.expired" || b.event === "payment.failed"),
      nominalRp: typeof b.nominal_rp === "number" ? b.nominal_rp : null,
      dibayarPada: b.dibayar ? new Date(b.dibayar) : null,
      catatan: valid ? undefined : "tanda tangan tidak cocok",
    };
  },

  async cekStatus() {
    // simulasi tidak menyimpan status di luar DB kita
    return { lunas: false, gagal: false, nominalRp: null, dibayarPada: null };
  },
};
