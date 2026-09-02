/** POST /api/terminal/laundry/terima { uid, berat_kg?, items?, express?, petugas?, catatan?, rak? } — F-50, tanpa uang berpindah. */
import { fnSatu } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { ipKlien, ok, tangani } from "@/server/http";
import { auditJikaPerlu } from "@/server/terminal";
import { bacaBody, v } from "@/server/validasi";

const Body = v.obj({
  uid: v.uid(),
  berat_kg: v.num({ min: 0, max: 50 }).opsional(),
  items: v.arr(v.obj({ kode: v.str({ max: 30 }), qty: v.int({ min: 1, max: 20 }) }), { max: 20 }).opsional(),
  express: v.bool().default(false),
  petugas: v.str({ max: 60 }).opsional(),
  catatan: v.str({ max: 200 }).opsional(),
  rak: v.str({ max: 20 }).opsional(),
});

export const POST = tangani(async (req) => {
  const d = await wajibDevice(req, "laundry");
  const b = await bacaBody(req, Body);
  try {
    const o = await fnSatu("laundry_terima", [d.kode, b.uid, b.berat_kg ?? 0, b.items ? JSON.stringify(b.items) : null, b.express, b.petugas ?? null, b.catatan ?? null, b.rak ?? null]);
    return ok(o);
  } catch (e) {
    await auditJikaPerlu(d, "laundry_terima", e, { uid: b.uid }, ipKlien(req));
    throw e;
  }
});
