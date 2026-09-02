/** POST /api/admin/kartu/impor { daftar: [{nis, uid}] } — impor dari Smart Classroom (F-05, F-80). */
import { fn } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "admin_it", "tu");
  const { daftar } = await bacaBody(req, v.obj({ daftar: v.arr(v.obj({ nis: v.str({ min: 3, max: 20 }), uid: v.uid() }), { min: 1, max: 1000 }) }));
  const hasil = await fn("kartu_impor", [JSON.stringify(daftar), aktor(p)]);
  return ok({ hasil, berhasil: hasil.filter((h) => h.berhasil).length, gagal: hasil.filter((h) => !h.berhasil).length });
});
