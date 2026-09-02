/**
 * GET  /api/admin/device — status semua terminal (F-93).
 * POST /api/admin/device { kode, nama, layanan, lokasi?, limit_offline_rp? } — daftarkan terminal baru.
 *      Jawaban memuat `kunci` SEKALI — simpan di terminal; server hanya menyimpan hash-nya.
 */
import { q, skalar } from "@/server/db";
import { buatKunciDevice } from "@/server/device";
import { ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req, "admin_it", "manajemen", "keuangan");
  return ok({ device: await q(`SELECT * FROM v_device_status ORDER BY layanan, kode`) });
});

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "admin_it");
  const b = await bacaBody(req, v.obj({
    kode: v.str({ min: 3, max: 20, pola: /^[A-Za-z0-9-]+$/ }), nama: v.str({ min: 2, max: 60 }),
    layanan: v.enum(["kantin", "perpustakaan", "locker", "vending", "laundry", "kelas", "gerbang"] as const),
    lokasi: v.str({ max: 80 }).opsional(), limit_offline_rp: v.rupiah().opsional(),
  }));
  const { kunci, hash } = buatKunciDevice();
  const id = await skalar<number>("device_simpan", [b.kode, b.nama, b.layanan, b.lokasi ?? null, hash, b.limit_offline_rp ?? null, aktor(p)]);
  return ok({ id, kode: b.kode.toUpperCase(), kunci, catatan: "Kunci hanya ditampilkan sekali. Isi ke terminal sebagai X-Device-Key." });
});
