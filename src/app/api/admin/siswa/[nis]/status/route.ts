/** POST /api/admin/siswa/[nis]/status { status, alasan? } — aktif/cuti/pindah/lulus/keluar (F-06). */
import { skalar } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";
import { siswaIdDariNis } from "@/server/siswa";

export const POST = tangani<{ nis: string }>(async (req, { params }) => {
  const p = await wajibPeran(req, "tu", "admin_it");
  const id = await siswaIdDariNis((await params).nis);
  const b = await bacaBody(req, v.obj({ status: v.enum(["aktif", "cuti", "pindah", "lulus", "keluar"] as const), alasan: v.str({ max: 200 }).opsional() }));
  await skalar("siswa_ubah_status", [id, b.status, aktor(p), b.alasan ?? null]);
  return ok({ id, status: b.status });
});
