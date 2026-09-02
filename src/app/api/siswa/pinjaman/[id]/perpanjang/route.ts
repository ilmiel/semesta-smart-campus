/** POST /api/siswa/pinjaman/[id]/perpanjang — perpanjang pinjaman sendiri (sekali, belum telat). */
import { satu, skalar } from "@/server/db";
import { HttpError, ok, tangani } from "@/server/http";
import { wajibSiswa } from "@/server/sesi";

export const POST = tangani<{ id: string }>(async (req, { params }) => {
  const p = await wajibSiswa(req);
  const id = Number((await params).id);
  const pj = await satu<{ siswa_id: number }>(`SELECT siswa_id FROM pinjaman WHERE id = $1 AND dikembalikan IS NULL`, [id]);
  if (!pj || pj.siswa_id !== p.siswa.id) throw new HttpError(404, "TIDAK_DITEMUKAN", "pinjaman tidak ditemukan");
  const jatuh_tempo = await skalar<string>("perpus_perpanjang", [id, "siswa"]);
  return ok({ jatuh_tempo });
});
