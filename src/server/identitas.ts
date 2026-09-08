import { q } from "@/server/db";
import { DEFAULT_IDENTITAS, type IdentitasSekolah } from "@/lib/identitas";

/**
 * Membaca konfigurasi identitas sekolah dari database kebijakan (SSR).
 */
export async function ambilIdentitasServer(): Promise<IdentitasSekolah> {
  try {
    const baris = await q<{ kunci: string; nilai: unknown }>(
      `SELECT kunci, nilai FROM kebijakan 
        WHERE kunci IN (
          'sekolah_nama',
          'sekolah_nama_singkat',
          'sekolah_logo_portrait',
          'sekolah_logo_landscape'
        )`
    );

    const peta = new Map(baris.map((b) => [b.kunci, b.nilai]));

    return {
      nama: (peta.get("sekolah_nama") as string) || DEFAULT_IDENTITAS.nama,
      nama_singkat: (peta.get("sekolah_nama_singkat") as string) || DEFAULT_IDENTITAS.nama_singkat,
      logo_portrait: (peta.get("sekolah_logo_portrait") as string) || null,
      logo_landscape: (peta.get("sekolah_logo_landscape") as string) || null,
    };
  } catch {
    return DEFAULT_IDENTITAS;
  }
}
