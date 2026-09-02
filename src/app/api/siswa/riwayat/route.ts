/** GET /api/siswa/riwayat?bulan=YYYY-MM */
import { ok, tangani } from "@/server/http";
import { riwayatSiswa } from "@/server/portal";
import { wajibSiswa } from "@/server/sesi";
import { bacaQuery, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  const p = await wajibSiswa(req);
  const { bulan, limit } = bacaQuery(req, v.obj({ bulan: v.str({ pola: /^\d{4}-\d{2}$/ }).opsional(), limit: v.int({ min: 1, max: 500 }).default(100) }));
  return ok({ riwayat: await riwayatSiswa(p.siswa.id, bulan, limit) });
});
