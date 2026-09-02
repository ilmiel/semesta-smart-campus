/**
 * GET   /api/admin/siswa/[nis] — halaman 360° (F-91). Peran tanpa hak uang: pola saja, tanpa rupiah.
 * PATCH /api/admin/siswa/[nis] { nama?, email?, jenjang?, boarding?, kelas? }
 */
import { fn, q, satu, skalar } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { siswaIdDariNis } from "@/server/siswa";
import { catatAudit } from "@/server/audit";
import { aktor, punyaPeran, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const GET = tangani<{ nis: string }>(async (req, { params }) => {
  const p = await wajibPeran(req);
  const { nis } = await params;
  const id = await siswaIdDariNis(nis);
  const uang = punyaPeran(p, "keuangan", "tu", "admin_it", "manajemen");
  const [siswa, kartu, wali, pin, riwayat, kelas, pinjaman, laundry, loker, tagihan, po, limit] = await Promise.all([
    satu(`SELECT * FROM v_siswa WHERE id = $1`, [id]),
    q(`SELECT id, uid, status, terbit, dicabut, alasan FROM kartu WHERE siswa_id = $1 ORDER BY id DESC`, [id]),
    q(`SELECT id, nama, hubungan, whatsapp, email, utama FROM wali WHERE siswa_id = $1 ORDER BY utama DESC, id`, [id]),
    fn("pin_info", [id]),
    uang ? q(`SELECT * FROM v_riwayat_siswa WHERE siswa_id = $1 ORDER BY waktu DESC LIMIT 60`, [id])
         : q(`SELECT waktu, layanan, jenis, item FROM v_riwayat_siswa WHERE siswa_id = $1 AND jenis = 'belanja' ORDER BY waktu DESC LIMIT 60`, [id]),
    q(`SELECT pk.kelas, ta.kode AS tahun_ajaran, pk.wali_email FROM penempatan_kelas pk JOIN tahun_ajaran ta ON ta.id = pk.tahun_ajaran_id WHERE pk.siswa_id = $1 ORDER BY ta.mulai DESC`, [id]),
    q(`SELECT * FROM v_pinjaman_aktif WHERE siswa_id = $1`, [id]),
    q(`SELECT * FROM v_laundry_aktif WHERE siswa_id = $1`, [id]),
    satu(`SELECT * FROM v_loker_peta WHERE siswa_id = $1`, [id]),
    q(`SELECT id, sumber, keterangan, nominal_rp, status, dibuat FROM tagihan WHERE siswa_id = $1 ORDER BY id DESC LIMIT 20`, [id]),
    q(`SELECT id, kode, tanggal, status, total_rp FROM po_pesanan WHERE siswa_id = $1 ORDER BY id DESC LIMIT 10`, [id]),
    satu(`SELECT limit_harian_efektif($1) AS efektif_rp, kebijakan_int('limit_harian_rp') AS plafon_rp, belanja_hari($1, hari_ini()) AS terpakai_rp,
                 (SELECT jsonb_agg(jsonb_build_object('wali_id', wali_id, 'limit_rp', limit_harian_rp)) FROM limit_wali WHERE siswa_id = $1) AS dari_wali`, [id]),
  ]);
  await catatAudit(aktor(p), p.peran.join(","), "lihat_siswa", `siswa:${id}`, undefined, p.ip);   // §8.1 log akses data anak
  const { hash: _h, ...pinAman } = (pin[0] ?? {}) as Record<string, unknown>;   // hash TIDAK pernah keluar
  void _h;
  return ok({
    siswa: uang ? siswa : { ...siswa, saldo_rp: null, limit_harian_rp: null },
    kartu, wali, pin: pinAman, riwayat, kelas, pinjaman, laundry, loker, po,
    tagihan: uang ? tagihan : tagihan.map((t) => ({ ...t, nominal_rp: null })),
    limit: uang ? limit : null,
  });
});

export const PATCH = tangani<{ nis: string }>(async (req, { params }) => {
  const p = await wajibPeran(req, "tu", "admin_it");
  const id = await siswaIdDariNis((await params).nis);
  const b = await bacaBody(req, v.obj({
    nama: v.str({ min: 2, max: 100 }).opsional(), email: v.email().nullable(), jenjang: v.enum(["SMP", "SMA"] as const).opsional(),
    boarding: v.bool().opsional(), kelas: v.str({ max: 10 }).opsional(),
  }));
  await skalar("siswa_ubah", [id, b.nama ?? null, b.email ?? null, b.jenjang ?? null, b.boarding ?? null, b.kelas ?? null, aktor(p)]);
  return ok({ id });
});
