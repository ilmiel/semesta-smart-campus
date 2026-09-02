/** GET sengketa vending menunggu; POST { id, kabulkan, keputusan } — dicocokkan dengan log sensor (F-116). */
import { q, skalar } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req, "keuangan", "admin_it", "manajemen");
  return ok({ sengketa: await q(`SELECT g.*, s.nama, s.nis, t.total_rp, t.waktu_terminal FROM sengketa_vending g JOIN siswa s ON s.id = g.siswa_id JOIN transaksi t ON t.id = g.transaksi_id ORDER BY g.status = 'menunggu' DESC, g.id DESC LIMIT 200`) });
});

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "keuangan");
  const b = await bacaBody(req, v.obj({ id: v.id(), kabulkan: v.bool(), keputusan: v.str({ min: 3, max: 300 }) }));
  return ok({ refund_transaksi_id: await skalar<number | null>("vending_sengketa_putus", [b.id, b.kabulkan, aktor(p), b.keputusan]) });
});
