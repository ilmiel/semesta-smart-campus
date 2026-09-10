/** GET (log 30 hari + posisi float §8.4) / POST (jalankan sekarang) — F-15. */
import { fnSatu, q } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { catatAudit } from "@/server/audit";

export const GET = tangani(async (req) => {
  await wajibPeran(req, "keuangan", "admin_it", "manajemen");
  const [log, akun, floatSiswa] = await Promise.all([
    q(`SELECT * FROM rekonsiliasi_log ORDER BY id DESC LIMIT 30`),
    q(`SELECT jenis, nama, saldo_rp, jumlah_entri FROM saldo_ledger WHERE jenis <> 'siswa' ORDER BY jenis, nama`),
    q(`SELECT COALESCE(SUM(saldo_rp), 0)::bigint AS total_float_rp, COUNT(*)::int AS jumlah_siswa FROM siswa WHERE status = 'aktif'`),
  ]);
  return ok({ log, akun_sistem: akun, float_siswa: floatSiswa[0] });
});

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "keuangan", "admin_it");
  const r = await fnSatu("rekonsiliasi_malam", []);
  await catatAudit(aktor(p), "keuangan", "rekonsiliasi_manual", null, undefined, p.ip);
  return ok(r);
});
