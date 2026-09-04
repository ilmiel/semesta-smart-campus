/** GET /api/siswa/bacaan — riwayat bacaan sendiri (F-72), tanpa rupiah. */
import { ok, tangani } from "@/server/http";
import { riwayatBacaan } from "@/server/portal";
import { wajibSiswa } from "@/server/sesi";

export const GET = tangani(async (req) => {
  const p = await wajibSiswa(req);
  return ok({ bacaan: await riwayatBacaan(p.siswa.id) });
});
