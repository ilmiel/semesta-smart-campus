/**
 * POST /api/admin/keuangan/topup-tunai { siswa_id, nominal_rp, disetujui_oleh, catatan? } — F-23.
 * Yang login = yang menginput; `disetujui_oleh` = email staf kedua.
 *
 * Audit §2.5 — BATAS YANG DIKETAHUI. "Dua tanda tangan" di sini masih berupa
 * email yang diketik penginput, bukan persetujuan dari sesi orang kedua.
 * Artinya satu petugas TU secara teknis masih bisa mengisi saldo sendirian
 * sambil mencantumkan nama rekan.
 *
 * Yang sudah ditegakkan sekarang:
 *   - kedua pihak harus staf aktif berperan keuangan/tu (migrasi 011);
 *   - penyetuju DIBERI TAHU lewat email setiap kali namanya dipakai, jadi
 *     penyalahgunaan tidak bisa berlangsung diam-diam.
 *
 * Yang masih harus dikerjakan sebelum menangani uang sungguhan: token
 * persetujuan sekali pakai yang diterbitkan dari sesi penyetuju sendiri.
 */
import { fnSatu } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { kirimEmail } from "@/server/notifikasi";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "tu", "keuangan");
  const b = await bacaBody(req, v.obj({
    siswa_id: v.id(), nominal_rp: v.rupiah({ min: 1000 }),
    disetujui_oleh: v.email(), catatan: v.str({ max: 200 }).opsional(),
  }));
  const hasil = await fnSatu<{ topup_id: number; transaksi_id: number; saldo_rp: number }>(
    "topup_tunai", [b.siswa_id, b.nominal_rp, aktor(p), b.disetujui_oleh, b.catatan ?? null]);

  // Pemberitahuan ke penyetuju — pengaman kompensasi selama persetujuan
  // belum berbasis sesi. Kegagalan kirim tidak boleh membatalkan top-up
  // yang uangnya sudah diterima, tapi harus terlihat di log.
  try {
    await kirimEmail({
      ke: b.disetujui_oleh,
      judul: "Nama Anda dipakai sebagai penyetuju top-up tunai",
      teks: `${aktor(p)} mencatat top-up tunai Rp ${b.nominal_rp.toLocaleString("id-ID")} `
        + `untuk siswa id ${b.siswa_id} dengan Anda sebagai penyetuju.\n`
        + `Transaksi #${hasil.transaksi_id}.\n\n`
        + `Kalau Anda TIDAK menyetujui ini, segera laporkan ke Keuangan dan Admin IT.`,
    });
  } catch (e) {
    console.error("[topup-tunai] gagal memberi tahu penyetuju:", e instanceof Error ? e.message : e);
  }
  return ok(hasil);
});
