/** POST /api/siswa/vending/sengketa { transaksi_id, catatan } — "dana terpotong, barang tidak keluar" (F-116). */
import { ok, tangani } from "@/server/http";
import { ajukanSengketaVending } from "@/server/portal";
import { wajibSiswa } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const p = await wajibSiswa(req);
  const b = await bacaBody(req, v.obj({ transaksi_id: v.id(), catatan: v.str({ min: 3, max: 300 }) }));
  return ok(await ajukanSengketaVending(b.transaksi_id, p.siswa.id, "siswa", b.catatan));
});
