/** POST /api/ortu/anak/[siswaId]/topup { nominal_rp } → { url } halaman bayar gateway (F-20). */
import { ok, tangani } from "@/server/http";
import { wajibWaliDari } from "@/server/sesi";
import { mulaiTopup } from "@/server/topup";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani<{ siswaId: string }>(async (req, { params }) => {
  const siswaId = Number((await params).siswaId);
  const { waliId } = await wajibWaliDari(req, siswaId);
  const { nominal_rp } = await bacaBody(req, v.obj({ nominal_rp: v.rupiah({ min: 1000 }) }));
  return ok(await mulaiTopup({ siswaId, waliId, nominalRp: nominal_rp, oleh: `wali:${waliId}` }));
});
