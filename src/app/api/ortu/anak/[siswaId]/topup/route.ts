/** POST /api/ortu/anak/[siswaId]/topup — membuat permintaan top-up (transfer manual atau gateway) */
import { satu, skalar } from "@/server/db";
import { HttpError, ok, tangani } from "@/server/http";
import { wajibWaliDari } from "@/server/sesi";
import { mulaiTopup } from "@/server/topup";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani<{ siswaId: string }>(async (req, { params }) => {
  const siswaId = Number((await params).siswaId);
  const { waliId } = await wajibWaliDari(req, siswaId);
  const b = await bacaBody(
    req,
    v.obj({
      nominal_rp: v.rupiah({ min: 1000 }),
      metode: v.str({ max: 30 }).opsional(),
      bukti_foto: v.str({ max: 5_000_000 }).opsional(), // Data URL base64 gambar
      catatan: v.str({ max: 200 }).opsional(),
    })
  );

  const rowMetode = await satu<{ nilai: string }>(
    "SELECT nilai #>> '{}' AS nilai FROM kebijakan WHERE kunci = 'topup_metode'"
  );
  const metodeAktif = rowMetode?.nilai || "verifikasi_admin";

  const metodePilihan = b.metode || metodeAktif;

  if (metodePilihan === "verifikasi_admin" || b.bukti_foto) {
    if (!b.bukti_foto || b.bukti_foto.length < 20) {
      throw new HttpError(400, "VALIDASI", "Bukti transfer pembayaran wajib diunggah.");
    }
    const tid = await skalar<number>("topup_buat_transfer", [
      siswaId,
      b.nominal_rp,
      b.bukti_foto,
      b.catatan?.trim() || null,
      `wali:${waliId}`,
    ]);
    return ok({
      topup_id: tid,
      metode: "verifikasi_admin",
      status: "menunggu",
      nominal_rp: b.nominal_rp,
    });
  }

  // Alur online payment gateway
  return ok(await mulaiTopup({ siswaId, waliId, nominalRp: b.nominal_rp, oleh: `wali:${waliId}` }));
});
