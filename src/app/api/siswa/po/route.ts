/** POST /api/siswa/po { items, catatan? } — PO dibayar dari saldo sendiri (F-48). */
import { ok, tangani } from "@/server/http";
import { buatPO } from "@/server/portal";
import { wajibSiswa } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const p = await wajibSiswa(req);
  const b = await bacaBody(req, v.obj({ items: v.arr(v.obj({ menu_id: v.id(), qty: v.int({ min: 1, max: 10 }) }), { min: 1, max: 20 }), catatan: v.str({ max: 120 }).opsional() }));
  return ok(await buatPO(p.siswa.id, "siswa", b.items, b.catatan));
});
