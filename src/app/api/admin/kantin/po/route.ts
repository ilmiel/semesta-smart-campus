/**
 * GET  /api/admin/kantin/po?tanggal= — pesanan hari itu + rekap dapur (F-48).
 * POST /api/admin/kantin/po { aksi: "tutup_hari", tanggal? } — jalankan penutupan manual (F-49).
 */
import { fnSatu, q } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { wajibPeran } from "@/server/sesi";
import { bacaBody, bacaQuery, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req);
  const { tanggal } = bacaQuery(req, v.obj({ tanggal: v.tanggal().opsional() }));
  const [pesanan, dapur, jendela] = await Promise.all([
    q(`SELECT p.id, p.kode, p.status, p.total_rp, p.dipesan_oleh, p.dibuat, p.diambil_pada, s.nama, s.nis,
              (SELECT string_agg(i.qty || '× ' || i.nama, ', ' ORDER BY i.id) FROM po_item i WHERE i.po_id = p.id) AS item
         FROM po_pesanan p JOIN siswa s ON s.id = p.siswa_id WHERE p.tanggal = COALESCE($1::date, hari_ini()) ORDER BY p.id`, [tanggal ?? null]),
    q(`SELECT * FROM v_po_dapur WHERE tanggal = COALESCE($1::date, hari_ini()) ORDER BY qty DESC`, [tanggal ?? null]),
    fnSatu("po_jendela", []),
  ]);
  return ok({ pesanan, dapur, jendela });
});

export const POST = tangani(async (req) => {
  await wajibPeran(req, "tu", "admin_it", "keuangan", "manajemen");
  const b = await bacaBody(req, v.obj({ aksi: v.enum(["tutup_hari"] as const), tanggal: v.tanggal().opsional() }));
  return ok(await fnSatu("po_tutup_hari", [b.tanggal ?? null]));
});
