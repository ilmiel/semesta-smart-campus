/** POST /api/terminal/po/cari { uid? | kode? } — tab PO kasir (F-48). Kartu diblokir → pakai kode PO. */
import { fn } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { ok, tangani } from "@/server/http";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const d = await wajibDevice(req, "kantin");
  const b = await bacaBody(req, v.obj({ uid: v.uid().opsional(), kode: v.str({ min: 5, max: 12 }).opsional() }));
  const po = await fn("po_cari", [d.kode, b.uid ?? null, b.kode ?? null]);
  return ok({ po });
});
