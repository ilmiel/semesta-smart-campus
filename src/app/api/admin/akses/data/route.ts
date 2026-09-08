/**
 * GET /api/admin/akses/data
 * Mengambil data gabungan untuk menu Login & Terminal:
 * - device: daftar terminal dari v_device_status
 * - siswa: daftar siswa aktif dari v_siswa
 * - wali: daftar wali beserta anak yang diwalikan
 */
import { q } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { wajibPeran } from "@/server/sesi";

interface WaliBaris {
  id: number;
  nama: string;
  hubungan: string | null;
  whatsapp: string | null;
  email: string | null;
  utama: boolean;
  siswa_id: number;
  siswa_nis: string;
  siswa_nama: string;
  siswa_kelas: string | null;
}

export const GET = tangani(async (req) => {
  await wajibPeran(req, "admin_it", "tu");

  const [devices, siswaList, waliRows] = await Promise.all([
    q(`SELECT * FROM v_device_status ORDER BY layanan, kode`),
    q(`SELECT id, nis, nama, kelas, jenjang, status, kartu, saldo_rp, limit_harian_rp, pin_ada, pin_terkunci 
       FROM v_siswa WHERE status IN ('aktif', 'cuti') ORDER BY kelas NULLS LAST, nama LIMIT 300`),
    q<WaliBaris>(`
      SELECT w.id, w.nama, w.hubungan, w.whatsapp, w.email, w.utama,
             s.id AS siswa_id, s.nis AS siswa_nis, s.nama AS siswa_nama, s.kelas AS siswa_kelas
      FROM wali w
      JOIN v_siswa s ON s.id = w.siswa_id
      WHERE s.status <> 'keluar'
      ORDER BY w.nama, s.nama
    `),
  ]);

  // Kelompokkan wali berdasarkan id
  const waliMap = new Map<number, {
    id: number;
    nama: string;
    hubungan: string | null;
    whatsapp: string | null;
    email: string | null;
    utama: boolean;
    anak: { id: number; nis: string; nama: string; kelas: string | null }[];
  }>();

  for (const r of waliRows) {
    if (!waliMap.has(r.id)) {
      waliMap.set(r.id, {
        id: r.id,
        nama: r.nama,
        hubungan: r.hubungan,
        whatsapp: r.whatsapp,
        email: r.email,
        utama: r.utama,
        anak: [],
      });
    }
    waliMap.get(r.id)!.anak.push({
      id: r.siswa_id,
      nis: r.siswa_nis,
      nama: r.siswa_nama,
      kelas: r.siswa_kelas,
    });
  }

  return ok({
    device: devices,
    siswa: siswaList,
    wali: Array.from(waliMap.values()),
  });
});
