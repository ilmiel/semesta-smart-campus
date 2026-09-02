/** GET /api/siswa/saya — ringkasan untuk portal siswa (F-102). Hanya data dirinya sendiri (F-103). */
import { ok, tangani } from "@/server/http";
import { ringkasanSiswa } from "@/server/portal";
import { wajibSiswa } from "@/server/sesi";

export const GET = tangani(async (req) => {
  const p = await wajibSiswa(req);
  return ok(await ringkasanSiswa(p.siswa.id));
});
