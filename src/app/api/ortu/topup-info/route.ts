/** GET /api/ortu/topup-info — informasi metode top-up aktif & rekening sekolah */
import { q } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { wajibLogin } from "@/server/sesi";

export const GET = tangani(async (req) => {
  await wajibLogin(req);

  const baris = await q<{ kunci: string; nilai: unknown }>(
    `SELECT kunci, nilai FROM kebijakan 
      WHERE kunci IN (
        'topup_metode',
        'topup_bank_nama',
        'topup_bank_rekening',
        'topup_bank_atas_nama',
        'topup_bank_petunjuk',
        'topup_min_rp',
        'topup_max_rp'
      )`
  );

  const peta = new Map(baris.map((b) => [b.kunci, b.nilai]));

  return ok({
    metode: (peta.get("topup_metode") as string) || "verifikasi_admin",
    bank: {
      nama: (peta.get("topup_bank_nama") as string) || "Bank Central Asia (BCA)",
      rekening: (peta.get("topup_bank_rekening") as string) || "",
      atas_nama: (peta.get("topup_bank_atas_nama") as string) || "",
      petunjuk: (peta.get("topup_bank_petunjuk") as string) || "",
    },
    topup_min_rp: Number(peta.get("topup_min_rp") ?? 20000),
    topup_max_rp: Number(peta.get("topup_max_rp") ?? 500000),
  });
});
