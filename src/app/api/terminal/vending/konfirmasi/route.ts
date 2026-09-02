/** POST /api/terminal/vending/konfirmasi { transaksi_id, sensor_ok, alasan? } — fase 2: sensor jatuh. */
import { fnSatu } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { ok, tangani } from "@/server/http";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const d = await wajibDevice(req, "vending");
  const b = await bacaBody(req, v.obj({ transaksi_id: v.id(), sensor_ok: v.bool(), alasan: v.str({ max: 120 }).opsional() }));
  return ok(await fnSatu("vending_konfirmasi", [d.kode, b.transaksi_id, b.sensor_ok, b.alasan ?? null]));
});
