/** DELETE /api/ortu/anak/[siswaId]/po/[poId] — batal sebelum jam tutup → refund otomatis. */
import { ok, tangani } from "@/server/http";
import { batalPO } from "@/server/portal";
import { wajibWaliDari } from "@/server/sesi";

export const DELETE = tangani<{ siswaId: string; poId: string }>(async (req, { params }) => {
  const { siswaId, poId } = await params;
  const { waliId } = await wajibWaliDari(req, Number(siswaId));
  return ok(await batalPO(Number(poId), Number(siswaId), `wali:${waliId}`));
});
