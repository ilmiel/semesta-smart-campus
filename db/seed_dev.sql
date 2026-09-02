-- =====================================================================
-- DATA CONTOH UNTUK DEV — JANGAN dijalankan di produksi.
--   psql "$DATABASE_URL" -f db/seed_dev.sql
-- Mengisi: tahun ajaran, siswa (sesuai mockup), wali, kartu, staf, terminal
-- (dengan kunci dev yang diketahui), menu, tarif laundry, loker, buku, vending,
-- dan beberapa transaksi awal.
-- =====================================================================
\set ON_ERROR_STOP on

INSERT INTO tahun_ajaran (kode, mulai, selesai, aktif) VALUES ('2026/2027', '2026-07-15', '2027-06-30', TRUE);

-- Staf: ganti email sesuai akun Google Workspace yang akan dipakai login
SELECT staf_simpan('gm@semesta.sch.id',       'Andy (GM)',    '{manajemen,admin_it,keuangan,tu}', TRUE, 'seed');
SELECT staf_simpan('it@semesta.sch.id',       'Admin IT',     '{admin_it}',   TRUE, 'seed');
SELECT staf_simpan('keuangan@semesta.sch.id', 'Bu Rina',      '{keuangan}',   TRUE, 'seed');
SELECT staf_simpan('tu@semesta.sch.id',       'Pak Budi',     '{tu}',         TRUE, 'seed');
SELECT staf_simpan('tu2@semesta.sch.id',      'Bu Sari TU',   '{tu}',         TRUE, 'seed');
SELECT staf_simpan('perpus@semesta.sch.id',   'Bu Sari',      '{pustakawan}', TRUE, 'seed');
SELECT staf_simpan('asrama@semesta.sch.id',   'Pak Slamet',   '{asrama,laundry}', TRUE, 'seed');
SELECT staf_simpan('kesiswaan@semesta.sch.id','Bu Kesiswaan', '{kesiswaan}',  TRUE, 'seed');

-- Siswa (mengikuti mockup)
SELECT siswa_tambah('26001', 'Rafif Gamma Wisanggeni', 'rafif.26@semesta.sch.id',      'SMP', TRUE,  '7.A',  'seed');
SELECT siswa_tambah('26002', 'Aishabilla Piliang',     'aishabilla.26@semesta.sch.id', 'SMP', TRUE,  '7.A',  'seed');
SELECT siswa_tambah('25017', 'Keenan Alvaro',          'keenan.25@semesta.sch.id',     'SMP', TRUE,  '8.B',  'seed');
SELECT siswa_tambah('24031', 'Nayla Puspita',          'nayla.24@semesta.sch.id',      'SMP', TRUE,  '9.C',  'seed');
SELECT siswa_tambah('23008', 'Alfian Pratama',         'alfian.23@semesta.sch.id',     'SMA', TRUE,  '10.A', 'seed');
SELECT siswa_tambah('22044', 'Salsabila Zahra',        'salsabila.22@semesta.sch.id',  'SMA', TRUE,  '11.B', 'seed');
SELECT siswa_tambah('21002', 'Bagas Nur Ramadhan',     'bagas.21@semesta.sch.id',      'SMA', TRUE,  '12.A', 'seed');

SELECT wali_simpan(NULL, 1, 'Bapak Gamma',    'ayah', '08111111111', 'gamma@example.com',    TRUE,  'seed');
SELECT wali_simpan(NULL, 1, 'Ibu Wisanggeni', 'ibu',  '08111111112', 'ibu.w@example.com',    FALSE, 'seed');
SELECT wali_simpan(NULL, 2, 'Ibu Piliang',    'ibu',  '08122222222', 'piliang@example.com',  TRUE,  'seed');
SELECT wali_simpan(NULL, 3, 'Bapak Alvaro',   'ayah', '08133333333', 'alvaro@example.com',   TRUE,  'seed');
SELECT wali_simpan(NULL, 4, 'Ibu Puspita',    'ibu',  '08144444444', 'puspita@example.com',  TRUE,  'seed');
SELECT wali_simpan(NULL, 5, 'Bapak Pratama',  'ayah', '08155555555', 'pratama@example.com',  TRUE,  'seed');

SELECT kartu_terbit(1, '04A1B2C3D4E5F6', 'seed');
SELECT kartu_terbit(2, '04FFEE11223344', 'seed');
SELECT kartu_terbit(3, '04C0FFEE000001', 'seed');
SELECT kartu_terbit(4, '04AB12CD34EF56', 'seed');
SELECT kartu_terbit(5, '04A1F1A0000001', 'seed');
SELECT kartu_terbit(6, '045A15A0000001', 'seed');
SELECT kartu_terbit(7, '04BA6A50000001', 'seed');

-- Terminal dev. KUNCI DEV (X-Device-Key) — hanya untuk lokal:
--   KANTIN-01 : dev-kunci-kantin-01-xxxxxxxxxx
--   KANTIN-02 : dev-kunci-kantin-02-xxxxxxxxxx
--   LNDRY-01  : dev-kunci-laundry-01-xxxxxxxxx
--   PERPUS-01 : dev-kunci-perpus-01-xxxxxxxxxx
--   VEND-01   : dev-kunci-vending-01-xxxxxxxxx
--   LOKER-A   : dev-kunci-loker-a-xxxxxxxxxxxx
SELECT device_simpan('KANTIN-01', 'Kasir Kantin 1',     'kantin',       'Kantin Utama',       encode(digest('dev-kunci-kantin-01-xxxxxxxxxx', 'sha256'), 'hex'), NULL, 'seed');
SELECT device_simpan('KANTIN-02', 'Kasir Kantin 2',     'kantin',       'Kantin Utama',       encode(digest('dev-kunci-kantin-02-xxxxxxxxxx', 'sha256'), 'hex'), NULL, 'seed');
SELECT device_simpan('LNDRY-01',  'Terminal Laundry',   'laundry',      'Asrama Putra',       encode(digest('dev-kunci-laundry-01-xxxxxxxxx', 'sha256'), 'hex'), NULL, 'seed');
SELECT device_simpan('PERPUS-01', 'Meja Sirkulasi',     'perpustakaan', 'Perpustakaan',       encode(digest('dev-kunci-perpus-01-xxxxxxxxxx', 'sha256'), 'hex'), NULL, 'seed');
SELECT device_simpan('VEND-01',   'Vending Akademik',   'vending',      'Gd. Akademik lt. 1', encode(digest('dev-kunci-vending-01-xxxxxxxxx', 'sha256'), 'hex'), NULL, 'seed');
SELECT device_simpan('LOKER-A',   'Controller Loker A', 'locker',       'Asrama Putra',       encode(digest('dev-kunci-loker-a-xxxxxxxxxxxx', 'sha256'), 'hex'), NULL, 'seed');

-- Menu kantin
SELECT menu_simpan(NULL, 'Nasi ayam geprek', 1, 12000, TRUE, TRUE, NULL, 'seed');
SELECT menu_simpan(NULL, 'Nasi goreng',      1, 11000, TRUE, TRUE, NULL, 'seed');
SELECT menu_simpan(NULL, 'Mie ayam',         1, 10000, TRUE, TRUE, NULL, 'seed');
SELECT menu_simpan(NULL, 'Soto ayam',        1, 12000, TRUE, TRUE, NULL, 'seed');
SELECT menu_simpan(NULL, 'Es teh',           2,  3000, TRUE, TRUE, NULL, 'seed');
SELECT menu_simpan(NULL, 'Jus jeruk',        2,  7000, TRUE, TRUE, NULL, 'seed');
SELECT menu_simpan(NULL, 'Air mineral',      2,  4000, TRUE, TRUE, NULL, 'seed');
SELECT menu_simpan(NULL, 'Roti bakar',       3,  8000, TRUE, FALSE, NULL, 'seed');
SELECT menu_simpan(NULL, 'Gorengan (3)',     3,  5000, TRUE, FALSE, NULL, 'seed');

-- Loker blok A & B
SELECT loker_buat_blok('A', 1, 120, 'Asrama Putra lt. 1', 'LOKER-A', 'seed');
SELECT loker_buat_blok('B', 1, 80,  'Asrama Putri lt. 1', NULL, 'seed');
SELECT loker_tugaskan('A-117', 1, 'seed');
SELECT loker_tugaskan('A-023', 3, 'seed');

-- Perpustakaan
SELECT buku_tambah('Harry Potter and the Philosopher''s Stone', 'J.K. Rowling', 'Fiksi Inggris', '9780747532699', 'F-21', FALSE, 4, 'HP1', 'seed');
SELECT buku_tambah('Bumi', 'Tere Liye', 'Fiksi Indonesia', NULL, 'F-12', FALSE, 2, 'BUMI', 'seed');
SELECT buku_tambah('Wonder', 'R.J. Palacio', 'Fiksi Inggris', NULL, 'F-18', FALSE, 3, 'WNDR', 'seed');
SELECT buku_tambah('Laskar Pelangi', 'Andrea Hirata', 'Fiksi Indonesia', NULL, 'F-10', FALSE, 3, 'LSKR', 'seed');
SELECT buku_tambah('KBBI Edisi V', 'Badan Bahasa', 'Referensi', NULL, 'R-01', TRUE, 1, 'KBBI', 'seed');

-- Vending
SELECT vending_daftarkan_mesin('VEND-01', '06:00', '17:00', 'seed');
SELECT vending_produk_simpan(NULL, 'Air mineral',  4000, TRUE, 'seed');
SELECT vending_produk_simpan(NULL, 'Susu kotak',   6000, TRUE, 'seed');
SELECT vending_produk_simpan(NULL, 'Roti cokelat', 8000, TRUE, 'seed');
SELECT vending_produk_simpan(NULL, 'Yogurt drink', 7000, TRUE, 'seed');
SELECT vending_produk_setujui(id, TRUE, 'kesiswaan@semesta.sch.id') FROM produk_vending;
SELECT vending_slot_atur('VEND-01', 'A1', 1, 10, 'seed');
SELECT vending_slot_atur('VEND-01', 'A2', 2, 10, 'seed');
SELECT vending_slot_atur('VEND-01', 'A3', 3, 8,  'seed');
SELECT vending_slot_atur('VEND-01', 'A4', 4, 8,  'seed');
SELECT vending_restock('VEND-01', 'A1', 10, 0, 'seed');
SELECT vending_restock('VEND-01', 'A2', 10, 0, 'seed');
SELECT vending_restock('VEND-01', 'A3', 8,  0, 'seed');
SELECT vending_restock('VEND-01', 'A4', 8,  0, 'seed');

-- Saldo awal via top-up tunai (dua tanda tangan)
SELECT topup_tunai(1, 200000, 'tu@semesta.sch.id', 'tu2@semesta.sch.id', 'seed');
SELECT topup_tunai(2,  86500, 'tu@semesta.sch.id', 'tu2@semesta.sch.id', 'seed');
SELECT topup_tunai(3,  40000, 'tu@semesta.sch.id', 'tu2@semesta.sch.id', 'seed');
SELECT topup_tunai(5, 122000, 'tu@semesta.sch.id', 'tu2@semesta.sch.id', 'seed');
SELECT topup_tunai(6,  57500, 'tu@semesta.sch.id', 'tu2@semesta.sch.id', 'seed');
SELECT topup_tunai(7,  31000, 'tu@semesta.sch.id', 'tu2@semesta.sch.id', 'seed');

-- Beberapa transaksi kantin hari ini
SELECT bayar('KANTIN-01', 'seed-0001', '04FFEE11223344', 15000, 'Belanja kantin');
SELECT bayar('KANTIN-02', 'seed-0002', '04C0FFEE000001', 12000, 'Belanja kantin');
SELECT bayar_menu('KANTIN-01', 'seed-0003', '045A15A0000001', '[{"menu_id":1,"qty":1},{"menu_id":5,"qty":1}]');
SELECT bayar('KANTIN-02', 'seed-0004', '04A1F1A0000001', 9000, 'Belanja kantin');
SELECT bayar('KANTIN-01', 'seed-0005', '04BA6A50000001', 16000, 'Belanja kantin');

\echo 'Seed dev selesai. PIN siswa belum ada — reset lewat dashboard TU (POST /api/admin/siswa/<nis>/pin {aksi:"reset"}).'
