/**
 * POST /api/terminal/vending/mulai { idem, uid, slot } — fase 1 (F-111): saldo ditahan (pending).
 * Server tidak terjangkau = mesin menolak sendiri (F-110); tidak ada jalur offline.
 */
import { fnSatu } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { ipKlien, ok, tangani } from "@/server/http";
import { auditJikaPerlu } from "@/server/terminal";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const d = await wajibDevice(req, "vending");
  const b = await bacaBody(req, v.obj({ idem: v.idem(), uid: v.uid(), slot: v.str({ min: 1, max: 6 }) }));
  try {
    return ok(await fnSatu("vending_mulai", [d.kode, b.idem, b.uid, b.slot]));
  } catch (e) {
    await auditJikaPerlu(d, "vending", e, { uid: b.uid, slot: b.slot }, ipKlien(req));
    throw e;
  }
});
