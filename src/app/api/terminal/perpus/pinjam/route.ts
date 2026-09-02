/** POST /api/terminal/perpus/pinjam { barcode, uid, petugas? } — langkah 2: tap kartu. Tanpa uang. */
import { fnSatu } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { ipKlien, ok, tangani } from "@/server/http";
import { auditJikaPerlu } from "@/server/terminal";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const d = await wajibDevice(req, "perpustakaan");
  const b = await bacaBody(req, v.obj({ barcode: v.str({ min: 2, max: 40 }), uid: v.uid(), petugas: v.str({ max: 60 }).opsional() }));
  try {
    return ok(await fnSatu("perpus_pinjam", [d.kode, b.barcode, b.uid, b.petugas ?? null]));
  } catch (e) {
    await auditJikaPerlu(d, "pinjam", e, { barcode: b.barcode, uid: b.uid }, ipKlien(req));
    throw e;
  }
});
