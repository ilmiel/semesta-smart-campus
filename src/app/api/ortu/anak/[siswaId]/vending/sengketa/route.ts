/** POST /api/ortu/anak/[siswaId]/vending/sengketa { transaksi_id, catatan } — F-116. */
import { ok, tangani } from "@/server/http";
import { ajukanSengketaVending } from "@/server/portal";
import { wajibWaliDari } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani<{ siswaId: string }>(async (req, { params }) => {
  const siswaId = Number((await params).siswaId);
  const { waliId } = await wajibWaliDari(req, siswaId);
  const b = await bacaBody(req, v.obj({ transaksi_id: v.id(), catatan: v.str({ min: 3, max: 300 }) }));
  return ok(await ajukanSengketaVending(b.transaksi_id, siswaId, `wali:${waliId}`, b.catatan));
});
