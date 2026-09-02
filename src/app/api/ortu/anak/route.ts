/** GET /api/ortu/anak — semua anak yang di-wali-i pemanggil, dengan ringkasan. F-103: hanya anak sendiri. */
import { ok, tangani } from "@/server/http";
import { ringkasanSiswa } from "@/server/portal";
import { wajibLogin } from "@/server/sesi";

export const GET = tangani(async (req) => {
  const p = await wajibLogin(req);
  const anak = await Promise.all(p.wali.map(async (w) => ({ wali_id: w.waliId, utama: w.utama, ...(await ringkasanSiswa(w.siswaId)) })));
  return ok({ anak });
});
