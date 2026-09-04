-- =====================================================================
-- UJI REGRESI — temuan audit 3 September 2026
--
-- Setiap uji di sini menutup satu bug yang PERNAH ADA dan sudah dibuktikan
-- bisa dieksploitasi. Kalau salah satu gagal, artinya perbaikannya tercabut.
-- Jangan menghapus uji di berkas ini tanpa membaca dokumen auditnya dulu:
--   claude/smart-campus/audit-keamanan-2026-09-03.md
--   claude/smart-campus/audit-keamanan-bagian-2.md
-- =====================================================================
\set ON_ERROR_STOP on
SELECT uji_berkas('08_regresi_audit');

-- Siswa uji khusus supaya tidak mengganggu perhitungan berkas lain.
SELECT siswa_tambah('90001', 'Regresi Satu', 'regresi1@semesta.sch.id', 'SMP', TRUE, '7.R', 'uji') AS rs1 \gset
SELECT siswa_tambah('90002', 'Regresi Dua',  'regresi2@semesta.sch.id', 'SMP', TRUE, '7.R', 'uji') AS rs2 \gset
SELECT kartu_terbit(:rs1, '04AA0000009001', 'uji');
SELECT kartu_terbit(:rs2, '04AA0000009002', 'uji');
SELECT topup_tunai(:rs1, 200000, 'tu@semesta.sch.id', 'tu2@semesta.sch.id', 'regresi');
SELECT topup_tunai(:rs2, 200000, 'tu@semesta.sch.id', 'tu2@semesta.sch.id', 'regresi');

-- ---------------------------------------------------------------------
-- §1.1 KRITIS — kunci idempotensi tidak boleh lintas perangkat
-- ---------------------------------------------------------------------
SELECT * FROM bayar('KANTIN-01', 'regresi-idem-1', '04AA0000009001', 5000, 'belanja regresi') \gset r1_
SELECT uji_sama('§1.1 belanja pertama tercatat', :r1_total_rp::bigint, 5000::bigint);

-- Terminal lain memakai kunci yang sama: DULU mengembalikan transaksi milik
-- siswa lain dan "berhasil" tanpa memotong siapa pun. Sekarang jadi
-- transaksi baru milik siswa yang benar, karena kuncinya beda ruang nama.
SELECT * FROM bayar('KANTIN-02', 'regresi-idem-1', '04AA0000009002', 7000, 'terminal lain') \gset r2_
SELECT uji_ok('§1.1 kunci sama dari terminal lain = transaksi BARU', :'r2_baru'::boolean);
SELECT uji_sama('§1.1 siswa kedua benar-benar dipotong', saldo_siswa(:rs2), 193000::bigint);
SELECT uji_sama('§1.1 nominal terminal kedua sesuai yang diminta', :r2_total_rp::bigint, 7000::bigint);

-- Kunci sama, perangkat sama, nominal beda → harus ditolak, bukan diam-diam
-- mengembalikan transaksi lama.
SELECT uji_gagal('§1.1 kunci sama nominal beda ditolak',
  $$SELECT * FROM bayar('KANTIN-01', 'regresi-idem-1', '04AA0000009001', 99000, 'x')$$, 'IDEMPOTENSI_BEDA');

-- Kiriman ulang yang sah (kunci, perangkat, nominal sama) tetap idempoten.
SELECT * FROM bayar('KANTIN-01', 'regresi-idem-1', '04AA0000009001', 5000, 'kirim ulang') \gset r3_
SELECT uji_ok('§1.1 kiriman ulang yang sah tetap idempoten', NOT :'r3_baru'::boolean);
SELECT uji_sama('§1.1 kiriman ulang tidak memotong dua kali', saldo_siswa(:rs1), 195000::bigint);

-- Terminal tidak bisa menyerobot ruang nama internal. DULU: terminal memakai
-- kunci 'topup:<invoice>' lebih dulu → pembayaran orang tua ditelan
-- (saldo tidak bertambah, invoice tetap tercatat lunas).
SELECT topup_buat(:rs1, 50000, 'simulasi', 'wali:uji') AS tp \gset
SELECT topup_set_invoice(:tp, 'INV-REGRESI-1', 'http://x', now() + interval '1 day');
SELECT * FROM bayar('KANTIN-01', 'topup:INV-REGRESI-1', '04AA0000009001', 3000, 'serobot') \gset r4_
SELECT * FROM topup_lunas('INV-REGRESI-1', now(), 50000, 'simulasi') \gset tl_
SELECT uji_ok('§1.1 top-up tetap membuat transaksi sendiri (tidak terserobot)', :'tl_baru'::boolean);
SELECT uji_sama('§1.1 saldo bertambah penuh setelah top-up', saldo_siswa(:rs1), (195000 - 3000 + 50000)::bigint);

-- ---------------------------------------------------------------------
-- §2.1 — jam terminal tidak boleh dipakai menembus limit harian
-- ---------------------------------------------------------------------
SELECT uji_gagal('§2.1 jam terminal meleset jauh ditolak (online)',
  $$SELECT * FROM bayar('KANTIN-01', 'regresi-waktu-1', '04AA0000009001', 5000, 'x', FALSE, FALSE, now() - interval '2 days')$$,
  'WAKTU_TIDAK_VALID');
SELECT uji_gagal('§2.1 jam terminal di masa depan ditolak (online)',
  $$SELECT * FROM bayar('KANTIN-01', 'regresi-waktu-2', '04AA0000009001', 5000, 'x', FALSE, FALSE, now() + interval '3 days')$$,
  'WAKTU_TIDAK_VALID');
SELECT uji_gagal('§2.1 offline dengan waktu di masa depan ditolak',
  $$SELECT * FROM bayar('KANTIN-02', 'regresi-waktu-3', '04AA0000009001', 5000, 'x', FALSE, TRUE, now() + interval '1 day')$$,
  'WAKTU_TIDAK_VALID');
SELECT uji_gagal('§2.1 offline lebih tua dari 48 jam ditolak',
  $$SELECT * FROM bayar('KANTIN-02', 'regresi-waktu-4', '04AA0000009001', 5000, 'x', FALSE, TRUE, now() - interval '5 days')$$,
  'WAKTU_TIDAK_VALID');

-- ---------------------------------------------------------------------
-- §2.2 — refund kemarin tidak boleh membuat belanja hari ini negatif
-- ---------------------------------------------------------------------
-- Belanja kemarin (lewat antrian offline, satu-satunya jalur sah untuk
-- waktu terminal mundur), lalu direfund hari ini.
SELECT to_char(now() - interval '20 hours', 'YYYY-MM-DD"T"HH24:MI:SSOF:00') AS wk \gset
SELECT format($j$[{"idempotency_key":"regresi-kemarin","kartu_uid":"04AA0000009002","nominal_rp":20000,"waktu_terminal":"%s"}]$j$, :'wk') AS jsk \gset
SELECT * FROM antrian_terima('KANTIN-02', :'jsk'::jsonb);
SELECT * FROM antrian_proses('KANTIN-02');
SELECT id AS tk FROM transaksi
 WHERE idempotency_key = (SELECT 'dev' || id || ':regresi-kemarin' FROM device WHERE kode = 'KANTIN-02') \gset
SELECT refund(:tk, NULL, 'regresi §2.2', 'keuangan@semesta.sch.id');
SELECT uji_ok('§2.2 belanja hari ini tidak negatif setelah refund kemarin',
  belanja_hari(:rs2, hari_ini()) >= 0);
SELECT uji_sama('§2.2 refund dihitung pada tanggal transaksi asalnya',
  belanja_hari(:rs2, tgl_sekolah(now() - interval '20 hours')), 0::bigint);

-- ---------------------------------------------------------------------
-- §2.3 — plafon saldo memperhitungkan invoice yang masih berjalan
-- ---------------------------------------------------------------------
SELECT siswa_tambah('90003', 'Regresi Plafon', 'regresi3@semesta.sch.id', 'SMA', FALSE, '10.R', 'uji') AS rs3 \gset
SELECT topup_buat(:rs3, 500000, 'simulasi', 'wali:uji');
SELECT topup_buat(:rs3, 500000, 'simulasi', 'wali:uji');
SELECT uji_gagal('§2.3 invoice ketiga menembus plafon ditolak',
  $$SELECT topup_buat($$ || :rs3 || $$, 500000, 'simulasi', 'wali:uji')$$, 'MELEBIHI_PLAFON');

-- ---------------------------------------------------------------------
-- §2.4 — batal_kasir tidak boleh menyentuh transaksi tanpa perangkat
-- ---------------------------------------------------------------------
-- Tagihan yang dibayar lewat portal tidak punya device_id. DULU:
-- 'asal.device_id <> d.id' bernilai NULL sehingga penjaganya tidak menyala,
-- dan terminal mana pun bisa membatalkannya.
INSERT INTO tagihan (siswa_id, sumber, ref, keterangan, nominal_rp, oleh)
VALUES (:rs1, 'locker', 'regresi', 'Regresi tagihan', 10000, 'asrama@semesta.sch.id')
RETURNING id AS tg \gset
SELECT tagihan_bayar(:tg, 'wali:uji') AS tgt \gset
SELECT uji_gagal('§2.4 terminal tidak bisa membatalkan transaksi tanpa perangkat',
  $$SELECT batal_kasir('KANTIN-01', $$ || :tgt || $$)$$, 'TIDAK_DITEMUKAN');

-- ---------------------------------------------------------------------
-- §3.1 — kunci PIN tidak boleh dibuka oleh PIN benar
-- ---------------------------------------------------------------------
SELECT pin_set(:rs1, repeat('r', 64), 'tu@semesta.sch.id', TRUE);
SELECT pin_catat(:rs1, FALSE) FROM generate_series(1, 5);
SELECT uji_ok('§3.1 PIN terkunci setelah 5 kali salah', (SELECT terkunci FROM pin_info(:rs1)));
SELECT pin_catat(:rs1, TRUE);
SELECT uji_ok('§3.1 PIN benar TIDAK membuka kunci', (SELECT terkunci FROM pin_info(:rs1)));
SELECT uji_ok('§3.1 percobaan saat terkunci tetap tercatat',
  (SELECT COUNT(*) FROM percobaan_pin WHERE siswa_id = :rs1 AND berhasil) >= 1);

-- ---------------------------------------------------------------------
-- §3.4 — bayar() hanya untuk belanja
-- ---------------------------------------------------------------------
SELECT uji_gagal('§3.4 bayar() menolak jenis denda (melewati limit harian)',
  $$SELECT * FROM bayar('KANTIN-01', 'regresi-jenis-1', '04AA0000009002', 5000, 'x', FALSE, FALSE, now(), NULL, NULL, 'denda')$$,
  'JENIS_TIDAK_VALID');
SELECT uji_gagal('§3.4 status non-selesai ditolak di terminal non-vending',
  $$SELECT * FROM bayar('KANTIN-01', 'regresi-status-1', '04AA0000009002', 5000, 'x', FALSE, FALSE, now(), NULL, NULL, 'belanja', 'pending')$$,
  'STATUS_TIDAK_SESUAI');

-- ---------------------------------------------------------------------
-- §3.5 — satu item cacat tidak boleh menggagalkan seluruh sinkron
-- ---------------------------------------------------------------------
SELECT to_char(now() - interval '10 minutes', 'YYYY-MM-DD"T"HH24:MI:SSOF:00') AS wc \gset
SELECT format($j$[
 {"idempotency_key":"regresi-baik-1","kartu_uid":"04AA0000009002","nominal_rp":1000,"waktu_terminal":"%s"},
 {"idempotency_key":"regresi-cacat-1","kartu_uid":"04AA0000009002","nominal_rp":0,"waktu_terminal":"%s"}
]$j$, :'wc', :'wc') AS jsc \gset
SELECT * FROM antrian_terima('KANTIN-02', :'jsc'::jsonb) \gset ac_
SELECT uji_sama('§3.5 item sehat tetap diterima walau ada item cacat', :ac_diterima::int, 1);
SELECT uji_ok('§3.5 item sehat benar-benar masuk antrian',
  EXISTS (SELECT 1 FROM antrian_offline WHERE idempotency_key = 'regresi-baik-1'));

-- ---------------------------------------------------------------------
-- §3.7 — webhook gateway lain tidak boleh melunasi invoice
-- ---------------------------------------------------------------------
SELECT topup_buat(:rs2, 50000, 'mayar', 'wali:uji') AS tp2 \gset
SELECT topup_set_invoice(:tp2, 'INV-REGRESI-2', 'http://x', now() + interval '1 day');
SELECT uji_gagal('§3.7 gateway berbeda ditolak',
  $$SELECT * FROM topup_lunas('INV-REGRESI-2', now(), 50000, 'simulasi')$$, 'GATEWAY_BEDA');

-- ---------------------------------------------------------------------
-- B2.7 — setiap pergerakan uang meninggalkan jejak audit
-- ---------------------------------------------------------------------
SELECT COUNT(*) AS audit_sebelum FROM audit_log \gset
SELECT * FROM bayar('KANTIN-01', 'regresi-audit-1', '04AA0000009002', 4000, 'uji audit');
SELECT uji_ok('B2.7 belanja menulis audit_log',
  (SELECT COUNT(*) FROM audit_log) > :audit_sebelum);
SELECT uji_ok('B2.7 audit belanja menyebut transaksinya',
  EXISTS (SELECT 1 FROM audit_log WHERE aksi = 'posting_belanja' AND objek = 'siswa:' || :rs2));
SELECT uji_ok('B2.7 tagihan_bayar juga tercatat (dulu tidak)',
  EXISTS (SELECT 1 FROM audit_log WHERE aksi = 'posting_denda' AND objek = 'siswa:' || :rs1));

-- ---------------------------------------------------------------------
-- B2.8 — kebijakan tidak boleh diisi nilai yang mematikan modul
-- ---------------------------------------------------------------------
SELECT uji_gagal('B2.8 kebijakan numerik menolak teks',
  $$SELECT kebijakan_set('laundry_min_kg', '"dua"', 'it@semesta.sch.id')$$, 'NILAI_TIDAK_VALID');
SELECT uji_gagal('B2.8 kebijakan numerik menolak negatif',
  $$SELECT kebijakan_set('limit_harian_rp', '-1', 'it@semesta.sch.id')$$, 'NILAI_TIDAK_VALID');
SELECT uji_gagal('B2.8 pin_maks_gagal minimal 3',
  $$SELECT kebijakan_set('pin_maks_gagal', '0', 'it@semesta.sch.id')$$, 'NILAI_TIDAK_VALID');
SELECT uji_gagal('B2.8 batal_kasir_menit minimal 1',
  $$SELECT kebijakan_set('batal_kasir_menit', '-5', 'it@semesta.sch.id')$$, 'NILAI_TIDAK_VALID');
SELECT uji_gagal('B2.8 saldo_rendah_rp tidak boleh di atas plafon',
  $$SELECT kebijakan_set('saldo_rendah_rp', '99999999', 'it@semesta.sch.id')$$, 'NILAI_TIDAK_VALID');
SELECT uji_gagal('B2.8 kebijakan boolean menolak angka',
  $$SELECT kebijakan_set('transfer_aktif', '1', 'it@semesta.sch.id')$$, 'NILAI_TIDAK_VALID');

-- ---------------------------------------------------------------------
-- B2.11 / B2.19 — identitas tidak boleh ganda karena huruf besar/kecil
-- ---------------------------------------------------------------------
SELECT uji_gagal('B2.11 email siswa ganda beda huruf ditolak',
  $$INSERT INTO siswa (nis, nama, email) VALUES ('90099', 'Huruf Besar', 'REGRESI1@semesta.sch.id')$$, NULL);
SELECT uji_gagal('B2.19 UID kartu huruf kecil ditolak',
  $$INSERT INTO kartu (uid, siswa_id) VALUES ('04aabbccdd0099', $$ || :rs1 || $$)$$, NULL);

-- ---------------------------------------------------------------------
-- B2.9 / B2.14 — pemeliharaan aman dijalankan berulang
-- ---------------------------------------------------------------------
SELECT bangun_ulang_saldo() AS bu1 \gset
SELECT bangun_ulang_saldo() AS bu2 \gset
SELECT uji_ok('B2.9 bangun_ulang_saldo bisa dijalankan dua kali', :bu2::int > 0);
SELECT uji_sama('B2.9 rekonsiliasi tetap 0 selisih setelah rebuild',
  (SELECT COUNT(*) FROM cek_rekonsiliasi())::int, 0);
SELECT * FROM rekonsiliasi_malam();
SELECT * FROM rekonsiliasi_malam();
SELECT uji_sama('B2.14 rekonsiliasi_malam idempoten (satu baris per tanggal)',
  (SELECT COUNT(*) FROM rekonsiliasi_log WHERE tanggal = hari_ini())::int, 1);

-- ---------------------------------------------------------------------
-- §2.5 (migrasi 011) — penyetuju top-up tunai harus punya wewenang uang
-- ---------------------------------------------------------------------
SELECT staf_simpan('laundry.uji@semesta.sch.id', 'Petugas Laundry', '{laundry}', TRUE, 'uji');
SELECT uji_gagal('§2.5 penyetuju tanpa peran keuangan/tu ditolak',
  $$SELECT * FROM topup_tunai($$ || :rs1 || $$, 20000, 'tu@semesta.sch.id', 'laundry.uji@semesta.sch.id')$$,
  'PERAN_TIDAK_CUKUP');
SELECT uji_gagal('§2.5 penginput tanpa peran keuangan/tu ditolak',
  $$SELECT * FROM topup_tunai($$ || :rs1 || $$, 20000, 'laundry.uji@semesta.sch.id', 'tu@semesta.sch.id')$$,
  'PERAN_TIDAK_CUKUP');
SELECT * FROM topup_tunai(:rs1, 20000, 'tu@semesta.sch.id', 'tu2@semesta.sch.id', 'regresi 2.5') \gset tt_
SELECT uji_ok('§2.5 dua staf berwenang tetap bisa top-up tunai', :tt_transaksi_id::bigint > 0);
SELECT uji_ok('§2.5 audit mencatat peran sungguhan penginput, bukan "tu" mati',
  EXISTS (SELECT 1 FROM audit_log WHERE aksi = 'topup_tunai' AND peran LIKE '%tu%' AND objek = 'siswa:' || :rs1));

-- ---------------------------------------------------------------------
-- 012 — daftar rak laundry (saran untuk terminal, bukan pembatas)
-- ---------------------------------------------------------------------
SELECT rak_laundry_simpan(' b-99 ', 'Uji', TRUE, 9::smallint, 'uji') AS rk \gset
SELECT uji_sama('012 kode rak dinormalkan huruf besar & tanpa spasi', :'rk'::text, 'B-99'::text);
SELECT uji_ok('012 rak tersimpan dan aktif',
  EXISTS (SELECT 1 FROM rak_laundry WHERE kode = 'B-99' AND aktif));
SELECT uji_gagal('012 kode rak kosong ditolak',
  $$SELECT rak_laundry_simpan('   ', NULL, TRUE, 0::smallint, 'uji')$$, 'NILAI_TIDAK_VALID');
SELECT uji_ok('012 perubahan rak tercatat di audit',
  EXISTS (SELECT 1 FROM audit_log WHERE aksi = 'simpan_rak_laundry' AND objek = 'rak:B-99'));

-- ---------------------------------------------------------------------
-- 013 — admin IT terakhir tidak boleh mencabut aksesnya sendiri
--
-- Fase 1.4a memindahkan pengelolaan peran dari SQL ke halaman admin. Tanpa
-- penjaga ini, satu klik bisa membuat sekolah kehilangan SATU-SATUNYA akun
-- yang boleh mengangkat admin baru, dan pemulihannya hanya lewat akses
-- langsung ke database produksi.
-- ---------------------------------------------------------------------
-- Sisakan tepat satu admin IT aktif: seed punya gm@ dan it@.
SELECT staf_simpan('gm@semesta.sch.id', 'Andy (GM)', '{manajemen,keuangan,tu}', TRUE, 'uji');
SELECT uji_ok('013 tepat satu admin IT aktif tersisa untuk uji',
  (SELECT COUNT(*) FROM staf WHERE aktif AND 'admin_it' = ANY(peran)) = 1);

SELECT uji_gagal('013 mencabut peran admin IT terakhir ditolak',
  $$SELECT staf_simpan('it@semesta.sch.id', 'Admin IT', '{tu}', TRUE, 'uji')$$,
  'ADMIN_TERAKHIR');
SELECT uji_gagal('013 menonaktifkan akun admin IT terakhir ditolak',
  $$SELECT staf_simpan('it@semesta.sch.id', 'Admin IT', '{admin_it}', FALSE, 'uji')$$,
  'ADMIN_TERAKHIR');
SELECT uji_ok('013 admin IT terakhir masih utuh setelah dua penolakan',
  EXISTS (SELECT 1 FROM staf WHERE email = 'it@semesta.sch.id' AND aktif AND 'admin_it' = ANY(peran)));

-- Dengan admin kedua, pencabutan kembali diizinkan — ini penghalang langkah
-- terakhir, bukan kunci permanen.
SELECT staf_simpan('it2@semesta.sch.id', 'Admin IT Dua', '{admin_it}', TRUE, 'uji');
SELECT staf_simpan('it@semesta.sch.id', 'Admin IT', '{tu}', TRUE, 'uji');
SELECT uji_ok('013 pencabutan diizinkan saat masih ada admin IT lain',
  NOT EXISTS (SELECT 1 FROM staf WHERE email = 'it@semesta.sch.id' AND 'admin_it' = ANY(peran)));
SELECT uji_ok('013 perubahan peran tercatat di audit',
  EXISTS (SELECT 1 FROM audit_log WHERE aksi = 'simpan_staf' AND objek = 'staf:it@semesta.sch.id'));

-- Kembalikan keadaan untuk berkas uji berikutnya.
SELECT staf_simpan('gm@semesta.sch.id', 'Andy (GM)', '{manajemen,admin_it,keuangan,tu}', TRUE, 'uji');
SELECT staf_simpan('it@semesta.sch.id', 'Admin IT', '{admin_it}', TRUE, 'uji');

-- ---------------------------------------------------------------------
-- 014 — status menu bisa diubah walau baris lamanya melanggar aturan baru
--
-- menu_simpan() menuntut harga kelipatan Rp 100; tabelnya sendiri hanya
-- menuntut > 0. Baris lama yang masuk lewat impor karena itu tidak bisa
-- dihentikan penjualannya lewat menu_simpan — dan menghentikan penjualan
-- justru hal yang biasanya mendesak.
-- ---------------------------------------------------------------------
INSERT INTO menu (nama, harga_rp, aktif, po_bisa) VALUES ('X', 50, TRUE, TRUE) RETURNING id AS mlama \gset
SELECT uji_gagal('014 menu_simpan menolak baris lama (harga bukan kelipatan 100)',
  $$SELECT menu_simpan($$ || :mlama || $$, 'X', NULL, 50, FALSE, NULL, NULL, 'uji')$$,
  'NILAI_TIDAK_VALID');

SELECT menu_status(:mlama, FALSE, NULL, 'uji');
SELECT uji_ok('014 menu_status tetap bisa menghentikan penjualannya',
  (SELECT NOT aktif AND po_bisa FROM menu WHERE id = :mlama));

SELECT menu_status(:mlama, NULL, FALSE, 'uji');
SELECT uji_ok('014 menu_status mengubah po_bisa tanpa menyentuh aktif',
  (SELECT NOT aktif AND NOT po_bisa FROM menu WHERE id = :mlama));

SELECT uji_gagal('014 menu_status menolak panggilan tanpa perubahan',
  $$SELECT menu_status($$ || :mlama || $$, NULL, NULL, 'uji')$$, 'NILAI_TIDAK_VALID');
SELECT uji_gagal('014 menu_status menolak menu yang tidak ada',
  $$SELECT menu_status(999999, FALSE, NULL, 'uji')$$, 'TIDAK_DITEMUKAN');
SELECT uji_ok('014 perubahan status menu tercatat di audit',
  EXISTS (SELECT 1 FROM audit_log WHERE aksi = 'ubah_status_menu' AND objek = 'menu:' || :mlama));

-- ---------------------------------------------------------------------
-- 015 — akses staf tetap bisa dicabut walau barisnya melanggar aturan baru
--
-- Pencabutan akses adalah aksi yang paling mendesak saat ada masalah, jadi
-- ia tidak boleh bergantung pada validasi kolom yang tidak disentuh.
-- ---------------------------------------------------------------------
INSERT INTO staf (email, nama, peran, aktif)
VALUES ('warisan@semesta.sch.id', 'X', '{tu}', TRUE);
-- Nama 1 huruf hanya ditolak validator route (v.str min 2), bukan SQL — jadi
-- baris seperti ini bisa masuk lewat impor. Yang diuji di sini: SQL tetap
-- membiarkan aksesnya dicabut.
SELECT staf_status('warisan@semesta.sch.id', FALSE, 'uji');
SELECT uji_ok('015 staf dengan data warisan tetap bisa dinonaktifkan',
  (SELECT NOT aktif FROM staf WHERE email = 'warisan@semesta.sch.id'));
SELECT uji_ok('015 pencabutan akses tercatat di audit',
  EXISTS (SELECT 1 FROM audit_log WHERE aksi = 'ubah_status_staf' AND objek = 'staf:warisan@semesta.sch.id'));

SELECT staf_status('warisan@semesta.sch.id', TRUE, 'uji');
SELECT uji_ok('015 bisa diaktifkan lagi',
  (SELECT aktif FROM staf WHERE email = 'warisan@semesta.sch.id'));

SELECT uji_gagal('015 staf tidak dikenal ditolak',
  $$SELECT staf_status('bukansiapa@semesta.sch.id', FALSE, 'uji')$$, 'TIDAK_DITEMUKAN');

-- Penjaga 013 tidak boleh bisa dilewati lewat jalur ini.
SELECT staf_simpan('gm@semesta.sch.id', 'Andy (GM)', '{manajemen,keuangan,tu}', TRUE, 'uji');
SELECT staf_simpan('it2@semesta.sch.id', 'Admin IT Dua', '{tu}', TRUE, 'uji');
SELECT staf_simpan('it@semesta.sch.id', 'Admin IT', '{admin_it}', TRUE, 'uji');
SELECT uji_ok('015 tepat satu admin IT aktif tersisa untuk uji',
  (SELECT COUNT(*) FROM staf WHERE aktif AND 'admin_it' = ANY(peran)) = 1);
SELECT uji_gagal('015 staf_status bukan jalan memutar untuk penjaga admin terakhir',
  $$SELECT staf_status('it@semesta.sch.id', FALSE, 'uji')$$, 'ADMIN_TERAKHIR');
SELECT uji_ok('015 admin IT terakhir masih aktif setelah penolakan',
  (SELECT aktif FROM staf WHERE email = 'it@semesta.sch.id'));

-- Kembalikan keadaan.
SELECT staf_simpan('gm@semesta.sch.id', 'Andy (GM)', '{manajemen,admin_it,keuangan,tu}', TRUE, 'uji');

-- ---------------------------------------------------------------------
-- 016 (§2.5) — dua tanda tangan top-up tunai yang sungguhan
--
-- Yang diuji bukan "ada dua nama di baris audit", melainkan bahwa
-- persetujuan TIDAK BISA dilakukan oleh peminta sendiri, tidak bisa oleh
-- orang tanpa wewenang, dan tidak bisa dipakai lagi keesokan harinya.
-- ---------------------------------------------------------------------
SELECT saldo_siswa(:rs2) AS s2_awal \gset
SELECT topup_tunai_minta(:rs2, 50000, 'uji dua tanda tangan', 'tu@semesta.sch.id') AS pm1 \gset

SELECT uji_ok('016 permintaan belum menggerakkan uang sepeser pun',
  saldo_siswa(:rs2) = :s2_awal);
SELECT uji_ok('016 permintaan muncul di daftar menunggu',
  EXISTS (SELECT 1 FROM v_topup_tunai_menunggu WHERE id = :pm1));

SELECT uji_gagal('016 peminta tidak bisa menyetujui permintaannya sendiri',
  $$SELECT * FROM topup_tunai_putus($$ || :pm1 || $$, TRUE, 'tu@semesta.sch.id')$$,
  'DUA_TANDA_TANGAN');
SELECT uji_ok('016 saldo tetap setelah percobaan menyetujui diri sendiri',
  saldo_siswa(:rs2) = :s2_awal);

SELECT staf_simpan('pustaka.uji@semesta.sch.id', 'Pustakawan Uji', '{pustakawan}', TRUE, 'uji');
SELECT uji_gagal('016 staf tanpa peran keuangan/tu tidak bisa menyetujui',
  $$SELECT * FROM topup_tunai_putus($$ || :pm1 || $$, TRUE, 'pustaka.uji@semesta.sch.id')$$,
  'PERAN_TIDAK_CUKUP');

SELECT * FROM topup_tunai_putus(:pm1, TRUE, 'tu2@semesta.sch.id') \gset p1_
SELECT uji_sama('016 staf kedua berwenang bisa menyetujui', :'p1_status'::text, 'disetujui'::text);
SELECT uji_ok('016 saldo bertambah tepat sebesar nominal',
  saldo_siswa(:rs2) = :s2_awal + 50000);
SELECT uji_gagal('016 permintaan yang sudah diputus tidak bisa diputus lagi',
  $$SELECT * FROM topup_tunai_putus($$ || :pm1 || $$, TRUE, 'tu2@semesta.sch.id')$$,
  'STATUS_TIDAK_SESUAI');
SELECT uji_ok('016 audit mencatat peminta dan penyetuju sebagai dua orang berbeda',
  EXISTS (SELECT 1 FROM audit_log
           WHERE aksi = 'topup_tunai' AND objek = 'siswa:' || :rs2
             AND aktor = 'tu@semesta.sch.id'
             AND meta->>'disetujui_oleh' = 'tu2@semesta.sch.id'));

-- Penolakan
SELECT topup_tunai_minta(:rs2, 20000, NULL, 'tu@semesta.sch.id') AS pm2 \gset
SELECT * FROM topup_tunai_putus(:pm2, FALSE, 'tu2@semesta.sch.id', 'uang tidak saya lihat') \gset p2_
SELECT uji_sama('016 penolakan tercatat', :'p2_status'::text, 'ditolak'::text);
SELECT uji_ok('016 penolakan tidak menambah saldo',
  saldo_siswa(:rs2) = :s2_awal + 50000);

-- Pembatalan hanya oleh peminta
SELECT topup_tunai_minta(:rs2, 20000, NULL, 'tu@semesta.sch.id') AS pm3 \gset
SELECT uji_gagal('016 orang lain tidak bisa membatalkan permintaan peminta',
  $$SELECT topup_tunai_batal($$ || :pm3 || $$, 'tu2@semesta.sch.id')$$, 'BUKAN_PEMINTA');
SELECT topup_tunai_batal(:pm3, 'tu@semesta.sch.id');
SELECT uji_ok('016 peminta bisa membatalkan permintaannya sendiri',
  (SELECT status = 'dibatalkan' FROM topup_tunai_permintaan WHERE id = :pm3));

-- Kedaluwarsa: persetujuan tidak boleh bisa dipakai besok pagi.
SELECT kebijakan_set('topup_tunai_kedaluwarsa_menit', '0'::jsonb, 'uji');
SELECT topup_tunai_minta(:rs2, 20000, NULL, 'tu@semesta.sch.id') AS pm4 \gset
SELECT uji_ok('016 permintaan kedaluwarsa tidak muncul di daftar menunggu',
  NOT EXISTS (SELECT 1 FROM v_topup_tunai_menunggu WHERE id = :pm4));
SELECT saldo_siswa(:rs2) AS s2_sebelum_exp \gset
SELECT * FROM topup_tunai_putus(:pm4, TRUE, 'tu2@semesta.sch.id') \gset p4_
SELECT uji_sama('016 permintaan kedaluwarsa tidak jadi disetujui', :'p4_status'::text, 'kedaluwarsa'::text);
SELECT uji_ok('016 permintaan kedaluwarsa tidak menambah saldo',
  saldo_siswa(:rs2) = :s2_sebelum_exp);
-- Penandaan harus BERTAHAN. Kalau kedaluwarsa dilaporkan lewat exception,
-- UPDATE-nya ikut dibatalkan dan barisnya muncul lagi besok.
SELECT uji_ok('016 penandaan kedaluwarsa bertahan setelah fungsi selesai',
  (SELECT status = 'kedaluwarsa' FROM topup_tunai_permintaan WHERE id = :pm4));
SELECT kebijakan_set('topup_tunai_kedaluwarsa_menit', '30'::jsonb, 'uji');

-- Plafon menghitung permintaan yang masih menunggu (pelajaran §2.3).
SELECT kebijakan_set('plafon_saldo_rp', to_jsonb((saldo_siswa(:rs2) + 60000)::bigint), 'uji');
SELECT topup_tunai_minta(:rs2, 50000, NULL, 'tu@semesta.sch.id') AS pm5 \gset
SELECT uji_gagal('016 permintaan kedua ditolak karena yang pertama sudah memenuhi plafon',
  $$SELECT topup_tunai_minta($$ || :rs2 || $$, 50000, NULL, 'tu@semesta.sch.id')$$,
  'MELEBIHI_PLAFON');
SELECT topup_tunai_batal(:pm5, 'tu@semesta.sch.id');
SELECT kebijakan_set('plafon_saldo_rp', '1000000'::jsonb, 'uji');
