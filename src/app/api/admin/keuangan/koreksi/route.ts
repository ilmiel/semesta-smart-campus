/**
 * GET  /api/admin/keuangan/koreksi — daftar refund/koreksi/penarikan dengan alasan & petugas (F-92).
 * POST { jenis: "refund", transaksi_id, nominal_rp?, alasan }
 *      { jenis: "koreksi", siswa_id, nominal_rp (± ), alasan, ref_transaksi_id }
 *      { jenis: "penarikan", siswa_id, bukti, nominal_rp? }
 * Semua lewat fungsi DB → ledger append-only, audit otomatis (F-13, F-16).
 */
import { q, skalar } from "@/server/db";
import { HttpError, ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, bacaQuery, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req, "keuangan", "manajemen", "admin_it");
  const { limit } = bacaQuery(req, v.obj({ limit: v.int({ min: 1, max: 1000 }).default(200) }));
  return ok({ koreksi: await q(`SELECT * FROM v_koreksi ORDER BY waktu DESC LIMIT $1`, [limit]) });
});

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "keuangan");
  const b = await bacaBody(req, v.obj({
    jenis: v.enum(["refund", "koreksi", "penarikan"] as const),
    transaksi_id: v.id().opsional(), siswa_id: v.id().opsional(), ref_transaksi_id: v.id().opsional(),
    nominal_rp: v.int({ min: -100_000_000, max: 100_000_000 }).opsional(), alasan: v.str({ max: 300 }).opsional(), bukti: v.str({ max: 200 }).opsional(),
  }));
  if (b.jenis === "refund") {
    if (!b.transaksi_id) throw new HttpError(400, "VALIDASI", "transaksi_id wajib");
    return ok({ transaksi_id: await skalar<number>("refund", [b.transaksi_id, b.nominal_rp ?? null, b.alasan ?? "", aktor(p), null]) });
  }
  if (!b.siswa_id) throw new HttpError(400, "VALIDASI", "siswa_id wajib");
  if (b.jenis === "koreksi") {
    return ok({ transaksi_id: await skalar<number>("koreksi", [b.siswa_id, b.nominal_rp ?? 0, b.alasan ?? "", aktor(p), b.ref_transaksi_id ?? null]) });
  }
  return ok({ transaksi_id: await skalar<number>("penarikan", [b.siswa_id, b.bukti ?? "", aktor(p), b.nominal_rp ?? null]) });
});
