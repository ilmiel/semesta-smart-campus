-- =====================================================================
-- UJI LOKER (F-60–F-62) — gratis, akses tanpa PIN, tanpa ledger
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;
SELECT uji_berkas('04_loker');
-- Keluaran per-pernyataan disenyapkan oleh pemanggil (migrate.sh / harness),
-- bukan oleh `\o /dev/null` — perintah itu hanya ada di Unix dan membuat
-- seluruh suite gagal di Windows, padahal tim IT sekolah memakai Windows.

SELECT uji_sama('buat blok A 1–5', loker_buat_blok('A', 1, 5, 'Asrama Putra lt.1', 'LOKER-A', 'asrama@semesta.sch.id'), 5);
SELECT uji_sama('kode loker A-003', (SELECT kode FROM loker WHERE blok = 'A' AND nomor = 3), 'A-003');
SELECT uji_gagal('controller tak dikenal ditolak', $$SELECT loker_buat_blok('Z', 1, 2, 'x', 'KANTIN-01', 'x')$$, 'DEVICE_TIDAK_DIKENAL');

SELECT loker_tugaskan('A-003', 1, 'asrama@semesta.sch.id') AS p1 \gset
SELECT uji_gagal('loker terisi tidak bisa diberikan ke siswa lain', $$SELECT loker_tugaskan('A-003', 2, 'x')$$, 'LOKER_TERISI');
SELECT uji_gagal('siswa sudah punya loker tahun ini', $$SELECT loker_tugaskan('A-004', 1, 'x')$$, 'SISWA_SUDAH_PUNYA_LOKER');
SELECT uji_gagal('loker tak ada', $$SELECT loker_tugaskan('Q-999', 2, 'x')$$, 'TIDAK_DITEMUKAN');
SELECT uji_gagal('siswa keluar tidak dapat loker', $$SELECT loker_tugaskan('A-004', 4, 'x')$$, 'SISWA_NONAKTIF');
SELECT uji_gagal('DB: dua penghuni satu loker ditolak', $$INSERT INTO penugasan_loker (loker_id, siswa_id, tahun_ajaran_id) VALUES ((SELECT id FROM loker WHERE kode='A-003'), 2, 1)$$, 'loker_satu_penghuni');

-- buka
SELECT uji_ok('pemilik tap → terbuka', (SELECT buka FROM loker_buka('LOKER-A', 'A-003', '04a1b2c3d4e5f6')));
SELECT uji_sama('siswa lain → ditolak dgn alasan', (SELECT alasan FROM loker_buka('LOKER-A', 'A-003', '04FFEE11223344')), 'bukan loker siswa ini');
SELECT uji_sama('kartu hilang → ditolak', (SELECT alasan FROM loker_buka('LOKER-A', 'A-003', '04C0FFEE000001')), 'kartu diblokir (hilang)');
SELECT uji_sama('kartu asing → ditolak', (SELECT alasan FROM loker_buka('LOKER-A', 'A-003', '0400000000AAAA')), 'kartu tidak dikenal');
SELECT uji_sama('controller lain → ditolak', (SELECT alasan FROM loker_buka('KANTIN-01', 'A-003', '04A1B2C3D4E5F6')), 'loker bukan milik controller ini');
SELECT uji_sama('loker tak dikenal → ditolak (bukan exception)', (SELECT alasan FROM loker_buka('LOKER-A', 'A-999', '04A1B2C3D4E5F6')), 'loker tidak dikenal');
SELECT uji_sama('setiap percobaan tercatat (5 dengan loker valid)', (SELECT COUNT(*) FROM akses_loker WHERE loker_id = (SELECT id FROM loker WHERE kode = 'A-003'))::int, 5);
SELECT uji_sama('peta: A-003 isi oleh Rafif', (SELECT status || ':' || nama FROM v_loker_peta WHERE kode = 'A-003'), 'isi:Rafif Gamma Wisanggeni');
SELECT uji_sama('peta: gagal 7 hari = 4', (SELECT gagal_7hari FROM v_loker_peta WHERE kode = 'A-003')::int, 4);

-- rusak
SELECT loker_kondisi('A-003', 'rusak', 'asrama@semesta.sch.id', 'engsel patah');
SELECT uji_sama('loker rusak → pemilik pun ditolak', (SELECT alasan FROM loker_buka('LOKER-A', 'A-003', '04A1B2C3D4E5F6')), 'loker rusak');
SELECT uji_sama('peta status rusak', (SELECT status FROM v_loker_peta WHERE kode = 'A-003'), 'rusak');
SELECT uji_gagal('loker rusak tidak bisa ditugaskan', $$SELECT loker_tugaskan('A-003', 2, 'x')$$, 'LOKER_TIDAK_TERSEDIA');

-- denda: keputusan manusia → tagihan menunggu (bukan potong otomatis)
SELECT uji_gagal('denda tanpa alasan ditolak', $$SELECT loker_denda('A-003', 1, 25000, '', 'asrama@semesta.sch.id')$$, 'ALASAN_WAJIB');
SELECT loker_denda('A-003', 1, 25000, 'engsel patah karena dipaksa', 'asrama@semesta.sch.id') AS tg \gset
SELECT uji_sama('denda loker = tagihan menunggu, saldo belum terpotong', (SELECT status::text FROM tagihan WHERE id = :tg) || ':' || saldo_siswa(1), 'menunggu:125500');
SELECT uji_sama('ortu diberi tahu tagihan', (SELECT COUNT(*) FROM notifikasi WHERE jenis = 'tagihan_baru' AND siswa_id = 1)::int, 1);
SELECT tagihan_bayar(:tg, 'wali:1');
SELECT uji_sama('ortu bayar dari portal → 100.500, masuk akun DENDA_ASRAMA', saldo_siswa(1) || ':' || (SELECT saldo_rp FROM saldo_ledger WHERE nama LIKE 'Pendapatan Denda Asrama%'), '100500:25000');

SELECT loker_kondisi('A-003', 'baik', 'asrama@semesta.sch.id', 'sudah diperbaiki');
SELECT loker_lepas('A-003', 'asrama@semesta.sch.id', 'pindah kamar');
SELECT uji_sama('dilepas → kosong', (SELECT status FROM v_loker_peta WHERE kode = 'A-003'), 'kosong');
SELECT uji_gagal('lepas loker kosong ditolak', $$SELECT loker_lepas('A-003', 'x')$$, 'TIDAK_DITEMUKAN');
SELECT loker_tugaskan('A-003', 2, 'asrama@semesta.sch.id');
SELECT uji_ok('riwayat penugasan lama tetap ada', EXISTS (SELECT 1 FROM penugasan_loker WHERE siswa_id = 1 AND selesai IS NOT NULL));
SELECT uji_sama('akses loker tidak pernah menyentuh ledger (hanya 1 denda)', (SELECT COUNT(*) FROM transaksi WHERE layanan = 'locker')::int, 1);
