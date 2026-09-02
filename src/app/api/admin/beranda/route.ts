/** GET /api/admin/beranda — KPI + grafik per jam + daftar "perlu perhatian" (F-90, F-93). */
import { fnSatu, q } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { punyaPeran, wajibPeran } from "@/server/sesi";

export const GET = tangani(async (req) => {
  const p = await wajibPeran(req);
  const [kpi, perJam, terakhir, perhatian] = await Promise.all([
    fnSatu("kpi_beranda", []),
    q(`SELECT * FROM v_transaksi_per_jam`),
    q(`SELECT waktu, jenis, siswa, device, total_rp, layanan, item FROM v_ekspor_transaksi ORDER BY waktu DESC LIMIT 12`),
    Promise.all([
      q(`SELECT * FROM v_antrian_ditolak ORDER BY diterima DESC LIMIT 10`),
      q(`SELECT * FROM v_pin_terkunci LIMIT 10`),
      q(`SELECT * FROM v_kartu_dicabut_hari_ini LIMIT 10`),
      q(`SELECT * FROM v_device_status WHERE status IN ('offline', 'terputus') AND aktif`),
    ]),
  ]);
  const uang = punyaPeran(p, "keuangan", "tu", "admin_it", "manajemen", "kasir");
  return ok({
    kpi: uang ? kpi : { ...kpi, omzet_hari_ini_rp: null, total_float_rp: null, topup_hari_ini_rp: null },
    per_jam: perJam,
    transaksi_terakhir: uang ? terakhir : [],
    perhatian: { antrian_ditolak: perhatian[0], pin_terkunci: perhatian[1], kartu_dicabut: perhatian[2], device_bermasalah: perhatian[3] },
    peran: p.peran,
  });
});
