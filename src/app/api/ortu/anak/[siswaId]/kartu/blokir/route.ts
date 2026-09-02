/** POST /api/ortu/anak/[siswaId]/kartu/blokir — lapor hilang, blokir seketika (F-102, §9 akhir pekan). */
import { ok, tangani } from "@/server/http";
import { blokirKartu } from "@/server/portal";
import { wajibWaliDari } from "@/server/sesi";

export const POST = tangani<{ siswaId: string }>(async (req, { params }) => {
  const siswaId = Number((await params).siswaId);
  const { waliId } = await wajibWaliDari(req, siswaId);
  return ok(await blokirKartu(siswaId, `wali:${waliId}`));
});
