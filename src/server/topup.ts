/**
 * Top-up (F-20–F-25): portal → invoice gateway → webhook → saldo.
 * Saldo hanya bertambah lewat topup_lunas() di DB, dan hanya setelah
 * webhook lolos verifikasi tanda tangan.
 */
import { fnSatu, q, satu, skalar } from "./db";
import { gateway, type Gateway } from "./gateway";
import { HttpError } from "./http";

export async function mulaiTopup(p: { siswaId: number; waliId: number; nominalRp: number; oleh: string }) {
  const gw = gateway();
  const topupId = await skalar<number>("topup_buat", [p.siswaId, p.nominalRp, gw.nama, p.oleh]);
  const info = await satu<{ siswa_nama: string; nis: string; wali_nama: string; wali_email: string | null; wali_wa: string | null }>(
    `SELECT s.nama AS siswa_nama, s.nis, w.nama AS wali_nama, w.email AS wali_email, w.whatsapp AS wali_wa
       FROM siswa s JOIN wali w ON w.id = $2 WHERE s.id = $1`, [p.siswaId, p.waliId]);
  if (!info) throw new HttpError(404, "TIDAK_DITEMUKAN", "siswa/wali tidak ditemukan");
  try {
    const inv = await gw.buatInvoice({
      topupId, nominalRp: p.nominalRp, siswaNama: info.siswa_nama, nis: info.nis,
      waliNama: info.wali_nama, waliEmail: info.wali_email, waliWa: info.wali_wa,
      kedaluwarsaMenit: Number(process.env.TOPUP_KEDALUWARSA_MENIT ?? 60),
    });
    await skalar("topup_set_invoice", [topupId, inv.invoiceId, inv.url, inv.kedaluwarsa]);
    return { topup_id: topupId, invoice_id: inv.invoiceId, url: inv.url, kedaluwarsa: inv.kedaluwarsa, gateway: gw.nama };
  } catch (e) {
    await q(`UPDATE topup SET status = 'gagal' WHERE id = $1 AND status = 'menunggu'`, [topupId]);
    throw e;
  }
}

/**
 * Proses webhook: SELALU simpan mentah dulu (F-21), lalu proses kalau valid.
 * Dua langkah terpisah (bukan satu transaksi) supaya baris webhook tetap ada
 * walau pemrosesan gagal — job pencocokan bisa mengulang yang diproses=false.
 */
export async function prosesWebhook(gw: Gateway, rawBody: string, headers: Headers) {
  const h = await gw.uraiWebhook(rawBody, headers);
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { body = { raw: rawBody.slice(0, 10_000) }; }
  const sig = headers.get("x-simulasi-signature") ?? headers.get("x-callback-token") ?? headers.get("x-signature") ?? null;
  const row = await satu<{ id: number }>(
    `INSERT INTO webhook_masuk (gateway, event, invoice_id, body, signature, valid, catatan)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7) RETURNING id`,
    [gw.nama, h.event, h.invoiceId, JSON.stringify(body), sig, h.valid, h.valid ? null : (h.catatan ?? "tidak valid")]);
  const id = row!.id;
  if (!h.valid) return { id, valid: false, diproses: false, catatan: h.catatan ?? "tanda tangan tidak valid" };

  let catatan = "event tidak relevan";
  let diproses = false;
  try {
    if (h.lunas && h.invoiceId) {
      const r = await fnSatu<{ baru: boolean; transaksi_id: number; saldo_rp: number }>(
        "topup_lunas", [h.invoiceId, h.dibayarPada ?? new Date(), h.nominalRp]);
      catatan = r.baru ? `lunas → transaksi ${r.transaksi_id}` : `duplikat — sudah lunas (transaksi ${r.transaksi_id})`;
      diproses = true;
    } else if (h.gagal && h.invoiceId) {
      await skalar("topup_gagal", [h.invoiceId, "kedaluwarsa"]);
      catatan = "ditandai kedaluwarsa"; diproses = true;
    }
  } catch (e) {
    catatan = `GAGAL: ${e instanceof Error ? e.message : String(e)}`;
  }
  await q(`UPDATE webhook_masuk SET diproses = $2, catatan = $3 WHERE id = $1`, [id, diproses, catatan]);
  return { id, valid: true, diproses, catatan };
}

/** Job pencocokan (PRD §13): topup menunggu yang sudah lewat → tanya gateway / tandai kedaluwarsa. */
export async function cocokkanTopupMenunggu(): Promise<{ dicek: number; lunas: number; kedaluwarsa: number }> {
  const gw = gateway();
  const rows = await q<{ invoice_id: string; kedaluwarsa: string | null }>(
    `SELECT invoice_id, kedaluwarsa FROM topup WHERE status = 'menunggu' AND invoice_id IS NOT NULL AND dibuat < now() - interval '10 minutes' LIMIT 100`);
  let lunas = 0, kedaluwarsa = 0;
  for (const r of rows) {
    try {
      const s = await gw.cekStatus(r.invoice_id);
      if (s.lunas) { await fnSatu("topup_lunas", [r.invoice_id, s.dibayarPada ?? new Date(), s.nominalRp]); lunas++; }
      else if (s.gagal || (r.kedaluwarsa && new Date(r.kedaluwarsa) < new Date())) { await skalar("topup_gagal", [r.invoice_id, "kedaluwarsa"]); kedaluwarsa++; }
    } catch (e) {
      // gateway belum siap (mayar TODO) → hanya tandai yang jelas kedaluwarsa
      if (r.kedaluwarsa && new Date(r.kedaluwarsa) < new Date()) { await skalar("topup_gagal", [r.invoice_id, "kedaluwarsa"]); kedaluwarsa++; }
      else console.warn("[topup] cek status gagal:", r.invoice_id, e instanceof Error ? e.message : e);
    }
  }
  return { dicek: rows.length, lunas, kedaluwarsa };
}
