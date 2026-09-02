/** GET /api/ortu/anak/[siswaId]/riwayat?bulan=YYYY-MM — riwayat dengan nama item (F-101). */
import { ok, tangani } from "@/server/http";
import { riwayatSiswa } from "@/server/portal";
import { wajibWaliDari } from "@/server/sesi";
import { bacaQuery, v } from "@/server/validasi";

export const GET = tangani<{ siswaId: string }>(async (req, { params }) => {
  const siswaId = Number((await params).siswaId);
  await wajibWaliDari(req, siswaId);
  const { bulan, limit } = bacaQuery(req, v.obj({ bulan: v.str({ pola: /^\d{4}-\d{2}$/ }).opsional(), limit: v.int({ min: 1, max: 500 }).default(100) }));
  return ok({ riwayat: await riwayatSiswa(siswaId, bulan, limit) });
});
