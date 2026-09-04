/**
 * Logika bersama portal orang tua & siswa (F-100–F-103).
 * Semua fungsi menerima siswaId yang SUDAH diotorisasi oleh route
 * (wajibWaliDari / wajibSiswa) — di sini tidak ada cek ulang kepemilikan,
 * jadi jangan pernah memanggilnya dengan id dari input pengguna langsung.
 */
import { fnSatu, q, satu, skalar } from "./db";
import { HttpError } from "./http";

export async function ringkasanSiswa(siswaId: number) {
  const [siswa, tagihan, po, pinjaman, laundry, loker, limit] = await Promise.all([
    // `pin_harus_ganti` ikut dikirim supaya portal bisa memberi tahu siswa
    // bahwa PIN-nya masih PIN sementara dari TU — PIN yang diucapkan di meja
    // dan berlaku penuh sampai diganti. Hash-nya tentu tidak ikut.
    satu(`SELECT id, nis, nama, kelas, jenjang, boarding, status, kartu, saldo_rp, pin_terkunci, pin_ada, limit_harian_rp,
                 (SELECT harus_ganti FROM pin_siswa WHERE siswa_id = $1) AS pin_harus_ganti
            FROM v_siswa WHERE id = $1`, [siswaId]),
    q(`SELECT id, sumber, keterangan, nominal_rp, dibuat FROM tagihan WHERE siswa_id = $1 AND status = 'menunggu' ORDER BY id`, [siswaId]),
    q(`SELECT p.id, p.kode, p.tanggal, p.status, p.total_rp, p.dibuat,
              (SELECT string_agg(i.qty || '× ' || i.nama, ', ' ORDER BY i.id) FROM po_item i WHERE i.po_id = p.id) AS item
         FROM po_pesanan p WHERE p.siswa_id = $1 AND p.tanggal >= hari_ini() - 7 ORDER BY p.id DESC`, [siswaId]),
    q(`SELECT id, judul, pengarang, dipinjam, jatuh_tempo, hari_telat, diperpanjang FROM v_pinjaman_aktif WHERE siswa_id = $1 ORDER BY jatuh_tempo`, [siswaId]),
    q(`SELECT id, kode, status, total_rp, rak, dibuat, siap_pada, item FROM v_laundry_aktif WHERE siswa_id = $1 ORDER BY dibuat DESC`, [siswaId]),
    satu(`SELECT kode, blok, nomor, lokasi, kondisi, akses_terakhir FROM v_loker_peta WHERE siswa_id = $1`, [siswaId]),
    satu<{ limit_harian_rp: number; plafon_rp: number; terpakai_rp: number }>(
      `SELECT limit_harian_efektif($1) AS limit_harian_rp, kebijakan_int('limit_harian_rp') AS plafon_rp, belanja_hari($1, hari_ini()) AS terpakai_rp`, [siswaId]),
  ]);
  if (!siswa) throw new HttpError(404, "TIDAK_DITEMUKAN", "siswa tidak ditemukan");
  return { siswa, limit, tagihan, po, pinjaman, laundry, loker: loker ?? null };
}

export async function riwayatSiswa(siswaId: number, bulan?: string, limit = 100) {
  // bulan: 'YYYY-MM' (waktu sekolah)
  return q(
    `SELECT id, kode, jenis, status, layanan, total_rp, arah_rp, keterangan, item, waktu, device, device_nama, offline, pakai_pin, ref_transaksi_id, direfund_rp
       FROM v_riwayat_siswa
      WHERE siswa_id = $1 AND status IN ('selesai', 'pending')
        AND ($2::text IS NULL OR to_char(waktu AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') = $2)
      ORDER BY waktu DESC, id DESC LIMIT $3`, [siswaId, bulan ?? null, limit]);
}

export async function jendelaPO() {
  const [j, menu] = await Promise.all([
    fnSatu<{ buka: boolean; alasan: string | null; jam_buka: string; jam_tutup: string; ambil_mulai: string; ambil_selesai: string }>("po_jendela", []),
    q(`SELECT id, nama, harga_rp, kategori, foto_url FROM v_menu_aktif WHERE po_bisa`),
  ]);
  return { ...j, menu };
}

export async function buatPO(siswaId: number, oleh: string, items: { menu_id: number; qty: number }[], catatan?: string) {
  return fnSatu("po_buat", [siswaId, oleh, JSON.stringify(items), catatan ?? null]);
}

export async function batalPO(poId: number, siswaId: number, oleh: string) {
  const po = await satu<{ siswa_id: number }>(`SELECT siswa_id FROM po_pesanan WHERE id = $1`, [poId]);
  if (!po || po.siswa_id !== siswaId) throw new HttpError(404, "TIDAK_DITEMUKAN", "PO tidak ditemukan");   // F-103: tidak bocor lintas siswa
  const refund_id = await skalar<number>("po_batal", [poId, oleh]);
  return { refund_id };
}

/** Lapor kartu hilang dari portal (F-102): blokir seketika, TU bisa membuka kembali. */
export async function blokirKartu(siswaId: number, oleh: string) {
  const k = await satu<{ id: number; uid: string }>(`SELECT id, uid FROM kartu WHERE siswa_id = $1 AND status = 'aktif'`, [siswaId]);
  if (!k) throw new HttpError(409, "TIDAK_ADA_KARTU_AKTIF", "tidak ada kartu aktif untuk diblokir");
  await skalar("kartu_cabut", [k.id, "hilang", oleh, "lapor hilang dari portal"]);
  return { kartu_id: k.id, status: "hilang" };
}

export async function bayarTagihan(tagihanId: number, siswaIdBoleh: number[], oleh: string) {
  const t = await satu<{ siswa_id: number }>(`SELECT siswa_id FROM tagihan WHERE id = $1`, [tagihanId]);
  if (!t || !siswaIdBoleh.includes(t.siswa_id)) throw new HttpError(404, "TIDAK_DITEMUKAN", "tagihan tidak ditemukan");
  const transaksi_id = await skalar<number>("tagihan_bayar", [tagihanId, oleh]);
  return { transaksi_id };
}

export async function ajukanSengketaVending(transaksiId: number, siswaId: number, oleh: string, catatan: string) {
  const id = await skalar<number>("vending_sengketa", [transaksiId, siswaId, oleh, catatan]);
  return { sengketa_id: id };
}

export async function riwayatBacaan(siswaId: number) {
  return q(`SELECT judul, pengarang, kategori, dipinjam, jatuh_tempo, dikembalikan, masih_dipinjam, terlambat
              FROM v_riwayat_bacaan WHERE siswa_id = $1 ORDER BY dipinjam DESC LIMIT 200`, [siswaId]);
}
