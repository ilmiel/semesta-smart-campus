import { ok, tangani } from "@/server/http";
import { batalPO } from "@/server/portal";
import { wajibSiswa } from "@/server/sesi";

export const DELETE = tangani<{ poId: string }>(async (req, { params }) => {
  const p = await wajibSiswa(req);
  return ok(await batalPO(Number((await params).poId), p.siswa.id, "siswa"));
});
