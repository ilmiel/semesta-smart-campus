/** POST /api/terminal/laundry/bayar { order_id, uid, pin?, idem? } — F-51: kartu pemilik + PIN wajib. */
import { fnSatu, satu } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { HttpError, ipKlien, ok, tangani } from "@/server/http";
import { bayarDenganPin } from "@/server/terminal";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const d = await wajibDevice(req, "laundry");
  const b = await bacaBody(req, v.obj({ order_id: v.id(), uid: v.uid(), pin: v.pin().opsional(), idem: v.idem().opsional() }));
  const o = await satu<{ siswa_id: number; status: string }>(`SELECT siswa_id, status::text FROM order_laundry WHERE id = $1`, [b.order_id]);
  if (!o) throw new HttpError(404, "TIDAK_DITEMUKAN", "order tidak ditemukan");
  // pemilik kartu dicek DB (BUKAN_PEMILIK); PIN diverifikasi untuk siswa pemilik order
  const r = await bayarDenganPin(d, o.siswa_id, b.pin, ipKlien(req),
    (pinOk) => fnSatu("laundry_bayar", [d.kode, b.order_id, b.uid, pinOk, b.idem ?? null]),
    { order_id: b.order_id, uid: b.uid });
  return ok(r);
});
