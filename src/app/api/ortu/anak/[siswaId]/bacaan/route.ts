/** GET /api/ortu/anak/[siswaId]/bacaan — riwayat bacaan (F-72), tanpa rupiah. */
import { ok, tangani } from "@/server/http";
import { riwayatBacaan } from "@/server/portal";
import { wajibWaliDari } from "@/server/sesi";

export const GET = tangani<{ siswaId: string }>(async (req, { params }) => {
  const siswaId = Number((await params).siswaId);
  await wajibWaliDari(req, siswaId);
  return ok({ bacaan: await riwayatBacaan(siswaId) });
});
