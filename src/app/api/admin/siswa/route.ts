/**
 * GET  /api/admin/siswa?q=&status=&kelas=&kartu=   — daftar (F-91). Kesiswaan/wali kelas: tanpa saldo.
 * POST /api/admin/siswa { nis, nama, email?, jenjang, boarding, kelas? } — tambah (TU/admin IT).
 */
import { q, skalar } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { aktor, punyaPeran, wajibPeran } from "@/server/sesi";
import { bacaBody, bacaQuery, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  const p = await wajibPeran(req);
  const f = bacaQuery(req, v.obj({
    q: v.str({ max: 60 }).opsional(), status: v.str({ max: 10 }).opsional(), kelas: v.str({ max: 10 }).opsional(),
    kartu: v.str({ max: 10 }).opsional(), limit: v.int({ min: 1, max: 1000 }).default(200),
  }));
  const rows = await q(
    `SELECT * FROM v_siswa
      WHERE ($1::text IS NULL OR nama ILIKE '%' || $1 || '%' OR nis ILIKE $1 || '%')
        AND ($2::text IS NULL OR status::text = $2) AND ($3::text IS NULL OR kelas = $3) AND ($4::text IS NULL OR kartu = $4)
      ORDER BY kelas NULLS LAST, nama LIMIT $5`, [f.q ?? null, f.status ?? null, f.kelas ?? null, f.kartu ?? null, f.limit]);
  const uang = punyaPeran(p, "keuangan", "tu", "admin_it", "manajemen");
  // Audit §2.6: `uid` kartu adalah KREDENSIAL — di bawah ambang_pin_rp,
  // bayar() memotong saldo hanya berbekal UID, tanpa PIN. Sebelumnya
  // v_siswa dikirim apa adanya ke semua peran staf, sehingga seorang kasir
  // bisa mengunduh seribu UID lalu memotong saldo siswa mana pun dari
  // terminal kantin. Email siswa juga hanya urusan TU/IT.
  const identitas = punyaPeran(p, "tu", "admin_it");
  return ok({
    siswa: rows.map((r) => ({
      ...r,
      ...(uang ? {} : { saldo_rp: null, limit_harian_rp: null }),
      ...(identitas ? {} : { uid: null, email: null }),
    })),
  });
});

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "tu", "admin_it");
  const b = await bacaBody(req, v.obj({
    nis: v.str({ min: 3, max: 20 }), nama: v.str({ min: 2, max: 100 }), email: v.email().opsional(),
    jenjang: v.enum(["SMP", "SMA"] as const), boarding: v.bool().default(true), kelas: v.str({ max: 10 }).opsional(),
  }));
  const id = await skalar<number>("siswa_tambah", [b.nis, b.nama, b.email ?? null, b.jenjang, b.boarding, b.kelas ?? null, aktor(p)]);
  return ok({ id });
});
