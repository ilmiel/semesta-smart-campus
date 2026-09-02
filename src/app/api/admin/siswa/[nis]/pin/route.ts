/**
 * POST /api/admin/siswa/[nis]/pin
 *   { aksi: "reset" }        — TU, siswa hadir (F-34). PIN sementara dibuat server, ditampilkan sekali,
 *                               wajib diganti siswa pada pemakaian pertama (F-30).
 *   { aksi: "buka_kunci" }   — buka kunci setelah verifikasi (F-32).
 */
import { skalar } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { pinAcak, resetPinOlehTU } from "@/server/pin";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";
import { siswaIdDariNis } from "@/server/siswa";

export const POST = tangani<{ nis: string }>(async (req, { params }) => {
  const p = await wajibPeran(req, "tu", "admin_it");
  const id = await siswaIdDariNis((await params).nis);
  const { aksi } = await bacaBody(req, v.obj({ aksi: v.enum(["reset", "buka_kunci"] as const) }));
  if (aksi === "reset") {
    const sementara = pinAcak();
    await resetPinOlehTU(id, sementara, aktor(p));
    return ok({ pin_sementara: sementara, pesan: "Sampaikan langsung ke siswa. PIN ini wajib diganti di portal." });
  }
  await skalar("pin_buka_kunci", [id, aktor(p)]);
  return ok({ dibuka: true });
});
