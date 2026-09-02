/** GET tagihan menunggu; POST { id, aksi: "bebaskan"|"bayar", alasan? } */
import { q, skalar } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req, "keuangan", "tu", "manajemen", "pustakawan", "asrama");
  return ok({ tagihan: await q(`SELECT t.*, s.nama, s.nis FROM tagihan t JOIN siswa s ON s.id = t.siswa_id WHERE t.status = 'menunggu' ORDER BY t.id DESC`) });
});

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "keuangan", "tu");
  const b = await bacaBody(req, v.obj({ id: v.id(), aksi: v.enum(["bebaskan", "bayar"] as const), alasan: v.str({ max: 200 }).opsional() }));
  if (b.aksi === "bebaskan") { await skalar("tagihan_bebaskan", [b.id, aktor(p), b.alasan ?? ""]); return ok({ id: b.id, status: "dibebaskan" }); }
  return ok({ id: b.id, transaksi_id: await skalar<number>("tagihan_bayar", [b.id, aktor(p)]) });
});
