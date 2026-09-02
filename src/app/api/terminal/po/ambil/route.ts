/** POST /api/terminal/po/ambil { po_ids: [] } — tandai PO diambil setelah kasir verifikasi nama. */
import { skalar } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { ok, tangani } from "@/server/http";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const d = await wajibDevice(req, "kantin");
  const { po_ids } = await bacaBody(req, v.obj({ po_ids: v.arr(v.id(), { min: 1, max: 20 }) }));
  const n = await skalar<number>("po_ambil", [d.kode, po_ids]);
  return ok({ diambil: n });
});
