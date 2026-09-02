/** GET/POST /api/admin/kantin/menu — kelola menu (F-41). POST { id?, nama, kategori_id?, harga_rp, aktif?, po_bisa?, foto_url? } */
import { q, skalar } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req);
  const [menu, kategori] = await Promise.all([
    q(`SELECT m.*, k.nama AS kategori FROM menu m LEFT JOIN kategori_menu k ON k.id = m.kategori_id ORDER BY k.urutan, m.nama`),
    q(`SELECT * FROM kategori_menu ORDER BY urutan`),
  ]);
  return ok({ menu, kategori });
});

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "tu", "admin_it", "manajemen");
  const b = await bacaBody(req, v.obj({
    id: v.id().opsional(), nama: v.str({ min: 2, max: 80 }), kategori_id: v.int({ min: 1 }).opsional(),
    harga_rp: v.rupiah({ min: 100 }), aktif: v.bool().opsional(), po_bisa: v.bool().opsional(), foto_url: v.str({ max: 300 }).opsional(),
  }));
  const id = await skalar<number>("menu_simpan", [b.id ?? null, b.nama, b.kategori_id ?? null, b.harga_rp, b.aktif ?? null, b.po_bisa ?? null, b.foto_url ?? null, aktor(p)]);
  return ok({ id });
});
