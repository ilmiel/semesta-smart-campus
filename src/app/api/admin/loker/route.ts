/**
 * GET  /api/admin/loker?blok= — peta loker (F-60).
 * POST { aksi: "blok", blok, dari, sampai, lokasi, device_kode? }
 *      { aksi: "tugaskan", loker, siswa_id, catatan? } | { aksi: "lepas", loker, alasan? }
 *      { aksi: "kondisi", loker, kondisi, catatan? }   | { aksi: "denda", loker, siswa_id, nominal_rp, alasan } (F-61: keputusan manusia → tagihan)
 */
import { q, skalar } from "@/server/db";
import { HttpError, ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, bacaQuery, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req);
  const { blok } = bacaQuery(req, v.obj({ blok: v.str({ max: 5 }).opsional() }));
  const [peta, ringkas, akses] = await Promise.all([
    q(`SELECT * FROM v_loker_peta WHERE ($1::text IS NULL OR blok = $1) ORDER BY blok, nomor`, [blok ?? null]),
    q(`SELECT blok, COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'isi') AS isi, COUNT(*) FILTER (WHERE status = 'kosong') AS kosong, COUNT(*) FILTER (WHERE status = 'rusak') AS rusak FROM v_loker_peta GROUP BY blok ORDER BY blok`),
    q(`SELECT a.waktu, l.kode AS loker, a.kartu_uid, s.nama, a.berhasil, a.alasan FROM akses_loker a JOIN loker l ON l.id = a.loker_id LEFT JOIN siswa s ON s.id = a.siswa_id
        WHERE ($1::text IS NULL OR l.blok = $1) AND a.waktu > now() - interval '24 hours' ORDER BY a.waktu DESC LIMIT 200`, [blok ?? null]),
  ]);
  return ok({ peta, ringkas, akses_24jam: akses });
});

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "asrama", "tu", "admin_it");
  const b = await bacaBody(req, v.obj({
    aksi: v.enum(["blok", "tugaskan", "lepas", "kondisi", "denda"] as const),
    blok: v.str({ max: 5 }).opsional(), dari: v.int({ min: 1 }).opsional(), sampai: v.int({ min: 1, max: 999 }).opsional(), lokasi: v.str({ max: 80 }).opsional(), device_kode: v.str({ max: 20 }).opsional(),
    loker: v.str({ max: 12 }).opsional(), siswa_id: v.id().opsional(), catatan: v.str({ max: 200 }).opsional(), alasan: v.str({ max: 200 }).opsional(),
    kondisi: v.enum(["baik", "rusak", "perbaikan"] as const).opsional(), nominal_rp: v.rupiah({ min: 1 }).opsional(),
  }));
  const a = aktor(p);
  switch (b.aksi) {
    case "blok":
      if (!b.blok || !b.dari || !b.sampai) throw new HttpError(400, "VALIDASI", "blok, dari, sampai wajib");
      return ok({ dibuat: await skalar<number>("loker_buat_blok", [b.blok.toUpperCase(), b.dari, b.sampai, b.lokasi ?? null, b.device_kode ?? null, a]) });
    case "tugaskan":
      if (!b.loker || !b.siswa_id) throw new HttpError(400, "VALIDASI", "loker & siswa_id wajib");
      return ok({ penugasan_id: await skalar<number>("loker_tugaskan", [b.loker.toUpperCase(), b.siswa_id, a, b.catatan ?? null]) });
    case "lepas":
      if (!b.loker) throw new HttpError(400, "VALIDASI", "loker wajib");
      await skalar("loker_lepas", [b.loker.toUpperCase(), a, b.alasan ?? null]); return ok({ loker: b.loker, dilepas: true });
    case "kondisi":
      if (!b.loker || !b.kondisi) throw new HttpError(400, "VALIDASI", "loker & kondisi wajib");
      await skalar("loker_kondisi", [b.loker.toUpperCase(), b.kondisi, a, b.catatan ?? null]); return ok({ loker: b.loker, kondisi: b.kondisi });
    case "denda":
      if (!b.loker || !b.siswa_id || !b.nominal_rp) throw new HttpError(400, "VALIDASI", "loker, siswa_id, nominal_rp wajib");
      return ok({ tagihan_id: await skalar<number>("loker_denda", [b.loker.toUpperCase(), b.siswa_id, b.nominal_rp, b.alasan ?? "", a]) });
  }
});
