/**
 * POST /api/terminal/loker/buka { loker, uid } — F-60: akses, tanpa PIN, tanpa ledger.
 * Selalu 200 dengan { buka: true|false, alasan } — controller butuh jawaban, bukan error.
 */
import { fnSatu } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { ok, tangani } from "@/server/http";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const d = await wajibDevice(req, "locker");
  const b = await bacaBody(req, v.obj({ loker: v.str({ min: 2, max: 12 }), uid: v.uid() }));
  return ok(await fnSatu("loker_buka", [d.kode, b.loker.toUpperCase(), b.uid]));
});
