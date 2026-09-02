/** POST /api/terminal/batal { transaksi_id } — pembatalan kasir (F-45): hanya transaksi terakhir, ≤ 5 menit. */
import { skalar } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { ok, tangani } from "@/server/http";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const d = await wajibDevice(req, "kantin", "laundry");
  const { transaksi_id } = await bacaBody(req, v.obj({ transaksi_id: v.id() }));
  const refund_id = await skalar<number>("batal_kasir", [d.kode, transaksi_id]);
  return ok({ refund_id });
});
