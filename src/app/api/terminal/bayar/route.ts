/**
 * POST /api/terminal/bayar
 * { idem, uid? | nis?, total? | items?: [{menu_id, qty}], keterangan?, pin?, waktu_terminal? }
 *
 * - mode nominal (F-47): kirim `total`
 * - mode menu   (F-40): kirim `items`, harga dihitung server (F-41)
 * - mode darurat (§9) : kirim `nis` + `pin` (tanpa uid)
 * Jawaban 428 BUTUH_PIN → terminal minta PIN, kirim ulang request yang sama + pin.
 * Idempotency key sama → transaksi yang sama, tidak dipotong dua kali (F-14).
 */
import { wajibDevice } from "@/server/device";
import { ipKlien, ok, tangani } from "@/server/http";
import { bayarKasir } from "@/server/terminal";
import { bacaBody, v } from "@/server/validasi";

const Body = v.obj({
  idem: v.idem(),
  uid: v.uid().opsional(),
  nis: v.str({ min: 3, max: 20 }).opsional(),
  total: v.rupiah({ min: 1 }).opsional(),
  items: v.arr(v.obj({ menu_id: v.id(), qty: v.int({ min: 1, max: 20 }) }), { max: 30 }).opsional(),
  keterangan: v.str({ max: 120 }).opsional(),
  pin: v.pin().opsional(),
  waktu_terminal: v.str({ max: 40 }).opsional(),
});

export const POST = tangani(async (req) => {
  const d = await wajibDevice(req, "kantin");
  const b = await bacaBody(req, Body);
  const r = await bayarKasir(d, { ...b, waktuTerminal: b.waktu_terminal }, ipKlien(req));
  return ok(r);
});
