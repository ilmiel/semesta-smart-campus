/**
 * POST /api/terminal/sinkron  { items: [{idempotency_key, kartu_uid, nominal_rp, waktu_terminal, keterangan?, items?}] }
 * Kirim antrian offline (F-44). Server memproses tiap item terpisah; yang gagal
 * masuk daftar `ditolak` dengan alasan — terminal menampilkannya ke kasir.
 */
import { fnSatu, q } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { ok, tangani } from "@/server/http";
import { bacaBody, v } from "@/server/validasi";

const Body = v.obj({
  items: v.arr(v.obj({
    idempotency_key: v.idem(),
    kartu_uid: v.uid(),
    nominal_rp: v.rupiah({ min: 1 }),
    waktu_terminal: v.str({ max: 40 }),
    keterangan: v.str({ max: 120 }).opsional(),
    items: v.arr(v.obj({ nama: v.str({ max: 80 }), harga_rp: v.rupiah(), qty: v.int({ min: 1, max: 20 }), ref_id: v.id().opsional() })).opsional(),
  }), { max: 500 }),
});

export const POST = tangani(async (req) => {
  const d = await wajibDevice(req, "kantin");
  const { items } = await bacaBody(req, Body);
  const terima = await fnSatu<{ diterima: number; duplikat: number }>("antrian_terima", [d.kode, JSON.stringify(items)]);
  const proses = await fnSatu<{ diproses: number; ditolak: number }>("antrian_proses", [d.kode]);
  const kunci = items.map((i) => i.idempotency_key);
  const hasil = await q<{ idempotency_key: string; status: string; transaksi_id: number | null; alasan_tolak: string | null }>(
    `SELECT idempotency_key, status, transaksi_id, alasan_tolak FROM antrian_offline WHERE idempotency_key = ANY($1)`, [kunci]);
  return ok({ ...terima, ...proses, hasil });
});
