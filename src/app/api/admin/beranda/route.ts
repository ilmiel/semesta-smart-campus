/** GET /api/admin/beranda — KPI + grafik per jam + daftar "perlu perhatian" (F-90, F-93). */
import { fnSatu, q } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { punyaPeran, wajibPeran } from "@/server/sesi";

export const GET = tangani(async (req) => {
  const p = await wajibPeran(req);
  const [kpi, perJam, terakhir, perhatian] = await Promise.all([
    fnSatu("kpi_beranda", []),
    q(`SELECT * FROM v_transaksi_per_jam`),
    // Kolom `waktu` view ini sudah digeser ke jam dinding WIB dan bertipe
    // timestamp TANPA zona — bentuk yang tepat untuk CSV, menyesatkan untuk
    // layar yang akan mengonversinya lagi ke zona sekolah. Dikembalikan ke
    // timestamptz di sini supaya yang dikirim ke klien adalah saat yang
    // sesungguhnya, bukan angka jam yang perlu ditafsirkan.
    q(`SELECT (waktu AT TIME ZONE 'Asia/Jakarta') AS waktu, jenis, siswa, device, total_rp, layanan, item
         FROM v_ekspor_transaksi ORDER BY waktu DESC LIMIT 12`),
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
    // Audit §2.6: UID kartu adalah kredensial (di bawah ambang PIN, bayar()
    // cukup dengan UID). Hanya peran yang memang mengurus kartu & uang.
    perhatian: {
      antrian_ditolak: uang ? perhatian[0] : [],
      pin_terkunci: perhatian[1],
      kartu_dicabut: uang ? perhatian[2] : perhatian[2].map((r) => ({ ...r, uid: null })),
      device_bermasalah: perhatian[3],
    },
    peran: p.peran,
  });
});
