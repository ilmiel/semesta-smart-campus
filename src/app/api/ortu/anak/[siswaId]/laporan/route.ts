/**
 * GET /api/ortu/anak/[siswaId]/laporan?bulan=YYYY-MM — laporan bulanan (F-18, F-101).
 * Sekarang CSV; versi PDF berkop memakai komponen laporan_ortu.py yang sudah ada (§14).
 */
import { csv, tangani } from "@/server/http";
import { riwayatSiswa } from "@/server/portal";
import { wajibWaliDari } from "@/server/sesi";
import { bacaQuery, v } from "@/server/validasi";

export const GET = tangani<{ siswaId: string }>(async (req, { params }) => {
  const siswaId = Number((await params).siswaId);
  await wajibWaliDari(req, siswaId);
  const { bulan } = bacaQuery(req, v.obj({ bulan: v.str({ pola: /^\d{4}-\d{2}$/ }) }));
  const rows = await riwayatSiswa(siswaId, bulan, 5000);
  const baris = rows.map((r) => ({ waktu: r.waktu, jenis: r.jenis, layanan: r.layanan, keterangan: r.keterangan, item: r.item, nominal_rp: r.arah_rp, terminal: r.device }));
  return csv(baris, `laporan-${siswaId}-${bulan}.csv`);
});
