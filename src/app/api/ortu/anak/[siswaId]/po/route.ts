/** POST /api/ortu/anak/[siswaId]/po { items: [{menu_id, qty}], catatan? } — pesan & bayar dari saldo. */
import { ok, tangani } from "@/server/http";
import { buatPO } from "@/server/portal";
import { wajibWaliDari } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani<{ siswaId: string }>(async (req, { params }) => {
  const siswaId = Number((await params).siswaId);
  const { waliId } = await wajibWaliDari(req, siswaId);
  const b = await bacaBody(req, v.obj({ items: v.arr(v.obj({ menu_id: v.id(), qty: v.int({ min: 1, max: 10 }) }), { min: 1, max: 20 }), catatan: v.str({ max: 120 }).opsional() }));
  return ok(await buatPO(siswaId, `wali:${waliId}`, b.items, b.catatan));
});
