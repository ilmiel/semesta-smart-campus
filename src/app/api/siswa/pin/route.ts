/**
 * POST /api/siswa/pin { pin_lama, pin_baru } — ganti PIN sendiri, wajib PIN lama (F-102).
 * PIN awal/sementara dari TU juga diganti lewat sini (F-30).
 */
import { ipKlien, ok, tangani } from "@/server/http";
import { gantiPinSiswa } from "@/server/pin";
import { wajibSiswa } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const p = await wajibSiswa(req);
  const b = await bacaBody(req, v.obj({ pin_lama: v.pin(), pin_baru: v.pin() }));
  await gantiPinSiswa(p.siswa.id, b.pin_lama, b.pin_baru, ipKlien(req));
  return ok({ diganti: true });
});
