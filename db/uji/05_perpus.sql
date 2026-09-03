-- =====================================================================
-- UJI PERPUSTAKAAN (F-70–F-72)
-- Keenan (3, SMP maks 3) saldo 56.000; Aisha (2) 69.000; Siswa Sunyi (5) saldo 0
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;
SELECT uji_berkas('05_perpus');
-- Keluaran per-pernyataan disenyapkan oleh pemanggil (migrate.sh / harness),
-- bukan oleh `\o /dev/null` — perintah itu hanya ada di Unix dan membuat
-- seluruh suite gagal di Windows, padahal tim IT sekolah memakai Windows.

SELECT buku_tambah('Harry Potter and the Philosopher''s Stone', 'J.K. Rowling', 'Fiksi Inggris', '9780747532699', 'F-21', FALSE, 4, 'HP1', 'perpus@semesta.sch.id') AS b_hp \gset
SELECT buku_tambah('Bumi', 'Tere Liye', 'Fiksi Indonesia', NULL, 'F-12', FALSE, 2, 'BUMI', 'perpus@semesta.sch.id') AS b_bumi \gset
SELECT buku_tambah('KBBI Edisi V', 'Badan Bahasa', 'Referensi', NULL, 'R-01', TRUE, 1, 'KBBI', 'perpus@semesta.sch.id') AS b_kbbi \gset
SELECT uji_sama('4 eksemplar HP1', (SELECT COUNT(*) FROM eksemplar WHERE buku_id = :b_hp)::int, 4);
SELECT uji_ok('scan: HP1-02 bisa dipinjam', (SELECT bisa_dipinjam FROM perpus_scan('HP1-02')));
SELECT uji_sama('scan: referensi ditolak dengan alasan', (SELECT alasan FROM perpus_scan('KBBI-01')), 'buku referensi — baca di tempat');
SELECT uji_gagal('barcode asing', $$SELECT * FROM perpus_pinjam('PERPUS-01', 'XX-99', '04DEADBEEF0001')$$, 'BUKU_TIDAK_DIKENAL');
SELECT uji_gagal('pinjam referensi ditolak', $$SELECT * FROM perpus_pinjam('PERPUS-01', 'KBBI-01', '04DEADBEEF0001')$$, 'TIDAK_BISA_DIPINJAM');

-- pinjam
SELECT * FROM perpus_pinjam('PERPUS-01', 'HP1-02', '04DEADBEEF0001', 'Bu Sari') \gset p1_
SELECT uji_sama('jatuh tempo 7 hari (SMP)', :'p1_jatuh_tempo'::date, hari_ini() + 7);
SELECT uji_sama('pinjaman 1 dari 3', :p1_pinjaman_aktif::int || '/' || :p1_maks_buku::int, '1/3');
SELECT uji_sama('eksemplar jadi dipinjam', (SELECT status::text FROM eksemplar WHERE barcode = 'HP1-02'), 'dipinjam');
SELECT uji_gagal('eksemplar yang sedang dipinjam ditolak', $$SELECT * FROM perpus_pinjam('PERPUS-01', 'HP1-02', '04FFEE11223344')$$, 'TIDAK_BISA_DIPINJAM');
SELECT uji_sama('scan menunjukkan peminjam', (SELECT peminjam FROM perpus_scan('HP1-02')), 'Keenan Alvaro');
SELECT * FROM perpus_pinjam('PERPUS-01', 'HP1-01', '04DEADBEEF0001') \gset p2_
SELECT * FROM perpus_pinjam('PERPUS-01', 'HP1-03', '04DEADBEEF0001') \gset p3_
SELECT uji_gagal('buku ke-4 ditolak (batas SMP 3)', $$SELECT * FROM perpus_pinjam('PERPUS-01', 'BUMI-01', '04DEADBEEF0001')$$, 'BATAS_PINJAM');
SELECT uji_gagal('kartu hilang tidak bisa pinjam', $$SELECT * FROM perpus_pinjam('PERPUS-01', 'BUMI-01', '04C0FFEE000001')$$, 'KARTU_DIBLOKIR');

-- perpanjang
SELECT uji_sama('perpanjang → +7 hari', perpus_perpanjang(:p1_pinjaman_id, 'siswa'), hari_ini() + 14);
SELECT uji_gagal('perpanjang kedua ditolak', $$SELECT perpus_perpanjang($$ || :p1_pinjaman_id || $$, 'siswa')$$, 'MAKS_PERPANJANG');

-- telat → denda dipotong (Aisha)
SELECT * FROM perpus_pinjam('PERPUS-01', 'BUMI-01', '04FFEE11223344') \gset p4_
UPDATE pinjaman SET dipinjam = now() - interval '10 days', jatuh_tempo = hari_ini() - 3 WHERE id = :p4_pinjaman_id;
SELECT uji_sama('denda berjalan 3 hari × 1.000', (SELECT denda_rp FROM perpus_hitung_denda(:p4_pinjaman_id)), 3000::bigint);
SELECT uji_ok('tampil di pinjaman aktif dgn hari_telat 3', EXISTS (SELECT 1 FROM v_pinjaman_aktif WHERE id = :p4_pinjaman_id AND hari_telat = 3));
SELECT uji_gagal('ada pinjaman telat → tidak boleh pinjam lagi', $$SELECT * FROM perpus_pinjam('PERPUS-01', 'BUMI-02', '04FFEE11223344')$$, 'ADA_TERLAMBAT');
SELECT uji_gagal('perpanjang saat telat ditolak', $$SELECT perpus_perpanjang($$ || :p4_pinjaman_id || $$, 'siswa')$$, 'SUDAH_TERLAMBAT');
SELECT * FROM perpus_kembali('PERPUS-01', 'BUMI-01', TRUE, 'Bu Sari') \gset k1_
SELECT uji_sama('kembali + PIN → denda dipotong, saldo Aisha 66.000', :'k1_denda_status'::text || ':' || :k1_saldo_rp, 'dipotong:66000');
SELECT uji_sama('rak dikembalikan ke petugas', :'k1_rak'::text, 'F-12');
SELECT uji_sama('denda tercatat sebagai transaksi denda perpustakaan', (SELECT jenis::text || ':' || layanan::text FROM transaksi WHERE id = (SELECT denda_transaksi_id FROM pinjaman WHERE id = :p4_pinjaman_id)), 'denda:perpustakaan');
SELECT uji_sama('eksemplar tersedia lagi', (SELECT status::text FROM eksemplar WHERE barcode = 'BUMI-01'), 'tersedia');
SELECT uji_gagal('kembalikan buku yang tidak dipinjam ditolak', $$SELECT * FROM perpus_kembali('PERPUS-01', 'BUMI-01', TRUE)$$, 'TIDAK_DIPINJAM');

-- saldo kurang → buku tetap diterima, denda jadi tagihan (Siswa Sunyi, saldo 0)
SELECT kartu_terbit(5, '04AB0000000005', 'tu@semesta.sch.id');
SELECT * FROM perpus_pinjam('PERPUS-01', 'BUMI-02', '04AB0000000005') \gset p5_
UPDATE pinjaman SET jatuh_tempo = hari_ini() - 5 WHERE id = :p5_pinjaman_id;
SELECT * FROM perpus_kembali('PERPUS-01', 'BUMI-02', TRUE) \gset k2_
SELECT uji_sama('saldo kurang → buku diterima, denda menunggu 5.000', :'k2_denda_status'::text || ':' || :k2_denda_rp, 'menunggu:5000');
SELECT uji_sama('tagihan perpus dibuat', (SELECT COUNT(*) FROM tagihan WHERE siswa_id = 5 AND sumber = 'perpustakaan' AND status = 'menunggu')::int, 1);
SELECT uji_sama('eksemplar tetap kembali tersedia', (SELECT status::text FROM eksemplar WHERE barcode = 'BUMI-02'), 'tersedia');
SELECT * FROM topup_tunai(5, 20000, 'tu@semesta.sch.id', 'tu2@semesta.sch.id') \gset tt_
SELECT tagihan_bayar((SELECT tagihan_id FROM pinjaman WHERE id = :p5_pinjaman_id), 'wali:x');
SELECT uji_sama('tagihan dibayar → pinjaman jadi dipotong (trigger)', (SELECT denda_status::text FROM pinjaman WHERE id = :p5_pinjaman_id), 'dipotong');
SELECT uji_sama('saldo Sunyi 15.000', saldo_siswa(5), 15000::bigint);

-- tanpa PIN → menunggu; pustakawan bebaskan
UPDATE pinjaman SET jatuh_tempo = hari_ini() - 2 WHERE id = :p2_pinjaman_id;
SELECT * FROM perpus_kembali('PERPUS-01', 'HP1-01', FALSE) \gset k3_
SELECT uji_sama('tanpa PIN → menunggu 2.000', :'k3_denda_status'::text || ':' || :k3_denda_rp, 'menunggu:2000');
SELECT uji_sama('pinjaman aktif Keenan tinggal 2', :k3_pinjaman_aktif::int, 2);
SELECT uji_gagal('bebaskan tanpa alasan ditolak', $$SELECT perpus_bebaskan_denda($$ || :p2_pinjaman_id || $$, 'perpus@semesta.sch.id', '')$$, 'ALASAN_WAJIB');
SELECT perpus_bebaskan_denda(:p2_pinjaman_id, 'perpus@semesta.sch.id', 'buku dikembalikan sebelum perpus buka');
SELECT uji_sama('dibebaskan: pinjaman & tagihan', (SELECT denda_status::text FROM pinjaman WHERE id = :p2_pinjaman_id) || ':' || (SELECT status::text FROM tagihan WHERE id = (SELECT tagihan_id FROM pinjaman WHERE id = :p2_pinjaman_id)), 'dibebaskan:dibebaskan');
SELECT uji_gagal('denda yang sudah dipotong tidak bisa dibebaskan (lewat refund)', $$SELECT perpus_bebaskan_denda($$ || :p4_pinjaman_id || $$, 'x', 'y')$$, 'STATUS_TIDAK_SESUAI');

-- denda maksimum
UPDATE pinjaman SET jatuh_tempo = hari_ini() - 60 WHERE id = :p3_pinjaman_id;
SELECT uji_sama('denda dibatasi maks 20.000 (SMP)', (SELECT denda_rp FROM perpus_hitung_denda(:p3_pinjaman_id)), 20000::bigint);

-- hilang
SELECT perpus_hilang('HP1-03', 50000, 'perpus@semesta.sch.id', 'siswa lapor hilang') AS tg_hilang \gset
SELECT uji_sama('buku hilang → eksemplar hilang, tagihan penggantian 50.000', (SELECT status::text FROM eksemplar WHERE barcode = 'HP1-03') || ':' || (SELECT nominal_rp FROM tagihan WHERE id = :tg_hilang), 'hilang:50000');
SELECT uji_sama('pinjaman ditutup', (SELECT dikembalikan IS NOT NULL FROM pinjaman WHERE id = :p3_pinjaman_id)::text, 'true');

-- riwayat bacaan (F-72): tanpa rupiah, terlihat
SELECT uji_ok('riwayat bacaan tanpa kolom rupiah', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'v_riwayat_bacaan' AND column_name LIKE '%rp%'));
SELECT uji_sama('riwayat bacaan Keenan: 3 judul', (SELECT COUNT(*) FROM v_riwayat_bacaan WHERE siswa_id = 3)::int, 3);
SELECT uji_ok('Bumi terpopuler (dipinjam 2×)', (SELECT kali_dipinjam = 2 FROM v_buku_populer WHERE id = :b_bumi));
