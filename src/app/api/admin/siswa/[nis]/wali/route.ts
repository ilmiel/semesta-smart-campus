/** POST /api/admin/siswa/[nis]/wali { id?, nama, hubungan?, whatsapp?, email?, utama } — tambah/ubah wali. */
import { skalar } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";
import { siswaIdDariNis } from "@/server/siswa";

export const POST = tangani<{ nis: string }>(async (req, { params }) => {
  const p = await wajibPeran(req, "tu", "admin_it");
  const id = await siswaIdDariNis((await params).nis);
  const b = await bacaBody(req, v.obj({
    id: v.id().opsional(), nama: v.str({ min: 2, max: 100 }), hubungan: v.str({ max: 20 }).opsional(),
    whatsapp: v.str({ max: 20 }).opsional(), email: v.email().opsional(), utama: v.bool().default(false),
  }));
  const wali_id = await skalar<number>("wali_simpan", [b.id ?? null, id, b.nama, b.hubungan ?? null, b.whatsapp ?? null, b.email ?? null, b.utama, aktor(p)]);
  return ok({ wali_id });
});
