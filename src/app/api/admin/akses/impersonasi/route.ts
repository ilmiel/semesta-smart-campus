/**
 * POST /api/admin/akses/impersonasi
 *   { tipe: "siswa" | "ortu", id: number }
 * Mengaktifkan mode impersonasi/pengecekan untuk admin_it / tu.
 */
import { satu, skalar } from "@/server/db";
import { HttpError, ok, tangani } from "@/server/http";
import { aktor, buatTokenImpersonasi, COOKIE_IMPERSONASI, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "admin_it", "tu");
  const b = await bacaBody(req, v.obj({
    tipe: v.enum(["siswa", "ortu"] as const),
    id: v.id(),
  }));

  let targetNama = "";
  if (b.tipe === "siswa") {
    const s = await satu<{ id: number; nama: string; nis: string }>(
      `SELECT id, nama, nis FROM siswa WHERE id = $1`, [b.id]
    );
    if (!s) throw new HttpError(404, "SISWA_TIDAK_ADA", "Data siswa tidak ditemukan");
    targetNama = `${s.nama} (${s.nis})`;
  } else {
    const w = await satu<{ id: number; nama: string; email: string | null }>(
      `SELECT id, nama, email FROM wali WHERE id = $1`, [b.id]
    );
    if (!w) throw new HttpError(404, "WALI_TIDAK_ADA", "Data wali tidak ditemukan");
    targetNama = `${w.nama} (${w.email ?? "tanpa email"})`;
  }

  const token = buatTokenImpersonasi({ tipe: b.tipe, id: b.id, adminEmail: p.email });

  // Catat jejak audit aktivasi mode pengecekan
  await skalar("audit_catat", [
    aktor(p),
    "admin_impersonasi_mulai",
    `Mode pengecekan ${b.tipe}: ${targetNama}`,
    p.ip,
  ]);

  const targetUrl = b.tipe === "siswa" ? "/siswa" : "/ortu";
  const res = ok({
    ok: true,
    redirect: targetUrl,
    pesan: `Mode pengecekan aktif sebagai ${targetNama}`,
  });

  res.headers.append(
    "set-cookie",
    `${COOKIE_IMPERSONASI}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200`
  );

  return res;
});
