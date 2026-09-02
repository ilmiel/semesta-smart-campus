/** POST /api/terminal/laundry/hitung { berat_kg?, items?: [{kode, qty}], express? } — estimasi sebelum cetak tiket. */
import { fnSatu } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { ok, tangani } from "@/server/http";
import { bacaBody, v } from "@/server/validasi";

export const ItemLaundry = v.arr(v.obj({ kode: v.str({ max: 30 }), qty: v.int({ min: 1, max: 20 }) }), { max: 20 });

export const POST = tangani(async (req) => {
  await wajibDevice(req, "laundry");
  const b = await bacaBody(req, v.obj({ berat_kg: v.num({ min: 0, max: 50 }).opsional(), items: ItemLaundry.opsional(), express: v.bool().default(false) }));
  const h = await fnSatu("laundry_hitung", [b.berat_kg ?? 0, b.items ? JSON.stringify(b.items) : null, b.express]);
  return ok(h);
});
