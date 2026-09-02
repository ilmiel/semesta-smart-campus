/** GET /api/terminal/vending/planogram — slot, produk, harga, stok untuk mesin ini. */
import { q } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { ok, tangani } from "@/server/http";

export const GET = tangani(async (req) => {
  const d = await wajibDevice(req, "vending");
  const slot = await q(`SELECT * FROM v_planogram WHERE device = $1`, [d.kode]);
  return ok({ device: d.kode, slot });
});
