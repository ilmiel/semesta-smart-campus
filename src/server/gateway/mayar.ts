/**
 * Gateway MAYAR.ID — KERANGKA. Dilengkapi setelah KYC akun selesai.
 *
 * Yang sudah pasti (keputusan di percakapan 2 Sep 2026):
 *   - API key: scope "Read Only" dulu; naik ke "Read & Write" hanya kalau
 *     endpoint pembuatan invoice ternyata mensyaratkannya — catat alasannya.
 *   - Webhook Token dipakai untuk memverifikasi tanda tangan setiap webhook.
 *   - Keduanya di .env (MAYAR_API_KEY, MAYAR_WEBHOOK_TOKEN), tidak pernah ke client.
 *
 * Yang BELUM boleh ditebak (isi dari dokumentasi resmi mayar.id, bukan dari ingatan):
 *   [TODO-1] URL endpoint pembuatan invoice/payment link + bentuk body & respons.
 *   [TODO-2] Nama header tanda tangan webhook dan cara menghitungnya
 *            (HMAC atas raw body? token dibandingkan langsung?).
 *   [TODO-3] Nama event/status yang berarti "lunas" dan "kedaluwarsa".
 *   [TODO-4] Endpoint cek status invoice.
 *
 * Sampai TODO di atas diisi, fungsi-fungsi ini MELEMPAR error yang jelas —
 * bukan diam-diam menganggap valid. Uji dengan GATEWAY=simulasi.
 */
import type { Gateway, HasilWebhook } from "./index";

const API_BASE = process.env.MAYAR_API_BASE ?? "https://api.mayar.id";   // [TODO-1] konfirmasi
const apiKey = () => process.env.MAYAR_API_KEY ?? "";
const webhookToken = () => process.env.MAYAR_WEBHOOK_TOKEN ?? "";

function belumSiap(bagian: string): never {
  throw new Error(`Integrasi mayar.id belum dilengkapi (${bagian}) — lihat src/server/gateway/mayar.ts`);
}

export const gatewayMayar: Gateway = {
  nama: "mayar",

  async buatInvoice(p) {
    if (!apiKey()) throw new Error("MAYAR_API_KEY belum di-set");
    // [TODO-1] Contoh kerangka pemanggilan — path & field WAJIB dicocokkan dengan dokumentasi:
    // const res = await fetch(`${API_BASE}/hl/v1/payment/create`, {
    //   method: "POST",
    //   headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     name: p.waliNama, email: p.waliEmail, mobile: p.waliWa,
    //     amount: p.nominalRp,
    //     description: `Top-up saldo ${p.siswaNama} (${p.nis}) — Semesta Smart Campus`,
    //     expiredAt: new Date(Date.now() + p.kedaluwarsaMenit * 60_000).toISOString(),
    //     // simpan topupId di field referensi/metadata gateway agar webhook bisa dicocokkan
    //   }),
    // });
    // if (!res.ok) throw new Error(`mayar ${res.status}: ${await res.text()}`);
    // const j = await res.json();
    // return { invoiceId: j.data.id, url: j.data.link, kedaluwarsa: new Date(j.data.expiredAt) };
    void p; void API_BASE;
    return belumSiap("buatInvoice");
  },

  async uraiWebhook(rawBody, headers): Promise<HasilWebhook> {
    if (!webhookToken()) {
      return { valid: false, event: null, invoiceId: null, lunas: false, gagal: false, nominalRp: null, dibayarPada: null, catatan: "MAYAR_WEBHOOK_TOKEN belum di-set" };
    }
    // [TODO-2] Verifikasi tanda tangan. JANGAN menandai valid sebelum ini diisi.
    // [TODO-3] Petakan event → lunas / gagal, ambil invoiceId & nominal dari payload.
    void rawBody; void headers;
    return { valid: false, event: null, invoiceId: null, lunas: false, gagal: false, nominalRp: null, dibayarPada: null,
             catatan: "verifikasi webhook mayar belum diimplementasikan (TODO-2/3)" };
  },

  async cekStatus(invoiceId) {
    void invoiceId;
    return belumSiap("cekStatus [TODO-4]");
  },
};
