/**
 * POST /api/admin/akses/terminal-kunci
 *   { kode: string }
 * Menghubungkan browser admin dengan terminal: membuat kunci baru dan menyimpannya di DB.
 */
import { q, satu, skalar } from "@/server/db";
import { buatKunciDevice } from "@/server/device";
import { HttpError, ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "admin_it", "tu");
  const b = await bacaBody(req, v.obj({ kode: v.str({ min: 2, max: 20 }) }));

  const d = await satu<{ id: number; kode: string; nama: string; layanan: string; aktif: boolean }>(
    `SELECT id, kode, nama, layanan, aktif FROM device WHERE upper(kode) = upper($1)`,
    [b.kode.trim()]
  );
  if (!d) throw new HttpError(404, "DEVICE_TIDAK_ADA", `Terminal ${b.kode} tidak ditemukan`);

  const { kunci, hash } = buatKunciDevice();
  await q(`UPDATE device SET api_key_hash = $1, aktif = TRUE WHERE id = $2`, [hash, d.id]);

  await skalar("audit_catat", [
    aktor(p),
    "admin_terminal_hubungkan",
    `Auto-login kunci terminal ${d.kode} (${d.layanan})`,
    p.ip,
  ]);

  return ok({
    kode: d.kode,
    nama: d.nama,
    layanan: d.layanan,
    kunci,
  });
});
