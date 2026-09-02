/**
 * GET /api/admin/kesiswaan?kelas= — indikator kesejahteraan (F-94) & riwayat bacaan per kelas (F-72).
 * Untuk kesiswaan / wali kelas: TIDAK ada rupiah di respons ini.
 */
import { q } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { wajibPeran } from "@/server/sesi";
import { bacaQuery, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req, "kesiswaan", "wali_kelas", "manajemen", "admin_it");
  const { kelas } = bacaQuery(req, v.obj({ kelas: v.str({ max: 10 }).opsional() }));
  const [kesejahteraan, bacaan] = await Promise.all([
    q(`SELECT * FROM v_kesejahteraan WHERE ($1::text IS NULL OR kelas = $1) ORDER BY hari_tanpa_transaksi DESC NULLS FIRST, nama`, [kelas ?? null]),
    q(`SELECT s.nis, s.nama, b.judul, b.kategori, b.dipinjam, b.dikembalikan, b.terlambat
         FROM v_riwayat_bacaan b JOIN v_siswa s ON s.id = b.siswa_id
        WHERE ($1::text IS NULL OR s.kelas = $1) AND b.dipinjam > now() - interval '90 days' ORDER BY b.dipinjam DESC LIMIT 500`, [kelas ?? null]),
  ]);
  return ok({ kesejahteraan, bacaan });
});
