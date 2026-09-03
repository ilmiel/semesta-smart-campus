-- =====================================================================
-- UJI WALLET — topup, bayar, PIN, limit, offline, refund, koreksi, dll.
-- Siswa 1 = Rafif (kartu 04A1B2C3D4E5F6), 2 = Aisha, 3 = Keenan, 4 = Alfian (tanpa kartu)
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;
SELECT uji_berkas('01_wallet');
-- Keluaran per-pernyataan disenyapkan oleh pemanggil (migrate.sh / harness),
-- bukan oleh `\o /dev/null` — perintah itu hanya ada di Unix dan membuat
-- seluruh suite gagal di Windows, padahal tim IT sekolah memakai Windows.

-- ---------- TOP-UP GATEWAY (F-20, F-22, F-24) ----------
SELECT topup_buat(1, 200000, 'simulasi', 'wali:1') AS id \gset tp1_
SELECT topup_set_invoice(:tp1_id, 'INV-001', 'https://pay.example/INV-001', now() + interval '1 day');
SELECT uji_sama('topup menunggu belum menambah saldo', saldo_siswa(1), 0::bigint);

SELECT * FROM topup_lunas('INV-001', now(), 200000) \gset l1_
SELECT uji_sama('topup lunas → saldo 200.000', saldo_siswa(1), 200000::bigint);
SELECT uji_ok('topup lunas menandai baru=true', :'l1_baru'::boolean);
SELECT uji_sama('notifikasi topup ke wali utama saja', (SELECT COUNT(*) FROM notifikasi WHERE siswa_id = 1 AND jenis = 'topup_berhasil')::int, 1);

SELECT * FROM topup_lunas('INV-001', now(), 200000) \gset l2_
SELECT uji_ok('webhook dobel → baru=false (F-22)', NOT :'l2_baru'::boolean);
SELECT uji_sama('webhook dobel tidak menambah saldo', saldo_siswa(1), 200000::bigint);
SELECT topup_buat(2, 100000, 'simulasi', 'wali:3') AS id \gset tp2_
SELECT topup_set_invoice(:tp2_id, 'INV-002', 'https://pay.example/INV-002', now() + interval '1 day');
SELECT uji_gagal('nominal dibayar ≠ tagihan ditolak', $$SELECT * FROM topup_lunas('INV-002', now(), 90000)$$, 'NOMINAL_BEDA');
SELECT uji_gagal('invoice tak dikenal ditolak', $$SELECT * FROM topup_lunas('INV-XXX')$$, 'INVOICE_TIDAK_DIKENAL');
SELECT * FROM topup_lunas('INV-002') \gset l3_
SELECT uji_sama('Aisha saldo 100.000', saldo_siswa(2), 100000::bigint);

SELECT uji_gagal('topup di bawah minimum ditolak', $$SELECT topup_buat(1, 5000, 'simulasi', 'wali:1')$$, 'NOMINAL_DI_LUAR_BATAS');
SELECT uji_gagal('topup di atas maksimum ditolak', $$SELECT topup_buat(1, 900000, 'simulasi', 'wali:1')$$, 'NOMINAL_DI_LUAR_BATAS');
SELECT kebijakan_set('plafon_saldo_rp', '300000', 'it@semesta.sch.id');
SELECT uji_gagal('topup melebihi plafon saldo ditolak', $$SELECT topup_buat(1, 200000, 'simulasi', 'wali:1')$$, 'MELEBIHI_PLAFON');
SELECT kebijakan_set('plafon_saldo_rp', '1000000', 'it@semesta.sch.id');

-- Alfian (4) tanpa kartu; beri saldo lewat tunai untuk uji mode darurat nanti
SELECT uji_gagal('topup tunai: satu orang tanda tangan dua kali ditolak',
    $$SELECT * FROM topup_tunai(4, 50000, 'tu@semesta.sch.id', 'TU@semesta.sch.id')$$, 'DUA_TANDA_TANGAN');
SELECT uji_gagal('topup tunai: penyetuju bukan staf ditolak',
    $$SELECT * FROM topup_tunai(4, 50000, 'tu@semesta.sch.id', 'orang@luar.com')$$, 'STAF_TIDAK_DIKENAL');
SELECT * FROM topup_tunai(4, 50000, 'tu@semesta.sch.id', 'tu2@semesta.sch.id', 'uang dari ortu via kantor') \gset tt_
SELECT uji_sama('topup tunai → saldo Alfian 50.000', saldo_siswa(4), 50000::bigint);
SELECT uji_sama('topup tunai tercatat terpisah (gateway=tunai)', (SELECT gateway FROM topup WHERE id = :tt_topup_id), 'tunai');
SELECT uji_sama('topup tunai masuk audit dengan penyetuju', (SELECT meta->>'disetujui_oleh' FROM audit_log WHERE aksi = 'topup_tunai' ORDER BY id DESC LIMIT 1), 'tu2@semesta.sch.id');

-- ---------- BAYAR & IDEMPOTENSI (F-14) ----------
SELECT * FROM bayar('KANTIN-01', 'k01-0001', '04A1B2C3D4E5F6', 15000, 'Belanja kantin') \gset b1_
SELECT uji_ok('bayar nominal → baru=true', :'b1_baru'::boolean);
SELECT uji_sama('saldo Rafif 185.000', saldo_siswa(1), 185000::bigint);
SELECT uji_sama('bayar mengembalikan nama siswa', :'b1_nama'::text, 'Rafif Gamma Wisanggeni');
SELECT uji_sama('transaksi tercatat layanan kantin', (SELECT layanan::text FROM transaksi WHERE id = :b1_transaksi_id), 'kantin');

SELECT * FROM bayar('KANTIN-01', 'k01-0001', '04A1B2C3D4E5F6', 15000, 'Belanja kantin') \gset b2_
SELECT uji_ok('kirim ulang idem sama → baru=false', NOT :'b2_baru'::boolean);
SELECT uji_sama('kirim ulang → transaksi id sama', :b2_transaksi_id::bigint, :b1_transaksi_id::bigint);
SELECT uji_sama('kirim ulang tidak memotong lagi', saldo_siswa(1), 185000::bigint);
-- Kunci dari terminal kini berawalan perangkat (audit §1.1), jadi uji ini
-- harus memakai kunci yang sama persis dengan yang tersimpan.
SELECT uji_gagal('idem sama nominal beda ditolak (posting)',
    $$SELECT posting('belanja', akun_siswa(1), akun_kode('KANTIN'), 999, 1,
                     idem_perangkat((SELECT id FROM device WHERE kode = 'KANTIN-01'), 'k01-0001'))$$,
    'IDEMPOTENSI_BEDA');
SELECT uji_gagal('idem terlalu pendek ditolak', $$SELECT * FROM bayar('KANTIN-01', 'abc', '04A1B2C3D4E5F6', 1000, 'x')$$, 'IDEM_WAJIB');
SELECT uji_gagal('nominal 0 ditolak', $$SELECT * FROM bayar('KANTIN-01', 'k01-0002', '04A1B2C3D4E5F6', 0, 'x')$$, 'NOMINAL_TIDAK_VALID');

-- ---------- PIN (F-31, F-32, F-33) ----------
SELECT uji_gagal('di atas ambang tanpa PIN ditolak', $$SELECT * FROM bayar('KANTIN-01', 'k01-0003', '04A1B2C3D4E5F6', 30000, 'x')$$, 'BUTUH_PIN');
SELECT pin_set(1, repeat('a', 64), 'tu@semesta.sch.id', TRUE);
SELECT uji_ok('pin_info: harus ganti setelah reset TU', (SELECT harus_ganti FROM pin_info(1)));
SELECT pin_set(1, repeat('b', 64), 'siswa', FALSE);
SELECT uji_ok('pin_info: setelah ganti sendiri tidak harus ganti', NOT (SELECT harus_ganti FROM pin_info(1)));
SELECT uji_sama('audit ubah_pin & reset_pin tercatat', (SELECT COUNT(*) FROM audit_log WHERE aksi IN ('reset_pin','ubah_pin') AND objek = 'siswa:1')::int, 2);

SELECT * FROM bayar('KANTIN-01', 'k01-0003', '04A1B2C3D4E5F6', 30000, 'Belanja besar', TRUE) \gset b3_
SELECT uji_sama('di atas ambang dengan PIN ok → saldo 155.000', saldo_siswa(1), 155000::bigint);
SELECT uji_ok('transaksi ditandai pakai_pin', (SELECT pakai_pin FROM transaksi WHERE id = :b3_transaksi_id));

-- salah 5x → terkunci
SELECT pin_catat(1, FALSE, 1) FROM generate_series(1, 4);
SELECT * FROM pin_catat(1, FALSE, 1) \gset pk_
SELECT uji_ok('salah PIN 5x → terkunci', :'pk_terkunci'::boolean);
SELECT uji_ok('pin_info melaporkan terkunci', (SELECT terkunci FROM pin_info(1)));
SELECT uji_gagal('bayar dengan PIN saat terkunci ditolak', $$SELECT * FROM bayar('KANTIN-01', 'k01-0004', '04A1B2C3D4E5F6', 30000, 'x', TRUE)$$, 'PIN_TERKUNCI');
SELECT uji_sama('audit pin_terkunci tercatat', (SELECT COUNT(*) FROM audit_log WHERE aksi = 'pin_terkunci' AND objek = 'siswa:1')::int, 1);
SELECT pin_buka_kunci(1, 'tu@semesta.sch.id');
SELECT uji_ok('TU buka kunci → tidak terkunci', NOT (SELECT terkunci FROM pin_info(1)));
SELECT * FROM pin_catat(1, TRUE, 1) \gset pk2_
SELECT uji_sama('PIN benar → sisa percobaan penuh', :pk2_sisa_percobaan::int, 5);
SELECT uji_sama('setiap percobaan PIN tercatat', (SELECT COUNT(*) FROM percobaan_pin WHERE siswa_id = 1)::int, 6);
SELECT uji_gagal('pin_catat untuk siswa tanpa PIN ditolak', $$SELECT * FROM pin_catat(3, FALSE)$$, 'PIN_BELUM_ADA');

-- ---------- ITEM & TOTAL SERVER (F-41) ----------
SELECT uji_gagal('total tidak sama dengan jumlah item ditolak',
    $$SELECT * FROM bayar('KANTIN-01', 'k01-0005', '04FFEE11223344', 10000, 'x', FALSE, FALSE, now(), NULL,
        '[{"nama":"Nasi ayam","harga_rp":12000,"qty":1}]')$$, 'TOTAL_BEDA');
SELECT * FROM bayar('KANTIN-01', 'k01-0005', '04FFEE11223344', NULL, 'Mode menu', FALSE, FALSE, now(), NULL,
        '[{"nama":"Nasi ayam","harga_rp":12000,"qty":1,"ref_id":1},{"nama":"Es teh","harga_rp":3000,"qty":2,"ref_id":2}]') \gset bm_
SELECT uji_sama('total dihitung server dari item = 18.000', :bm_total_rp::bigint, 18000::bigint);
SELECT uji_sama('item tersimpan (2 baris)', (SELECT COUNT(*) FROM transaksi_item WHERE transaksi_id = :bm_transaksi_id)::int, 2);
SELECT uji_sama('saldo Aisha 82.000', saldo_siswa(2), 82000::bigint);

-- ---------- LIMIT HARIAN (F-17) ----------
-- Rafif hari ini sudah belanja 45.000 (15k + 30k). Limit sekolah 50.000.
SELECT uji_gagal('melebihi limit harian ditolak', $$SELECT * FROM bayar('KANTIN-01', 'k01-0006', '04A1B2C3D4E5F6', 10000, 'x')$$, 'LIMIT_HARIAN');
SELECT * FROM bayar('KANTIN-01', 'k01-0006', '04A1B2C3D4E5F6', 5000, 'pas di limit') \gset b4_
SELECT uji_sama('pas di limit diterima → 50.000 terpakai', belanja_hari(1, hari_ini()), 50000::bigint);
SELECT uji_gagal('wali menaikkan limit di atas plafon ditolak', $$SELECT limit_wali_set(1, 75000)$$, 'MELEBIHI_PLAFON');
SELECT limit_wali_set(1, 30000);   -- ayah: 30.000
SELECT limit_wali_set(2, 40000);   -- ibu: 40.000 → yang terendah berlaku
SELECT uji_sama('dua ortu → limit terendah berlaku', limit_harian_efektif(1), 30000::bigint);
SELECT uji_sama('siswa tanpa setelan wali → plafon sekolah', limit_harian_efektif(2), 50000::bigint);
SELECT uji_sama('audit ubah_limit_harian', (SELECT COUNT(*) FROM audit_log WHERE aksi = 'ubah_limit_harian')::int, 2);

-- ---------- SALDO KURANG (F-12) ----------
SELECT uji_gagal('saldo kurang ditolak dengan pesan jelas', $$SELECT * FROM bayar('LNDRY-01', 'ld-00001', '04C0FFEE000001', 5000, 'laundry', TRUE)$$, 'SALDO_KURANG');
SELECT uji_gagal('ledger langsung minus juga ditolak DB', $$INSERT INTO entri_ledger (transaksi_id, akun_id, nominal_rp) VALUES (1, akun_siswa(3), -999999999), (1, akun_kode('KANTIN'), 999999999)$$, 'tidak mencukupi');
SELECT uji_gagal('ledger tetap append-only', $$UPDATE entri_ledger SET nominal_rp = 1 WHERE id = 1$$, 'append-only');

-- ---------- LAUNDRY WAJIB PIN ----------
SELECT * FROM topup_tunai(3, 100000, 'tu@semesta.sch.id', 'tu2@semesta.sch.id') \gset tk_
SELECT uji_gagal('laundry tanpa PIN ditolak walau kecil', $$SELECT * FROM bayar('LNDRY-01', 'ld-00002', '04C0FFEE000001', 5000, 'laundry')$$, 'BUTUH_PIN');

-- ---------- KARTU (F-02, F-03, §9) ----------
SELECT id AS kartu_lama FROM kartu WHERE uid = '04C0FFEE000001' \gset
SELECT kartu_cabut(:kartu_lama, 'hilang', 'siswa', 'lapor dari portal');
SELECT uji_gagal('kartu hilang ditolak seketika', $$SELECT * FROM bayar('KANTIN-01', 'k01-0007', '04C0FFEE000001', 1000, 'x')$$, 'KARTU_DIBLOKIR');
SELECT uji_ok('kartu hilang muncul di feed kartu_dicabut_sejak', EXISTS (SELECT 1 FROM kartu_dicabut_sejak(now() - interval '1 minute') WHERE uid = '04C0FFEE000001'));
SELECT kartu_aktifkan_lagi(:kartu_lama, 'tu@semesta.sch.id');
SELECT * FROM bayar('KANTIN-01', 'k01-0007', '04C0FFEE000001', 1000, 'kartu ketemu') \gset bk_
SELECT uji_ok('kartu ketemu → aktif lagi → bisa bayar', :'bk_baru'::boolean);
SELECT kartu_cabut(:kartu_lama, 'hilang', 'siswa', 'hilang lagi');
SELECT kartu_terbit(3, '04:de:ad:be:ef:00:01', 'tu@semesta.sch.id') AS kartu_baru \gset
SELECT uji_sama('UID dinormalisasi (hex uppercase tanpa pemisah)', (SELECT uid FROM kartu WHERE id = :kartu_baru), '04DEADBEEF0001');
SELECT uji_gagal('kartu lama tidak bisa hidup lagi setelah pengganti terbit', $$SELECT kartu_aktifkan_lagi($$ || :kartu_lama || $$, 'tu@semesta.sch.id')$$, 'SUDAH_ADA_PENGGANTI');
SELECT uji_gagal('dua kartu aktif ditolak DB', $$INSERT INTO kartu (uid, siswa_id) VALUES ('04AAAAAAAAAAAA', 3)$$, 'satu_kartu_aktif');
SELECT uji_gagal('UID lama tidak bisa diterbitkan ulang', $$SELECT kartu_terbit(3, '04C0FFEE000001', 'tu@semesta.sch.id')$$, 'UID_SUDAH_ADA');
SELECT * FROM bayar('KANTIN-01', 'k01-0008', '04DEADBEEF0001', 2000, 'kartu baru') \gset bk2_
SELECT uji_sama('riwayat tetap di siswa yang sama (2 transaksi kantin Keenan)', (SELECT COUNT(*) FROM transaksi WHERE siswa_id = 3 AND jenis = 'belanja')::int, 2);
SELECT uji_sama('saldo Keenan utuh lintas kartu: 97.000', saldo_siswa(3), 97000::bigint);
SELECT uji_gagal('kartu asing ditolak', $$SELECT * FROM identifikasi_kartu('0400000000FFFF')$$, 'KARTU_TIDAK_DIKENAL');

-- impor massal
SELECT uji_sama('kartu_impor: 1 ok, 1 NIS salah, 1 sudah punya kartu',
    (SELECT string_agg(berhasil::text, ',' ORDER BY nis) FROM kartu_impor('[{"nis":"23004","uid":"04A1F1A0000001"},{"nis":"99999","uid":"0411"},{"nis":"26001","uid":"0422222222"}]', 'it@semesta.sch.id')),
    'true,false,false');

-- ---------- STATUS SISWA (F-06) ----------
SELECT siswa_ubah_status(2, 'cuti', 'tu@semesta.sch.id', 'sakit');
SELECT uji_gagal('siswa cuti → kartu tidak bisa transaksi', $$SELECT * FROM bayar('KANTIN-01', 'k01-0009', '04FFEE11223344', 1000, 'x')$$, 'SISWA_NONAKTIF');
SELECT uji_ok('kartu siswa cuti muncul di feed pencabutan', EXISTS (SELECT 1 FROM kartu_dicabut_sejak(now() - interval '1 minute') WHERE uid = '04FFEE11223344'));
SELECT siswa_ubah_status(2, 'aktif', 'tu@semesta.sch.id', 'kembali');
SELECT * FROM bayar('KANTIN-01', 'k01-0009', '04FFEE11223344', 1000, 'kembali aktif') \gset bc_
SELECT uji_ok('cuti → aktif tanpa kartu baru', :'bc_baru'::boolean);

-- ---------- MODE DARURAT NIS + PIN (§9) ----------
SELECT uji_gagal('NIS tanpa PIN ditolak', $$SELECT * FROM bayar('KANTIN-01', 'k01-0010', NULL, 5000, 'x', FALSE, FALSE, now(), '23004')$$, 'BUTUH_PIN');
SELECT * FROM bayar('KANTIN-01', 'k01-0010', NULL, 5000, 'darurat', TRUE, FALSE, now(), '23004') \gset bn_
SELECT uji_ok('NIS + PIN → tercatat tanpa_kartu', (SELECT tanpa_kartu FROM transaksi WHERE id = :bn_transaksi_id));

-- ---------- OFFLINE (F-43, F-44) ----------
SELECT uji_gagal('offline di atas limit device ditolak', $$SELECT * FROM bayar('KANTIN-02', 'k02-off-0', '04A1B2C3D4E5F6', 30000, 'x', FALSE, TRUE)$$, 'MELEBIHI_LIMIT_OFFLINE');
SELECT uji_gagal('offline dengan PIN mustahil (F-33)', $$SELECT * FROM bayar('KANTIN-02', 'k02-off-0', '04A1B2C3D4E5F6', 10000, 'x', TRUE, TRUE)$$, 'OFFLINE_TANPA_PIN');
-- Keenan saldo 97.000: 3 item offline, item ke-2 pakai kartu yang sudah hilang, item ke-3 melebihi limit harian
-- Waktu terminal dibangun dari now(), bukan tanggal mati: suite harus bisa
-- dijalankan hari apa pun (audit §5.3), dan sejak 010 waktu offline
-- divalidasi terhadap jendela 48 jam (audit §2.1).
SELECT to_char(now() - interval '30 minutes', 'YYYY-MM-DD"T"HH24:MI:SSOF:00') AS w1,
       to_char(now() - interval '29 minutes', 'YYYY-MM-DD"T"HH24:MI:SSOF:00') AS w2,
       to_char(now() - interval '28 minutes', 'YYYY-MM-DD"T"HH24:MI:SSOF:00') AS w3 \gset
SELECT format($j$[
 {"idempotency_key":"k02-off-1","kartu_uid":"04deadbeef0001","nominal_rp":20000,"waktu_terminal":"%s","keterangan":"offline 1"},
 {"idempotency_key":"k02-off-2","kartu_uid":"04C0FFEE000001","nominal_rp":5000,"waktu_terminal":"%s"},
 {"idempotency_key":"k02-off-3","kartu_uid":"04DEADBEEF0001","nominal_rp":30000,"waktu_terminal":"%s","items":[{"nama":"Paket","harga_rp":30000,"qty":1}]}
]$j$, :'w1', :'w2', :'w3') AS js \gset
SELECT * FROM antrian_terima('KANTIN-02', :'js'::jsonb) \gset at_
SELECT uji_sama('antrian diterima 3', :at_diterima::int, 3);
SELECT * FROM antrian_proses('KANTIN-02') \gset ap_
SELECT uji_sama('antrian: 1 diproses', :ap_diproses::int, 1);
SELECT uji_sama('antrian: 2 ditolak (kartu hilang, di atas limit offline)', :ap_ditolak::int, 2);
SELECT uji_sama('item di atas limit offline ditolak dgn alasan', (SELECT alasan_tolak FROM antrian_offline WHERE idempotency_key = 'k02-off-3'), 'transaksi offline maksimal Rp 25000');
SELECT uji_sama('item kartu hilang ditolak dengan alasan', (SELECT alasan_tolak FROM antrian_offline WHERE idempotency_key = 'k02-off-2'), 'kartu diblokir (status: hilang)');
SELECT uji_ok('item valid diproses & menunjuk transaksi', (SELECT status = 'diproses' AND transaksi_id IS NOT NULL FROM antrian_offline WHERE idempotency_key = 'k02-off-1'));
SELECT uji_ok('transaksi offline ditandai offline=true dgn waktu terminal', (SELECT offline AND waktu_terminal = :'w1'::timestamptz FROM transaksi WHERE idempotency_key = (SELECT 'dev' || id || ':k02-off-1' FROM device WHERE kode = 'KANTIN-02')));
SELECT uji_sama('audit offline_ditolak tercatat', (SELECT COUNT(*) FROM audit_log WHERE aksi = 'offline_ditolak')::int, :ap_ditolak::int);
SELECT format($j$[{"idempotency_key":"k02-off-1","kartu_uid":"04DEADBEEF0001","nominal_rp":20000,"waktu_terminal":"%s"}]$j$, :'w1') AS js2 \gset
SELECT * FROM antrian_terima('KANTIN-02', :'js2'::jsonb) \gset at2_
SELECT uji_sama('kirim ulang antrian → duplikat, tidak diproses dua kali', :at2_duplikat::int, 1);
SELECT uji_sama('saldo Keenan setelah offline: 97.000 − 20.000', saldo_siswa(3), 77000::bigint);

-- ---------- BATAL KASIR (F-45) ----------
SELECT * FROM bayar('KANTIN-01', 'k01-0011', '04FFEE11223344', 7000, 'akan dibatalkan') \gset bb_
SELECT uji_gagal('batal transaksi yang bukan terakhir ditolak', $$SELECT batal_kasir('KANTIN-01', $$ || :bm_transaksi_id || $$)$$, 'BUKAN_TERAKHIR');
SELECT uji_gagal('batal dari terminal lain ditolak', $$SELECT batal_kasir('KANTIN-02', $$ || :bb_transaksi_id || $$)$$, 'TIDAK_DITEMUKAN');
SELECT batal_kasir('KANTIN-01', :bb_transaksi_id) AS refund_id \gset bt_
SELECT uji_sama('batal kasir → saldo Aisha kembali', saldo_siswa(2), 82000 - 1000::bigint);
SELECT uji_sama('refund pembatalan menunjuk transaksi asal', (SELECT ref_transaksi_id FROM transaksi WHERE id = :bt_refund_id), :bb_transaksi_id::bigint);
SELECT uji_gagal('batal dua kali ditolak', $$SELECT batal_kasir('KANTIN-01', $$ || :bb_transaksi_id || $$)$$, 'SUDAH_REFUND');
UPDATE transaksi SET dibuat = now() - interval '10 minutes' WHERE id = :bc_transaksi_id;
SELECT * FROM bayar('KANTIN-01', 'k01-0012', '04FFEE11223344', 1000, 'lama') \gset bl_
UPDATE transaksi SET dibuat = now() - interval '10 minutes' WHERE id = :bl_transaksi_id;
SELECT uji_gagal('batal lewat 5 menit ditolak', $$SELECT batal_kasir('KANTIN-01', $$ || :bl_transaksi_id || $$)$$, 'LEWAT_WAKTU');

-- ---------- REFUND & KOREKSI KEUANGAN (F-13, F-16) ----------
SELECT uji_gagal('refund tanpa alasan ditolak', $$SELECT refund($$ || :bm_transaksi_id || $$, 5000, '', 'keuangan@semesta.sch.id')$$, 'ALASAN_WAJIB');
SELECT refund(:bm_transaksi_id, 5000, 'es teh tidak ada', 'keuangan@semesta.sch.id') AS r1 \gset rf_
SELECT uji_sama('refund sebagian 5.000 → saldo Aisha 85.000', saldo_siswa(2), 85000::bigint);
SELECT uji_gagal('refund melebihi sisa ditolak', $$SELECT refund($$ || :bm_transaksi_id || $$, 14000, 'x', 'keuangan@semesta.sch.id')$$, 'MELEBIHI_ASAL');
SELECT refund(:bm_transaksi_id, NULL, 'sisanya', 'keuangan@semesta.sch.id') AS r2 \gset rf2_
SELECT uji_sama('refund sisa (NULL = semua sisa) → total refund 18.000', sudah_direfund(:bm_transaksi_id), 18000::bigint);
SELECT uji_gagal('refund atas refund ditolak', $$SELECT refund($$ || :rf_r1 || $$, 1000, 'x', 'keuangan@semesta.sch.id')$$, 'TIDAK_BISA_REFUND');
SELECT uji_gagal('koreksi tanpa rujukan ditolak', $$SELECT koreksi(2, 1000, 'salah', 'keuangan@semesta.sch.id', NULL)$$, 'REF_WAJIB');
SELECT uji_gagal('koreksi tanpa alasan ditolak', $$SELECT koreksi(2, 1000, '', 'keuangan@semesta.sch.id', 1)$$, 'ALASAN_WAJIB');
SELECT koreksi(2, -4000, 'kelebihan refund', 'keuangan@semesta.sch.id', :rf2_r2) AS k1 \gset ko_
SELECT uji_sama('koreksi negatif → saldo Aisha 94.000', saldo_siswa(2), 94000::bigint);
SELECT uji_gagal('constraint DB: refund tanpa ref ditolak', $$INSERT INTO transaksi (jenis, siswa_id, total_rp) VALUES ('refund', 2, 1)$$, 'refund_koreksi_wajib_ref');
SELECT uji_sama('koreksi/refund tercatat di audit', (SELECT COUNT(*) FROM audit_log WHERE aksi IN ('refund','koreksi'))::int, 4);

-- ---------- TAGIHAN MENUNGGU ----------
INSERT INTO tagihan (siswa_id, sumber, ref, keterangan, nominal_rp) VALUES (2, 'perpustakaan', 'pinjaman:1', 'Denda telat 3 hari', 3000) RETURNING id \gset tg_
SELECT tagihan_bayar(:tg_id, 'wali:3') AS tid \gset tgb_
SELECT uji_sama('tagihan dibayar → saldo 91.000', saldo_siswa(2), 91000::bigint);
SELECT uji_sama('tagihan lunas & menunjuk transaksi denda', (SELECT status::text || ':' || (SELECT jenis::text FROM transaksi WHERE id = tagihan.transaksi_id) FROM tagihan WHERE id = :tg_id), 'lunas:denda');
SELECT uji_gagal('tagihan dibayar dua kali ditolak', $$SELECT tagihan_bayar($$ || :tg_id || $$, 'wali:3')$$, 'STATUS_TIDAK_SESUAI');
SELECT uji_gagal('bebaskan tagihan tanpa alasan ditolak', $$SELECT tagihan_bebaskan($$ || :tg_id || $$, 'x', '')$$, 'ALASAN_WAJIB');

-- ---------- TRANSFER MATI (§8.4) ----------
SELECT uji_gagal('transfer antar-siswa dimatikan', $$SELECT posting('transfer', akun_siswa(1), akun_siswa(2), 1000, 1)$$, 'TRANSFER_NONAKTIF');

-- ---------- PENARIKAN (§9) ----------
SELECT uji_gagal('penarikan siswa aktif ditolak', $$SELECT penarikan(4, 'BCA 123', 'keuangan@semesta.sch.id')$$, 'SISWA_MASIH_AKTIF');
SELECT siswa_ubah_status(4, 'keluar', 'tu@semesta.sch.id', 'pindah kota');
SELECT uji_sama('siswa keluar → kartu ditarik', (SELECT status::text FROM kartu WHERE siswa_id = 4), 'ditarik');
SELECT uji_gagal('penarikan tanpa bukti ditolak', $$SELECT penarikan(4, '', 'keuangan@semesta.sch.id')$$, 'BUKTI_WAJIB');
SELECT penarikan(4, 'transfer BCA 12345 tgl 2/9', 'keuangan@semesta.sch.id') AS pid \gset pn_
SELECT uji_sama('penarikan → saldo 0', saldo_siswa(4), 0::bigint);
SELECT uji_sama('penarikan tercatat jenis penarikan 45.000', (SELECT total_rp FROM transaksi WHERE id = :pn_pid AND jenis = 'penarikan'), 45000::bigint);
SELECT uji_gagal('penarikan saldo kosong ditolak', $$SELECT penarikan(4, 'x', 'keuangan@semesta.sch.id')$$, 'SALDO_KOSONG');

-- ---------- KEBIJAKAN (F-33, F-49 audit) ----------
SELECT uji_gagal('ambang PIN tidak bisa diubah sendirian', $$SELECT kebijakan_set('ambang_pin_rp', '30000', 'it@semesta.sch.id')$$, 'F33');
SELECT kebijakan_set_ambang_pin(30000, 'it@semesta.sch.id');
SELECT uji_ok('ambang PIN & limit offline berubah bersama', kebijakan_int('ambang_pin_rp') = 30000 AND kebijakan_int('limit_offline_rp') = 30000);
SELECT kebijakan_set_ambang_pin(25000, 'it@semesta.sch.id');
SELECT uji_sama('menurunkan ambang menurunkan limit device', (SELECT MAX(limit_offline_rp) FROM device), 25000);
SELECT uji_gagal('po_tidak_diambil nilai aneh ditolak', $$SELECT kebijakan_set('po_tidak_diambil', '"hangus"', 'it@semesta.sch.id')$$, 'NILAI_TIDAK_VALID');
SELECT uji_gagal('jam PO format salah ditolak', $$SELECT kebijakan_set('po_tutup', '"jam sembilan"', 'it@semesta.sch.id')$$);
SELECT kebijakan_set('po_tutup', '"10:00"', 'it@semesta.sch.id');
SELECT uji_sama('perubahan kebijakan masuk audit dgn sebelum/sesudah', (SELECT meta->>'sebelum' FROM audit_log WHERE objek = 'kebijakan:po_tutup' ORDER BY id DESC LIMIT 1), '09:30');

-- ---------- TAHUN AJARAN & KENAIKAN KELAS (F-04) ----------
INSERT INTO tahun_ajaran (kode, mulai, selesai) VALUES ('2027/2028', '2027-07-15', '2028-06-30') RETURNING id \gset ta_
SELECT naik_kelas(:ta_id::smallint, '[{"siswa_id":1,"kelas":"8.A"},{"siswa_id":2,"kelas":"8.A"},{"siswa_id":3,"kelas":"9.B"}]', 'tu@semesta.sch.id') AS n \gset nk_
SELECT uji_sama('naik kelas massal 3 siswa', :nk_n::int, 3);
SELECT tahun_ajaran_aktifkan(:ta_id::smallint, 'tu@semesta.sch.id');
SELECT uji_sama('kelas Rafif di TA baru = 8.A', (SELECT kelas FROM identifikasi_kartu('04A1B2C3D4E5F6')), '8.A');
SELECT uji_sama('riwayat kelas TA lama tetap terbaca', (SELECT kelas FROM penempatan_kelas WHERE siswa_id = 1 AND tahun_ajaran_id = 1), '7.A');
SELECT tahun_ajaran_aktifkan(1::smallint, 'tu@semesta.sch.id');

-- ---------- REKONSILIASI (F-15, §8.4) ----------
SELECT * FROM rekonsiliasi_malam() \gset rk_
SELECT uji_sama('rekonsiliasi: selisih 0', :rk_jumlah_selisih::int, 0);
SELECT uji_sama('total float = jumlah saldo siswa', :rk_total_float_rp::bigint, (SELECT SUM(saldo_rp)::bigint FROM saldo_ledger WHERE jenis = 'siswa'));
UPDATE saldo_cache SET saldo_rp = saldo_rp + 1 WHERE akun_id = akun_siswa(1);
SELECT uji_sama('cache melenceng terdeteksi', (SELECT jumlah_selisih FROM rekonsiliasi_malam()), 1);
SELECT bangun_ulang_saldo();
SELECT uji_sama('bangun ulang cache → selisih 0 lagi', (SELECT jumlah_selisih FROM rekonsiliasi_malam()), 0);
SELECT uji_ok('setiap transaksi seimbang', NOT EXISTS (SELECT transaksi_id FROM entri_ledger GROUP BY transaksi_id HAVING SUM(nominal_rp) <> 0 OR COUNT(*) < 2));
