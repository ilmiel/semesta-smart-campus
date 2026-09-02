/**
 * POST /api/admin/device/[kode] { aksi: "nonaktif"|"aktif"|"ganti_kunci"|"ubah", alasan?, nama?, lokasi?, limit_offline_rp? }
 * Terminal hilang/dicuri → "nonaktif": kunci ditolak seketika (§9).
 */
import { q, skalar } from "@/server/db";
import { buatKunciDevice } from "@/server/device";
import { HttpError, ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani<{ kode: string }>(async (req, { params }) => {
  const p = await wajibPeran(req, "admin_it");
  const kode = (await params).kode.toUpperCase();
  const b = await bacaBody(req, v.obj({
    aksi: v.enum(["nonaktif", "aktif", "ganti_kunci", "ubah"] as const), alasan: v.str({ max: 200 }).opsional(),
    nama: v.str({ max: 60 }).opsional(), lokasi: v.str({ max: 80 }).opsional(), limit_offline_rp: v.rupiah().opsional(),
  }));
  const [d] = await q<{ nama: string; layanan: string; lokasi: string | null; limit_offline_rp: number }>(`SELECT nama, layanan, lokasi, limit_offline_rp FROM device WHERE kode = $1`, [kode]);
  if (!d) throw new HttpError(404, "TIDAK_DITEMUKAN", "device tidak ditemukan");
  if (b.aksi === "nonaktif" || b.aksi === "aktif") {
    await skalar("device_aktifkan", [kode, b.aksi === "aktif", aktor(p), b.alasan ?? null]);
    return ok({ kode, aktif: b.aksi === "aktif" });
  }
  if (b.aksi === "ganti_kunci") {
    const { kunci, hash } = buatKunciDevice();
    await skalar("device_simpan", [kode, d.nama, d.layanan, d.lokasi, hash, d.limit_offline_rp, aktor(p)]);
    return ok({ kode, kunci, catatan: "Kunci lama langsung tidak berlaku." });
  }
  await skalar("device_simpan", [kode, b.nama ?? d.nama, d.layanan, b.lokasi ?? d.lokasi, null, b.limit_offline_rp ?? d.limit_offline_rp, aktor(p)]);
  return ok({ kode, diubah: true });
});
