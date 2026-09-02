/** POST /api/terminal/perpus/scan { barcode } — langkah 1: info eksemplar & bisa dipinjam? */
import { fn } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { HttpError, ok, tangani } from "@/server/http";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  await wajibDevice(req, "perpustakaan");
  const { barcode } = await bacaBody(req, v.obj({ barcode: v.str({ min: 2, max: 40 }) }));
  const [r] = await fn("perpus_scan", [barcode]);
  if (!r) throw new HttpError(404, "BUKU_TIDAK_DIKENAL", "barcode tidak dikenal");
  return ok(r);
});
