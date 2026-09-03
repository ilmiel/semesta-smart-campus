-- =====================================================================
-- UJI DASHBOARD & DATA MASTER (009)
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;
SELECT uji_berkas('07_dashboard');
-- Keluaran per-pernyataan disenyapkan oleh pemanggil (migrate.sh / harness),
-- bukan oleh `\o /dev/null` — perintah itu hanya ada di Unix dan membuat
-- seluruh suite gagal di Windows, padahal tim IT sekolah memakai Windows.

SELECT siswa_tambah('27001', 'Siswa Baru', 'baru.27@semesta.sch.id', 'SMP', TRUE, '7.B', 'tu@semesta.sch.id') AS sb \gset
SELECT uji_sama('siswa_tambah → kelas & akun wallet', (SELECT kelas || ':' || saldo_rp FROM v_siswa WHERE nis = '27001'), '7.B:0');
SELECT uji_gagal('NIS ganda ditolak', $$SELECT siswa_tambah('27001', 'X', NULL, 'SMP', TRUE, NULL, 'x')$$, 'siswa_nis_key');
SELECT wali_simpan(NULL, :sb, 'Ibu Baru', 'ibu', '0812', 'ibu.baru@example.com', TRUE, 'tu@semesta.sch.id') AS w1 \gset
SELECT wali_simpan(NULL, :sb, 'Bapak Baru', 'ayah', '0813', 'bapak.baru@example.com', TRUE, 'tu@semesta.sch.id') AS w2 \gset
SELECT uji_sama('hanya satu wali utama', (SELECT COUNT(*) FROM wali WHERE siswa_id = :sb AND utama)::int, 1);
SELECT staf_simpan('Kesiswaan@Semesta.sch.id', 'Bu Kesiswaan', '{kesiswaan,wali_kelas}', TRUE, 'it@semesta.sch.id');
SELECT uji_sama('staf_simpan email lower + peran', peran_staf('kesiswaan@semesta.sch.id')::text, '{kesiswaan,wali_kelas}');
SELECT staf_simpan('kesiswaan@semesta.sch.id', 'Bu Kesiswaan', '{kesiswaan}', FALSE, 'it@semesta.sch.id');
SELECT uji_sama('staf nonaktif → tanpa peran', peran_staf('kesiswaan@semesta.sch.id')::text, '{}');

SELECT device_simpan('KANTIN-03', 'Kasir 3', 'kantin', 'Kantin', 'hash-baru', NULL, 'it@semesta.sch.id') AS dv \gset
SELECT uji_sama('device baru: limit offline = kebijakan', (SELECT limit_offline_rp FROM device WHERE kode = 'KANTIN-03'), 25000);
SELECT uji_gagal('limit device di atas kebijakan ditolak', $$SELECT device_simpan('KANTIN-04', 'x', 'kantin', NULL, 'h', 40000, 'x')$$, 'MELEBIHI_PLAFON');
SELECT device_aktifkan('KANTIN-03', FALSE, 'it@semesta.sch.id', 'dicuri');
SELECT uji_gagal('device nonaktif ditolak transaksi', $$SELECT * FROM bayar('KANTIN-03', 'k03-000001', '04A1B2C3D4E5F6', 1000, 'x')$$, 'DEVICE_NONAKTIF');
SELECT uji_sama('status device nonaktif di view', (SELECT status FROM v_device_status WHERE kode = 'KANTIN-03'), 'nonaktif');

SELECT uji_ok('kpi beranda terisi', (SELECT siswa_aktif > 0 AND total_float_rp = (SELECT SUM(saldo_rp) FROM saldo_ledger WHERE jenis = 'siswa') FROM kpi_beranda()));
SELECT uji_ok('v_siswa: Keenan kartu aktif, uid baru', EXISTS (SELECT 1 FROM v_siswa WHERE nis = '25017' AND kartu = 'aktif' AND uid = '04DEADBEEF0001'));
SELECT uji_ok('v_siswa: siswa tanpa kartu = belum', EXISTS (SELECT 1 FROM v_siswa WHERE nis = '27001' AND kartu = 'belum'));
SELECT uji_ok('antrian ditolak tampil dgn nama', EXISTS (SELECT 1 FROM v_antrian_ditolak WHERE nama = 'Keenan Alvaro'));
SELECT uji_ok('kartu dicabut hari ini tampil', EXISTS (SELECT 1 FROM v_kartu_dicabut_hari_ini WHERE uid = '04C0FFEE000001' AND sudah_ada_pengganti));
SELECT uji_ok('ekspor transaksi punya item', EXISTS (SELECT 1 FROM v_ekspor_transaksi WHERE item LIKE '%Es teh%'));
SELECT uji_ok('v_koreksi menampilkan refund dgn petugas', EXISTS (SELECT 1 FROM v_koreksi WHERE petugas = 'keuangan@semesta.sch.id' AND jenis = 'refund'));

-- saldo rendah: Sunyi (5) 15.000 < 20.000 → 1 notifikasi, tidak dobel di hari yang sama
SELECT uji_ok('notifikasi saldo rendah ≥ 1', notifikasi_saldo_rendah() >= 1);
SELECT uji_sama('tidak dikirim dua kali sehari', notifikasi_saldo_rendah(), 0);
