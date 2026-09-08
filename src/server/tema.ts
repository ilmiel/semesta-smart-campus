import { satu } from "@/server/db";
import { TEMA_DEFAULT, type TemaWarna } from "@/lib/tema";

/** Mengambil tema warna yang tersimpan di database kebijakan */
export async function ambilTemaServer(): Promise<TemaWarna> {
  try {
    const row = await satu<{ nilai: TemaWarna }>(
      "SELECT nilai FROM kebijakan WHERE kunci = 'tema_warna'"
    );
    if (row?.nilai && typeof row.nilai === "object" && row.nilai.accent) {
      return row.nilai;
    }
    return TEMA_DEFAULT;
  } catch {
    return TEMA_DEFAULT;
  }
}
