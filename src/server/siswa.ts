import { satu } from "./db";
import { HttpError } from "./http";

/** id siswa dari NIS di URL admin; 404 kalau tidak ada. */
export async function siswaIdDariNis(nis: string): Promise<number> {
  const s = await satu<{ id: number }>(`SELECT id FROM siswa WHERE nis = $1`, [nis]);
  if (!s) throw new HttpError(404, "TIDAK_DITEMUKAN", "siswa tidak ditemukan");
  return s.id;
}
