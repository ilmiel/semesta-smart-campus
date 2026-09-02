/**
 * GET  /api/admin/laundry — order aktif, tunggakan (F-51), tarif (F-52).
 * POST { aksi: "status", order_id, status, rak?, alasan? } | { aksi: "tarif", kode, nama, jenis, harga_rp, aktif? }
 */
import { q, skalar } from "@/server/db";
import { HttpError, ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req, "laundry", "asrama", "keuangan", "manajemen", "admin_it");
  const [aktif, tunggakan, tarif, selesai] = await Promise.all([
    q(`SELECT * FROM v_laundry_aktif ORDER BY dibuat`),
    q(`SELECT * FROM v_laundry_tunggakan ORDER BY siap_pada`),
    q(`SELECT * FROM tarif_laundry ORDER BY jenis, harga_rp`),
    q(`SELECT o.id, o.kode, s.nama, o.total_rp, o.diambil_pada FROM order_laundry o JOIN siswa s ON s.id = o.siswa_id WHERE o.status = 'diambil' ORDER BY o.diambil_pada DESC LIMIT 50`),
  ]);
  return ok({ aktif, tunggakan, tarif, selesai_terakhir: selesai });
});

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "laundry", "asrama", "admin_it");
  const b = await bacaBody(req, v.obj({
    aksi: v.enum(["status", "tarif"] as const),
    order_id: v.id().opsional(), status: v.enum(["diproses", "siap", "dibatalkan"] as const).opsional(), rak: v.str({ max: 20 }).opsional(), alasan: v.str({ max: 200 }).opsional(),
    kode: v.str({ max: 30 }).opsional(), nama: v.str({ max: 60 }).opsional(), jenis: v.enum(["kiloan", "satuan"] as const).opsional(), harga_rp: v.rupiah({ min: 100 }).opsional(), aktif: v.bool().opsional(),
  }));
  if (b.aksi === "status") {
    if (!b.order_id || !b.status) throw new HttpError(400, "VALIDASI", "order_id & status wajib");
    await skalar("laundry_ubah_status", [b.order_id, b.status, aktor(p), b.rak ?? null, b.alasan ?? null]);
    return ok({ order_id: b.order_id, status: b.status });
  }
  if (!b.kode || !b.nama || !b.jenis || !b.harga_rp) throw new HttpError(400, "VALIDASI", "kode, nama, jenis, harga_rp wajib");
  return ok({ tarif_id: await skalar<number>("tarif_laundry_simpan", [b.kode, b.nama, b.jenis, b.harga_rp, b.aktif ?? null, aktor(p)]) });
});
