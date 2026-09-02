/**
 * POST /api/admin/keuangan/topup-tunai { siswa_id, nominal_rp, disetujui_oleh, catatan? } — F-23.
 * Yang login = yang menginput; `disetujui_oleh` = email staf kedua (harus berbeda, dicek DB).
 * Persetujuan kedua idealnya lewat login staf kedua di layar yang sama (fase berikut);
 * sekarang: email staf kedua + audit yang mencatat keduanya.
 */
import { fnSatu } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "tu", "keuangan");
  const b = await bacaBody(req, v.obj({ siswa_id: v.id(), nominal_rp: v.rupiah({ min: 1000 }), disetujui_oleh: v.email(), catatan: v.str({ max: 200 }).opsional() }));
  return ok(await fnSatu("topup_tunai", [b.siswa_id, b.nominal_rp, aktor(p), b.disetujui_oleh, b.catatan ?? null]));
});
