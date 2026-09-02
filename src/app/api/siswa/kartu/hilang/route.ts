/** POST /api/siswa/kartu/hilang — blokir sementara kartu sendiri (F-102). */
import { ok, tangani } from "@/server/http";
import { blokirKartu } from "@/server/portal";
import { wajibSiswa } from "@/server/sesi";

export const POST = tangani(async (req) => {
  const p = await wajibSiswa(req);
  return ok(await blokirKartu(p.siswa.id, "siswa"));
});
