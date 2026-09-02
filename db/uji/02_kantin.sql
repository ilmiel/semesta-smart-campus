-- =====================================================================
-- UJI KANTIN — menu, bayar per item, PO, rekap
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;
SELECT uji_berkas('02_kantin');
\o /dev/null

-- ---------- MENU (F-41) ----------
SELECT menu_simpan(NULL, 'Nasi ayam geprek', 1, 12000, TRUE, TRUE, NULL, 'it@semesta.sch.id') AS m1 \gset
SELECT menu_simpan(NULL, 'Es teh', 2, 3000, TRUE, TRUE, NULL, 'it@semesta.sch.id') AS m2 \gset
SELECT menu_simpan(NULL, 'Roti bakar', 3, 8000, TRUE, FALSE, NULL, 'it@semesta.sch.id') AS m3 \gset
SELECT menu_simpan(NULL, 'Menu nonaktif', 1, 5000, FALSE, TRUE, NULL, 'it@semesta.sch.id') AS m4 \gset
SELECT uji_gagal('harga bukan kelipatan 100 ditolak', $$SELECT menu_simpan(NULL, 'X', 1, 12050, TRUE, TRUE, NULL, 'it@semesta.sch.id')$$, 'NILAI_TIDAK_VALID');
SELECT uji_sama('menu aktif = 3', (SELECT COUNT(*) FROM v_menu_aktif)::int, 3);
SELECT menu_simpan(:m1, 'Nasi ayam geprek', 1, 13000, TRUE, TRUE, NULL, 'it@semesta.sch.id');
SELECT uji_sama('ubah harga tercatat di audit (sebelum 12000)', (SELECT meta->'sebelum'->>'harga_rp' FROM audit_log WHERE objek = 'menu:' || :m1 AND aksi = 'ubah_menu'), '12000');

-- ---------- BAYAR PER ITEM — harga dari server ----------
-- Rafif (1) hari ini sudah 50.000 (limit) di uji wallet, pakai Aisha (2), saldo 91.000, hari ini belanja: 18k(refund penuh) +1k +7k(batal) +1k = 2.000 terpakai
SELECT * FROM bayar_menu('KANTIN-01', 'k01-menu-01', '04FFEE11223344', ('[{"menu_id":' || :m1 || ',"qty":1},{"menu_id":' || :m2 || ',"qty":2}]')::jsonb) \gset bm_
SELECT uji_sama('total dari harga server 13.000 + 2×3.000 = 19.000', :bm_total_rp::bigint, 19000::bigint);
SELECT uji_sama('item menyimpan ref menu', (SELECT COUNT(*) FROM transaksi_item WHERE transaksi_id = :bm_transaksi_id AND ref_id IN (:m1, :m2))::int, 2);
SELECT uji_gagal('menu nonaktif ditolak', $$SELECT * FROM bayar_menu('KANTIN-01', 'k01-menu-02', '04FFEE11223344', '[{"menu_id":$$ || :m4 || $$,"qty":1}]')$$, 'ITEM_TIDAK_VALID');
SELECT uji_gagal('qty 0 ditolak', $$SELECT * FROM bayar_menu('KANTIN-01', 'k01-menu-02', '04FFEE11223344', '[{"menu_id":$$ || :m1 || $$,"qty":0}]')$$, 'ITEM_TIDAK_VALID');
SELECT uji_gagal('keranjang kosong ditolak', $$SELECT * FROM bayar_menu('KANTIN-01', 'k01-menu-02', '04FFEE11223344', '[]')$$, 'ITEM_KOSONG');
SELECT menu_simpan(:m1, 'Nasi ayam geprek', 1, 15000, TRUE, TRUE, NULL, 'it@semesta.sch.id');
SELECT uji_sama('harga naik → transaksi lama tetap 13.000', (SELECT harga_rp FROM transaksi_item WHERE transaksi_id = :bm_transaksi_id AND ref_id = :m1), 13000::bigint);

-- ---------- PO (F-48, F-49) ----------
SELECT kebijakan_set('po_aktif', 'false', 'it@semesta.sch.id');
SELECT uji_gagal('PO nonaktif → ditolak dgn pesan', $$SELECT * FROM po_buat(3, 'siswa', '[{"menu_id":$$ || :m1 || $$,"qty":1}]')$$, 'PO_TUTUP');
SELECT kebijakan_set('po_aktif', 'true', 'it@semesta.sch.id');
SELECT kebijakan_set('po_buka', '"00:00"', 'it@semesta.sch.id');
SELECT kebijakan_set('po_tutup', '"00:01"', 'it@semesta.sch.id');
SELECT uji_sama('di luar jam → alasan "sudah ditutup"', (SELECT alasan FROM po_jendela()), 'PO sudah ditutup pukul 00.01');
SELECT kebijakan_set('po_tutup', '"23:59"', 'it@semesta.sch.id');
SELECT uji_ok('jendela terbuka', (SELECT buka FROM po_jendela()));
SELECT uji_gagal('PO untuk besok ditolak', $$SELECT * FROM po_buat(3, 'siswa', '[{"menu_id":$$ || :m1 || $$,"qty":1}]', NULL, hari_ini() + 1)$$, 'PO_TUTUP');
SELECT uji_gagal('menu yang tidak bisa PO ditolak', $$SELECT * FROM po_buat(3, 'siswa', '[{"menu_id":$$ || :m3 || $$,"qty":1}]')$$, 'ITEM_TIDAK_VALID');

-- Keenan (3): saldo 77.000, belanja hari ini 1k+2k+20k = 23.000; limit 50.000 → PO 15k+6k = 21.000 ok
SELECT * FROM po_buat(3, 'wali:4', ('[{"menu_id":' || :m1 || ',"qty":1},{"menu_id":' || :m2 || ',"qty":2}]')::jsonb, 'tanpa sambal') \gset po1_
SELECT uji_sama('PO total 21.000, dibayar saat pesan', :po1_total_rp::bigint, 21000::bigint);
SELECT uji_sama('saldo Keenan 56.000', saldo_siswa(3), 56000::bigint);
SELECT uji_ok('kode PO format PO-XXXXX', :'po1_kode' ~ '^PO-[A-Z2-9]{5}$');
SELECT uji_sama('PO membawa rincian item (2 baris)', (SELECT COUNT(*) FROM po_item WHERE po_id = :po1_po_id)::int, 2);
SELECT uji_gagal('PO melebihi limit harian ditolak', $$SELECT * FROM po_buat(3, 'siswa', '[{"menu_id":$$ || :m1 || $$,"qty":1}]')$$, 'LIMIT_HARIAN');

-- kasir: cari via kartu → ambil
SELECT uji_sama('kasir cari PO via tap kartu', (SELECT kode FROM po_cari('KANTIN-01', '04DEADBEEF0001')), :'po1_kode');
SELECT uji_sama('rincian item terbaca kasir', (SELECT item FROM po_cari('KANTIN-01', '04DEADBEEF0001')), '1× Nasi ayam geprek, 2× Es teh');
SELECT uji_gagal('kartu hilang → kasir diminta kode PO', $$SELECT * FROM po_cari('KANTIN-01', '04C0FFEE000001')$$, 'KARTU_DIBLOKIR');
SELECT uji_sama('cari via kode (huruf kecil pun bisa)', (SELECT nama FROM po_cari('KANTIN-01', NULL, lower(:'po1_kode'))), 'Keenan Alvaro');
SELECT uji_gagal('po_cari dari terminal laundry ditolak', $$SELECT * FROM po_cari('LNDRY-01', '04DEADBEEF0001')$$, 'LAYANAN_TIDAK_VALID');
SELECT uji_sama('ambil → 1 PO ditandai', po_ambil('KANTIN-01', ARRAY[:po1_po_id::bigint]), 1);
SELECT uji_sama('status diambil, device tercatat', (SELECT status::text || ':' || device_ambil_id FROM po_pesanan WHERE id = :po1_po_id), 'diambil:1');
SELECT uji_gagal('ambil dua kali ditolak', $$SELECT po_ambil('KANTIN-01', ARRAY[$$ || :po1_po_id || $$::bigint])$$, 'STATUS_TIDAK_SESUAI');
SELECT uji_gagal('batal PO yang sudah diambil ditolak', $$SELECT po_batal($$ || :po1_po_id || $$, 'siswa')$$, 'STATUS_TIDAK_SESUAI');
SELECT uji_sama('saldo Keenan tetap 56.000 (ambil tanpa bayar ulang)', saldo_siswa(3), 56000::bigint);

-- batal sebelum tutup → refund penuh
SELECT * FROM po_buat(2, 'siswa', ('[{"menu_id":' || :m2 || ',"qty":1}]')::jsonb) \gset po2_
SELECT uji_sama('saldo Aisha setelah PO 3.000: 69.000', saldo_siswa(2), 69000::bigint);
SELECT po_batal(:po2_po_id, 'siswa') AS rid \gset pb_
SELECT uji_sama('batal → refund penuh, saldo 72.000', saldo_siswa(2), 72000::bigint);
SELECT uji_sama('PO dibatalkan menunjuk refund', (SELECT refund_transaksi_id FROM po_pesanan WHERE id = :po2_po_id), :pb_rid::bigint);

-- batal setelah tutup → ditolak; penutupan hari
SELECT * FROM po_buat(2, 'siswa', ('[{"menu_id":' || :m2 || ',"qty":1}]')::jsonb) \gset po3_
SELECT kebijakan_set('po_tutup', '"00:00"', 'it@semesta.sch.id');
SELECT uji_gagal('batal setelah jam tutup ditolak', $$SELECT po_batal($$ || :po3_po_id || $$, 'siswa')$$, 'PO_SUDAH_TUTUP');
SELECT kebijakan_set('po_ambil_selesai', '"23:59"', 'it@semesta.sch.id');
SELECT uji_gagal('tutup hari sebelum jendela ambil selesai ditolak', $$SELECT * FROM po_tutup_hari()$$, 'BELUM_WAKTUNYA');
SELECT kebijakan_set('po_ambil_selesai', '"00:00"', 'it@semesta.sch.id');
SELECT * FROM po_tutup_hari() \gset th_
SELECT uji_sama('tutup hari: 1 tidak diambil, tetap ditagih (default)', :th_tidak_diambil::int || ':' || :th_direfund::int, '1:0');
SELECT uji_sama('saldo Aisha tetap 69.000 (tetap ditagih)', saldo_siswa(2), 69000::bigint);
SELECT uji_sama('ortu diberi tahu', (SELECT COUNT(*) FROM notifikasi WHERE jenis = 'po_tidak_diambil' AND siswa_id = 2)::int, 1);
-- kebijakan refund
SELECT kebijakan_set('po_tidak_diambil', '"refund"', 'it@semesta.sch.id');
SELECT kebijakan_set('po_tutup', '"23:59"', 'it@semesta.sch.id');
SELECT * FROM po_buat(2, 'siswa', ('[{"menu_id":' || :m2 || ',"qty":1}]')::jsonb) \gset po4_
SELECT * FROM po_tutup_hari() \gset th2_
SELECT uji_sama('kebijakan refund: 1 direfund', :th2_direfund::int, 1);
SELECT uji_sama('saldo Aisha kembali 69.000', saldo_siswa(2), 69000::bigint);
SELECT kebijakan_set('po_tidak_diambil', '"tetap_ditagih"', 'it@semesta.sch.id');
SELECT uji_sama('audit perubahan pengaturan PO tercatat', (SELECT COUNT(*) FROM audit_log WHERE aksi = 'ubah_kebijakan' AND objek LIKE 'kebijakan:po_%')::int, 12);

-- ---------- REKAP ----------
SELECT uji_ok('rekap terminal KANTIN-01 hari ini punya omzet & pembatalan',
    (SELECT jumlah_transaksi > 0 AND pembatalan = 1 FROM v_rekap_terminal_harian WHERE device = 'KANTIN-01' AND tanggal = hari_ini()));
SELECT uji_ok('settlement kantin bersih = kotor − refund',
    (SELECT bersih_rp = kotor_rp - refund_rp FROM v_settlement_unit WHERE layanan = 'kantin' AND tanggal = hari_ini()));
SELECT uji_ok('menu terlaris hanya dari item (Es teh muncul)', EXISTS (SELECT 1 FROM v_menu_terlaris WHERE nama = 'Es teh' AND tanggal = hari_ini()));
SELECT uji_ok('dapur: rekap item PO hari ini', EXISTS (SELECT 1 FROM v_po_dapur WHERE tanggal = hari_ini() AND nama = 'Es teh'));
SELECT uji_ok('riwayat portal menampilkan nama item', EXISTS (SELECT 1 FROM v_riwayat_siswa WHERE siswa_id = 2 AND item LIKE '%Es teh%'));
SELECT uji_ok('kesejahteraan: siswa boarding tanpa transaksi tidak ada yg ber-rupiah',
    NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'v_kesejahteraan' AND column_name LIKE '%rp%'));
-- Siswa boarding baru tanpa transaksi harus muncul di daftar tindak lanjut
INSERT INTO siswa (nis, nama, boarding) VALUES ('26099', 'Siswa Sunyi', TRUE);
SELECT uji_ok('siswa boarding tanpa transaksi masuk indikator kesejahteraan', EXISTS (SELECT 1 FROM v_kesejahteraan WHERE nis = '26099'));
SELECT uji_ok('Keenan (belanja hari ini) tidak masuk indikator', NOT EXISTS (SELECT 1 FROM v_kesejahteraan WHERE nis = '25017'));
