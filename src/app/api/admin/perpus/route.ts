/**
 * GET  /api/admin/perpus?q= — pinjaman aktif (denda berjalan), buku populer, katalog (cari).
 * POST { aksi: "buku", judul, pengarang?, kategori?, isbn?, rak?, referensi?, jumlah_eksemplar, prefix_barcode }
 *      { aksi: "bebaskan", pinjaman_id, alasan } | { aksi: "hilang", barcode, nominal_ganti, alasan }
 *      { aksi: "aturan", jenjang, maks_buku, lama_hari, denda_per_hari, maks_denda_rp }
 */
import { q, skalar } from "@/server/db";
import { catatAudit } from "@/server/audit";
import { HttpError, ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, bacaQuery, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req, "pustakawan", "manajemen", "admin_it", "kesiswaan", "wali_kelas");
  const { q: cari } = bacaQuery(req, v.obj({ q: v.str({ max: 60 }).opsional() }));
  const [aktif, populer, katalog, aturan] = await Promise.all([
    q(`SELECT * FROM v_pinjaman_aktif ORDER BY hari_telat DESC, jatuh_tempo`),
    q(`SELECT * FROM v_buku_populer ORDER BY dipinjam_30hari DESC, kali_dipinjam DESC LIMIT 20`),
    q(`SELECT b.id, b.judul, b.pengarang, b.kategori, b.rak, b.referensi,
              COUNT(e.id) AS eksemplar, COUNT(e.id) FILTER (WHERE e.status = 'tersedia') AS tersedia
         FROM buku b LEFT JOIN eksemplar e ON e.buku_id = b.id
        WHERE ($1::text IS NULL OR b.judul ILIKE '%' || $1 || '%' OR b.pengarang ILIKE '%' || $1 || '%' OR b.isbn = $1)
        GROUP BY b.id ORDER BY b.judul LIMIT 200`, [cari ?? null]),
    q(`SELECT * FROM aturan_pinjam ORDER BY jenjang`),
  ]);
  return ok({ pinjaman_aktif: aktif, populer, katalog, aturan });
});

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "pustakawan", "admin_it");
  const b = await bacaBody(req, v.obj({
    aksi: v.enum(["buku", "bebaskan", "hilang", "aturan"] as const),
    judul: v.str({ max: 200 }).opsional(), pengarang: v.str({ max: 120 }).opsional(), kategori: v.str({ max: 60 }).opsional(), isbn: v.str({ max: 20 }).opsional(),
    rak: v.str({ max: 20 }).opsional(), referensi: v.bool().opsional(), jumlah_eksemplar: v.int({ min: 0, max: 100 }).opsional(), prefix_barcode: v.str({ max: 20, pola: /^[A-Za-z0-9-]+$/ }).opsional(),
    pinjaman_id: v.id().opsional(), alasan: v.str({ max: 200 }).opsional(), barcode: v.str({ max: 40 }).opsional(), nominal_ganti: v.rupiah().opsional(),
    jenjang: v.str({ max: 5 }).opsional(), maks_buku: v.int({ min: 1, max: 20 }).opsional(), lama_hari: v.int({ min: 1, max: 60 }).opsional(), denda_per_hari: v.rupiah().opsional(), maks_denda_rp: v.rupiah().opsional(),
  }));
  const a = aktor(p);
  switch (b.aksi) {
    case "buku":
      if (!b.judul || !b.prefix_barcode) throw new HttpError(400, "VALIDASI", "judul & prefix_barcode wajib");
      return ok({ buku_id: await skalar<number>("buku_tambah", [b.judul, b.pengarang ?? null, b.kategori ?? null, b.isbn ?? null, b.rak ?? null, b.referensi ?? false, b.jumlah_eksemplar ?? 1, b.prefix_barcode.toUpperCase(), a]) });
    case "bebaskan":
      if (!b.pinjaman_id) throw new HttpError(400, "VALIDASI", "pinjaman_id wajib");
      await skalar("perpus_bebaskan_denda", [b.pinjaman_id, a, b.alasan ?? ""]); return ok({ pinjaman_id: b.pinjaman_id, dibebaskan: true });
    case "hilang":
      if (!b.barcode) throw new HttpError(400, "VALIDASI", "barcode wajib");
      return ok({ tagihan_id: await skalar<number | null>("perpus_hilang", [b.barcode, b.nominal_ganti ?? 0, a, b.alasan ?? null]) });
    case "aturan": {
      if (!b.jenjang || !b.maks_buku || !b.lama_hari || b.denda_per_hari === undefined || b.maks_denda_rp === undefined) throw new HttpError(400, "VALIDASI", "jenjang, maks_buku, lama_hari, denda_per_hari, maks_denda_rp wajib");
      await q(`INSERT INTO aturan_pinjam (jenjang, maks_buku, lama_hari, denda_per_hari, maks_denda_rp) VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (jenjang) DO UPDATE SET maks_buku = EXCLUDED.maks_buku, lama_hari = EXCLUDED.lama_hari, denda_per_hari = EXCLUDED.denda_per_hari, maks_denda_rp = EXCLUDED.maks_denda_rp`,
              [b.jenjang, b.maks_buku, b.lama_hari, b.denda_per_hari, b.maks_denda_rp]);
      await catatAudit(a, "pustakawan", "ubah_aturan_pinjam", `aturan_pinjam:${b.jenjang}`, { maks_buku: b.maks_buku, lama_hari: b.lama_hari, denda_per_hari: b.denda_per_hari, maks_denda_rp: b.maks_denda_rp }, p.ip);
      return ok({ jenjang: b.jenjang });
    }
  }
});
