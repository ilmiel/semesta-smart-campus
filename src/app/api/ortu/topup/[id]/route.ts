/** GET /api/ortu/topup/[id] — status top-up (tombol "cek status", PRD §13). */
import { satu } from "@/server/db";
import { HttpError, ok, tangani } from "@/server/http";
import { wajibLogin } from "@/server/sesi";

export const GET = tangani<{ id: string }>(async (req, { params }) => {
  const p = await wajibLogin(req);
  const id = Number((await params).id);
  const t = await satu<{ siswa_id: number }>(`SELECT id, siswa_id, nominal_rp, status, gateway, invoice_id, invoice_url, dibuat, kedaluwarsa, dibayar FROM topup WHERE id = $1`, [id]);
  if (!t || !p.wali.some((w) => w.siswaId === t.siswa_id)) throw new HttpError(404, "TIDAK_DITEMUKAN", "top-up tidak ditemukan");
  return ok(t);
});
