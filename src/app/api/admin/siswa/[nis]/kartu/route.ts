/**
 * POST /api/admin/siswa/[nis]/kartu
 *   { aksi: "terbit", uid }                       — kartu baru; kartu lama otomatis 'diganti' (F-02)
 *   { aksi: "cabut", kartu_id, status, alasan? }  — hilang/rusak/ditarik (F-03)
 *   { aksi: "aktifkan", kartu_id }                — kartu hilang ketemu, belum ada pengganti (§9)
 */
import { skalar } from "@/server/db";
import { HttpError, ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";
import { siswaIdDariNis } from "@/server/siswa";

const Body = v.obj({
  aksi: v.enum(["terbit", "cabut", "aktifkan"] as const),
  uid: v.uid().opsional(),
  kartu_id: v.id().opsional(),
  status: v.enum(["hilang", "rusak", "ditarik"] as const).opsional(),
  alasan: v.str({ max: 200 }).opsional(),
});

export const POST = tangani<{ nis: string }>(async (req, { params }) => {
  const p = await wajibPeran(req, "tu", "admin_it");
  const id = await siswaIdDariNis((await params).nis);
  const b = await bacaBody(req, Body);
  if (b.aksi === "terbit") {
    if (!b.uid) throw new HttpError(400, "VALIDASI", "uid wajib untuk terbit");
    const kartu_id = await skalar<number>("kartu_terbit", [id, b.uid, aktor(p)]);
    return ok({ kartu_id });
  }
  if (!b.kartu_id) throw new HttpError(400, "VALIDASI", "kartu_id wajib");
  if (b.aksi === "cabut") await skalar("kartu_cabut", [b.kartu_id, b.status ?? "hilang", aktor(p), b.alasan ?? null]);
  else await skalar("kartu_aktifkan_lagi", [b.kartu_id, aktor(p)]);
  return ok({ kartu_id: b.kartu_id, aksi: b.aksi });
});
