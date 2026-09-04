/**
 * GET/POST/PATCH /api/admin/kantin/menu — kelola menu (F-41).
 *
 * POST  { id?, nama, kategori_id?, harga_rp, aktif?, po_bisa?, foto_url? }
 *       Buat atau ubah menu sepenuhnya; menegakkan aturan data baru.
 * PATCH { id, aktif?, po_bisa? }
 *       Hidupkan/matikan penjualan atau jalur PO saja. Sengaja TIDAK lewat
 *       menu_simpan: baris lama bisa saja melanggar aturan yang berlaku
 *       sekarang (harga bukan kelipatan Rp 100, nama terlalu pendek), dan
 *       menghentikan penjualannya justru hal yang paling mendesak saat ada
 *       masalah. Aturan baru tidak boleh mengunci data lama.
 */
import { q, skalar } from "@/server/db";
import { HttpError, ok, tangani } from "@/server/http";
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

export const PATCH = tangani(async (req) => {
  const p = await wajibPeran(req, "tu", "admin_it", "manajemen");
  const b = await bacaBody(req, v.obj({
    id: v.id(), aktif: v.bool().opsional(), po_bisa: v.bool().opsional(),
  }));
  if (b.aktif === undefined && b.po_bisa === undefined) {
    throw new HttpError(400, "VALIDASI", "aktif atau po_bisa wajib diisi salah satu");
  }
  await skalar("menu_status", [b.id, b.aktif ?? null, b.po_bisa ?? null, aktor(p)]);
  return ok({ id: b.id, aktif: b.aktif, po_bisa: b.po_bisa });
});
