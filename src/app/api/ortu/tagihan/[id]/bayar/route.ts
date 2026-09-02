/** POST /api/ortu/tagihan/[id]/bayar — bayar tagihan menunggu (denda perpus/loker) dari saldo anak. */
import { ok, tangani } from "@/server/http";
import { bayarTagihan } from "@/server/portal";
import { wajibLogin } from "@/server/sesi";

export const POST = tangani<{ id: string }>(async (req, { params }) => {
  const p = await wajibLogin(req);
  const id = Number((await params).id);
  return ok(await bayarTagihan(id, p.wali.map((w) => w.siswaId), p.email));
});
