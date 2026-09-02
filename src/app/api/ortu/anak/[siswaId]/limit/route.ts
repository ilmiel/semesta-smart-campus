/** PUT /api/ortu/anak/[siswaId]/limit { limit_harian_rp } — hanya bisa menurunkan di bawah plafon (F-17). */
import { skalar } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { wajibWaliDari } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const PUT = tangani<{ siswaId: string }>(async (req, { params }) => {
  const siswaId = Number((await params).siswaId);
  const { waliId } = await wajibWaliDari(req, siswaId);
  const { limit_harian_rp } = await bacaBody(req, v.obj({ limit_harian_rp: v.rupiah() }));
  const efektif = await skalar<number>("limit_wali_set", [waliId, limit_harian_rp]);
  return ok({ limit_harian_rp: limit_harian_rp, limit_efektif_rp: efektif });
});
