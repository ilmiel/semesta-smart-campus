/**
 * GET   /api/admin/keuangan/topup-verifikasi — daftar top-up transfer menunggu & riwayat
 * PATCH /api/admin/keuangan/topup-verifikasi { topup_id, aksi: "setujui"|"tolak", alasan? }
 */
import { fnSatu, q, skalar } from "@/server/db";
import { HttpError, ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req, "tu", "keuangan", "manajemen", "admin_it");

  const [menunggu, riwayat] = await Promise.all([
    q(`SELECT * FROM v_topup_verifikasi_menunggu`),
    q(`SELECT * FROM v_topup_verifikasi_riwayat`),
  ]);

  return ok({ menunggu, riwayat });
});

export const PATCH = tangani(async (req) => {
  const p = await wajibPeran(req, "tu", "keuangan", "manajemen", "admin_it");
  const b = await bacaBody(
    req,
    v.obj({
      topup_id: v.int({ min: 1 }),
      aksi: v.enum(["setujui", "tolak"] as const),
      alasan: v.str({ max: 200 }).opsional(),
    })
  );

  const stafEmail = aktor(p);

  if (b.aksi === "setujui") {
    const res = await fnSatu<{ topup_id: number; transaksi_id: number; saldo_rp: number }>(
      "topup_verifikasi_setujui",
      [b.topup_id, stafEmail]
    );
    return ok({
      status: "disetujui",
      topup_id: res.topup_id,
      transaksi_id: res.transaksi_id,
      saldo_rp: res.saldo_rp,
    });
  }

  if (b.aksi === "tolak") {
    await skalar("topup_verifikasi_tolak", [b.topup_id, b.alasan?.trim() || "Bukti transfer tidak sesuai", stafEmail]);
    return ok({ status: "ditolak", topup_id: b.topup_id });
  }

  throw new HttpError(400, "AKSI_TIDAK_VALID", "Aksi tidak dikenal");
});
