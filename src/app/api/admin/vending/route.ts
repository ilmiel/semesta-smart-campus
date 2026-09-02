/**
 * GET  /api/admin/vending — planogram (F-114), produk & persetujuan (F-115), transaksi gagal, sengketa.
 * POST { aksi: "mesin", device_kode, jam_mulai, jam_selesai }              (F-113)
 *      { aksi: "produk", id?, nama, harga_rp, aktif? } | { aksi: "setujui", produk_id, setuju }   (kesiswaan)
 *      { aksi: "slot", device_kode, slot, produk_id?, kapasitas? }
 *      { aksi: "restock", device_kode, slot, ditambah, stok_fisik?, catatan? } | { aksi: "pulihkan", device_kode, slot, catatan? }
 */
import { fnSatu, q, skalar } from "@/server/db";
import { HttpError, ok, tangani } from "@/server/http";
import { aktor, punyaPeran, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req);
  const [planogram, produk, mesin, gagal, sengketa] = await Promise.all([
    q(`SELECT * FROM v_planogram`),
    q(`SELECT * FROM produk_vending ORDER BY nama`),
    q(`SELECT d.kode, d.nama, d.lokasi, m.jam_mulai, m.jam_selesai, m.selalu_aktif, ds.status FROM device d LEFT JOIN mesin_vending m ON m.device_id = d.id JOIN v_device_status ds ON ds.id = d.id WHERE d.layanan = 'vending' ORDER BY d.kode`),
    q(`SELECT tv.transaksi_id, d.kode AS device, sv.slot, p.nama AS produk, tv.mulai, tv.alasan_batal, tv.refund_transaksi_id FROM transaksi_vending tv JOIN device d ON d.id = tv.device_id JOIN slot_vending sv ON sv.id = tv.slot_id LEFT JOIN produk_vending p ON p.id = tv.produk_id WHERE tv.status = 'batal' ORDER BY tv.mulai DESC LIMIT 50`),
    q(`SELECT g.id, g.status, g.catatan, g.dibuat, s.nama, t.total_rp FROM sengketa_vending g JOIN siswa s ON s.id = g.siswa_id JOIN transaksi t ON t.id = g.transaksi_id WHERE g.status = 'menunggu' ORDER BY g.id`),
  ]);
  return ok({ planogram, produk, mesin, gagal_terakhir: gagal, sengketa_menunggu: sengketa });
});

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "admin_it", "kesiswaan", "manajemen", "tu");
  const b = await bacaBody(req, v.obj({
    aksi: v.enum(["mesin", "produk", "setujui", "slot", "restock", "pulihkan"] as const),
    device_kode: v.str({ max: 20 }).opsional(), jam_mulai: v.jam().opsional(), jam_selesai: v.jam().opsional(),
    id: v.id().opsional(), nama: v.str({ max: 60 }).opsional(), harga_rp: v.rupiah({ min: 500 }).opsional(), aktif: v.bool().opsional(),
    produk_id: v.id().opsional(), setuju: v.bool().opsional(), slot: v.str({ max: 6 }).opsional(), kapasitas: v.int({ min: 1, max: 100 }).opsional(),
    ditambah: v.int({ min: 0, max: 100 }).opsional(), stok_fisik: v.int({ min: 0, max: 100 }).opsional(), catatan: v.str({ max: 200 }).opsional(),
  }));
  const a = aktor(p);
  switch (b.aksi) {
    case "mesin":
      if (!punyaPeran(p, "admin_it")) throw new HttpError(403, "PERAN_TIDAK_CUKUP", "hanya admin IT");
      if (!b.device_kode || !b.jam_mulai || !b.jam_selesai) throw new HttpError(400, "VALIDASI", "device_kode, jam_mulai, jam_selesai wajib");
      await skalar("vending_daftarkan_mesin", [b.device_kode, b.jam_mulai, b.jam_selesai, a]); return ok({ device_kode: b.device_kode });
    case "produk":
      if (!b.nama || !b.harga_rp) throw new HttpError(400, "VALIDASI", "nama & harga_rp wajib");
      return ok({ produk_id: await skalar<number>("vending_produk_simpan", [b.id ?? null, b.nama, b.harga_rp, b.aktif ?? null, a]) });
    case "setujui":
      if (!punyaPeran(p, "kesiswaan")) throw new HttpError(403, "PERAN_TIDAK_CUKUP", "persetujuan produk hanya oleh kesiswaan (F-115)");
      if (!b.produk_id || b.setuju === undefined) throw new HttpError(400, "VALIDASI", "produk_id & setuju wajib");
      await skalar("vending_produk_setujui", [b.produk_id, b.setuju, a]); return ok({ produk_id: b.produk_id, disetujui: b.setuju });
    case "slot":
      if (!b.device_kode || !b.slot) throw new HttpError(400, "VALIDASI", "device_kode & slot wajib");
      return ok({ slot_id: await skalar<number>("vending_slot_atur", [b.device_kode, b.slot, b.produk_id ?? null, b.kapasitas ?? null, a]) });
    case "restock":
      if (!b.device_kode || !b.slot || b.ditambah === undefined) throw new HttpError(400, "VALIDASI", "device_kode, slot, ditambah wajib");
      return ok(await fnSatu("vending_restock", [b.device_kode, b.slot, b.ditambah, b.stok_fisik ?? null, a, b.catatan ?? null]));
    case "pulihkan":
      if (!punyaPeran(p, "admin_it")) throw new HttpError(403, "PERAN_TIDAK_CUKUP", "hanya admin IT setelah cek fisik");
      if (!b.device_kode || !b.slot) throw new HttpError(400, "VALIDASI", "device_kode & slot wajib");
      await skalar("vending_slot_pulihkan", [b.device_kode, b.slot, a, b.catatan ?? null]); return ok({ slot: b.slot, dipulihkan: true });
  }
});
