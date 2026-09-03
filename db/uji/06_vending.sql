-- =====================================================================
-- UJI VENDING (F-110–F-116) — Aisha (2) saldo 66.000
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;
SELECT uji_berkas('06_vending');
-- Keluaran per-pernyataan disenyapkan oleh pemanggil (migrate.sh / harness),
-- bukan oleh `\o /dev/null` — perintah itu hanya ada di Unix dan membuat
-- seluruh suite gagal di Windows, padahal tim IT sekolah memakai Windows.

SELECT uji_gagal('harga di atas ambang PIN ditolak (F-110)', $$SELECT vending_produk_simpan(NULL, 'Mahal', 30000, TRUE, 'x')$$, 'DI_ATAS_AMBANG_PIN');
SELECT uji_gagal('harga bukan kelipatan 500 ditolak', $$SELECT vending_produk_simpan(NULL, 'X', 4300, TRUE, 'x')$$, 'NILAI_TIDAK_VALID');
SELECT vending_produk_simpan(NULL, 'Air mineral', 4000, TRUE, 'it@semesta.sch.id') AS pr_air \gset
SELECT vending_produk_simpan(NULL, 'Susu kotak', 6000, TRUE, 'it@semesta.sch.id') AS pr_susu \gset
SELECT vending_slot_atur('VEND-01', 'a1', :pr_air, 10, 'it@semesta.sch.id') AS slot_a1 \gset
SELECT vending_slot_atur('VEND-01', 'A2', :pr_susu, 10, 'it@semesta.sch.id') AS slot_a2 \gset
SELECT uji_sama('slot dinormalisasi uppercase', (SELECT slot FROM slot_vending WHERE id = :slot_a1), 'A1');

SELECT uji_gagal('mesin belum diatur jam → ditolak', $$SELECT * FROM vending_mulai('VEND-01', 'vd-00001', '04FFEE11223344', 'A1')$$, 'MESIN_BELUM_DIATUR');
SELECT vending_daftarkan_mesin('VEND-01', '00:00', '23:59', 'it@semesta.sch.id');
SELECT uji_sama('mesin vending: limit offline dipaksa 0 (F-110)', (SELECT limit_offline_rp FROM device WHERE kode = 'VEND-01'), 0);
SELECT uji_gagal('produk belum disetujui kesiswaan → ditolak (F-115)', $$SELECT * FROM vending_mulai('VEND-01', 'vd-00001', '04FFEE11223344', 'A1')$$, 'PRODUK_TIDAK_VALID');
SELECT vending_produk_setujui(:pr_air, TRUE, 'kesiswaan@semesta.sch.id');
SELECT vending_produk_setujui(:pr_susu, TRUE, 'kesiswaan@semesta.sch.id');
SELECT uji_gagal('stok habis → ditolak', $$SELECT * FROM vending_mulai('VEND-01', 'vd-00001', '04FFEE11223344', 'A1')$$, 'STOK_HABIS');
SELECT uji_gagal('restock melebihi kapasitas ditolak', $$SELECT * FROM vending_restock('VEND-01', 'A1', 20, NULL, 'x')$$, 'MELEBIHI_KAPASITAS');
SELECT * FROM vending_restock('VEND-01', 'A1', 10, 0, 'pengelola@semesta.sch.id') \gset rs_
SELECT * FROM vending_restock('VEND-01', 'A2', 10, NULL, 'pengelola@semesta.sch.id') \gset rs2_
SELECT uji_sama('restock A1 → 10, selisih 0', :rs_stok_akhir::int || ':' || :rs_selisih::int, '10:0');
SELECT uji_gagal('slot tak ada ditolak', $$SELECT * FROM vending_mulai('VEND-01', 'vd-00001', '04FFEE11223344', 'Z9')$$, 'SLOT_TIDAK_ADA');

-- dua fase sukses
SELECT * FROM vending_mulai('VEND-01', 'vd-00001', '04FFEE11223344', 'A1') \gset v1_
SELECT uji_sama('saldo DITAHAN: 66.000 → 62.000 (pending)', :v1_saldo_rp::bigint, 62000::bigint);
SELECT uji_sama('transaksi berstatus pending', (SELECT status::text FROM transaksi WHERE id = :v1_transaksi_id), 'pending');
SELECT * FROM vending_mulai('VEND-01', 'vd-00001', '04FFEE11223344', 'A1') \gset v1b_
SELECT uji_ok('retry controller idem sama → baru=false', NOT :'v1b_baru'::boolean);
SELECT * FROM vending_konfirmasi('VEND-01', :v1_transaksi_id, TRUE) \gset c1_
SELECT uji_sama('sensor ok → selesai, stok 9', :'c1_status'::text || ':' || (SELECT stok FROM slot_vending WHERE id = :slot_a1), 'selesai:9');
SELECT * FROM vending_konfirmasi('VEND-01', :v1_transaksi_id, TRUE) \gset c1b_
SELECT uji_sama('konfirmasi dobel idempoten', :'c1b_status'::text, 'selesai');
SELECT belanja_hari(2, hari_ini()) AS bh0 \gset

-- dua fase gagal → refund otomatis, slot ditandai (F-111)
SELECT * FROM vending_mulai('VEND-01', 'vd-00002', '04FFEE11223344', 'A1') \gset v2_
SELECT uji_sama('ditahan lagi: 58.000', :v2_saldo_rp::bigint, 58000::bigint);
SELECT * FROM vending_konfirmasi('VEND-01', :v2_transaksi_id, FALSE) \gset c2_
SELECT uji_sama('sensor gagal → batal, saldo kembali 62.000', :'c2_status'::text || ':' || :c2_saldo_rp, 'batal:62000');
SELECT uji_ok('refund menunjuk transaksi asal', (SELECT ref_transaksi_id = :v2_transaksi_id FROM transaksi WHERE id = :c2_refund_transaksi_id));
SELECT uji_ok('slot A1 ditandai bermasalah, stok tetap 9', (SELECT bermasalah AND stok = 9 FROM slot_vending WHERE id = :slot_a1));
SELECT uji_sama('IT diberi tahu lewat audit vending_gagal', (SELECT COUNT(*) FROM audit_log WHERE aksi = 'vending_gagal')::int, 1);
SELECT uji_gagal('slot bermasalah menolak pembelian', $$SELECT * FROM vending_mulai('VEND-01', 'vd-00003', '04FFEE11223344', 'A1')$$, 'SLOT_NONAKTIF');
SELECT uji_ok('planogram: A1 tidak bisa dibeli', NOT (SELECT bisa_dibeli FROM v_planogram WHERE slot_id = :slot_a1));
SELECT vending_slot_pulihkan('VEND-01', 'A1', 'it@semesta.sch.id', 'dicek, jalur lancar');
SELECT uji_ok('planogram: A1 bisa dibeli lagi', (SELECT bisa_dibeli FROM v_planogram WHERE slot_id = :slot_a1));
SELECT uji_sama('batal (dan refund-nya) tidak mengubah belanja harian', belanja_hari(2, hari_ini()), :bh0::bigint);

-- batas harian vending (F-112): 3 transaksi / 20.000
SELECT * FROM vending_mulai('VEND-01', 'vd-00004', '04FFEE11223344', 'A2') \gset v4_
SELECT * FROM vending_konfirmasi('VEND-01', :v4_transaksi_id, TRUE) \gset c4_
SELECT * FROM vending_mulai('VEND-01', 'vd-00005', '04FFEE11223344', 'A2') \gset v5_
SELECT * FROM vending_konfirmasi('VEND-01', :v5_transaksi_id, TRUE) \gset c5_
SELECT uji_sama('3 transaksi vending selesai hari ini, Rp 16.000', (SELECT COUNT(*) || ':' || SUM(total_rp) FROM transaksi WHERE siswa_id = 2 AND layanan = 'vending' AND jenis = 'belanja' AND status = 'selesai'), '3:16000');
SELECT uji_gagal('transaksi ke-4 ditolak (batas 3/hari)', $$SELECT * FROM vending_mulai('VEND-01', 'vd-00006', '04FFEE11223344', 'A1')$$, 'VENDING_BATAS');
-- batas rupiah: Keenan 2 transaksi × 6.000 lalu 6.000 lagi = 18.000 ok, tapi kalau maks_rp 15.000 → tolak
SELECT kebijakan_set('vending_maks_rp', '10000', 'it@semesta.sch.id');
SELECT * FROM vending_mulai('VEND-01', 'vd-00007', '04DEADBEEF0001', 'A2') \gset v7_
SELECT uji_gagal('melebihi rupiah harian vending ditolak (pending ikut dihitung)', $$SELECT * FROM vending_mulai('VEND-01', 'vd-00008', '04DEADBEEF0001', 'A2')$$, 'VENDING_BATAS');
SELECT kebijakan_set('vending_maks_rp', '20000', 'it@semesta.sch.id');

-- timeout pending (controller mati) → batal + refund
UPDATE transaksi_vending SET mulai = now() - interval '5 minutes' WHERE transaksi_id = :v7_transaksi_id;
SELECT uji_sama('job kedaluwarsa membatalkan 1', vending_pending_kedaluwarsa(), 1);
SELECT uji_sama('Keenan tidak terpotong (56.000 utuh)', saldo_siswa(3), 56000::bigint);
SELECT uji_sama('alasan batal = timeout', (SELECT alasan_batal FROM transaksi_vending WHERE transaksi_id = :v7_transaksi_id), 'timeout 90 detik tanpa konfirmasi sensor');
SELECT vending_slot_pulihkan('VEND-01', 'A2', 'it@semesta.sch.id');

-- jam aktif (F-113): jendela yang PASTI tidak mencakup sekarang
SELECT vending_daftarkan_mesin('VEND-02', (waktu_sekolah() + interval '1 hour')::time, (waktu_sekolah() + interval '2 hour')::time, 'it@semesta.sch.id');
SELECT vending_slot_atur('VEND-02', 'A1', :pr_air, 10, 'it@semesta.sch.id') AS slot_b1 \gset
SELECT * FROM vending_restock('VEND-02', 'A1', 5, NULL, 'x') \gset
SELECT uji_gagal('di luar jam aktif mesin → ditolak', $$SELECT * FROM vending_mulai('VEND-02', 'vd-00009', '04DEADBEEF0001', 'A1')$$, 'DI_LUAR_JAM');
SELECT uji_gagal('mesin vending tidak menerima transaksi offline (limit 0)', $$SELECT * FROM bayar('VEND-01', 'vd-off-001', '04DEADBEEF0001', 4000, 'x', FALSE, TRUE)$$, 'MELEBIHI_LIMIT_OFFLINE');

-- sengketa (F-116)
SELECT uji_gagal('sengketa atas transaksi batal ditolak (dana tidak terpotong)', $$SELECT vending_sengketa($$ || :v2_transaksi_id || $$, 2, 'siswa', 'x')$$, 'STATUS_TIDAK_SESUAI');
SELECT uji_gagal('sengketa siswa lain ditolak', $$SELECT vending_sengketa($$ || :v1_transaksi_id || $$, 3, 'siswa', 'x')$$, 'TIDAK_DITEMUKAN');
SELECT vending_sengketa(:v1_transaksi_id, 2, 'wali:3', 'botol tidak keluar') AS sg \gset
SELECT uji_gagal('sengketa dobel ditolak', $$SELECT vending_sengketa($$ || :v1_transaksi_id || $$, 2, 'siswa', 'x')$$, 'SUDAH_ADA');
SELECT uji_ok('sengketa menyimpan log sensor', (SELECT log_sensor->>'sensor_ok' = 'true' FROM sengketa_vending WHERE id = :sg));
SELECT vending_sengketa_putus(:sg, TRUE, 'keuangan@semesta.sch.id', 'log sensor meragukan, dikabulkan') AS rid \gset
SELECT uji_sama('dikabulkan → refund 4.000, saldo Aisha 54.000', saldo_siswa(2), 54000::bigint);
SELECT uji_gagal('putus dua kali ditolak', $$SELECT vending_sengketa_putus($$ || :sg || $$, FALSE, 'x', 'y')$$, 'TIDAK_DITEMUKAN');

-- restock dengan hitungan fisik → selisih tampil (F-114)
SELECT * FROM vending_restock('VEND-01', 'A2', 3, 6, 'pengelola@semesta.sch.id', 'hitung fisik') \gset rs3_
SELECT uji_sama('stok sistem 8 (10−2), fisik 6 → selisih −2, akhir 9', :rs3_selisih::int || ':' || :rs3_stok_akhir::int, '-2:9');
SELECT uji_sama('planogram menampilkan selisih terakhir', (SELECT selisih_terakhir FROM v_planogram WHERE slot_id = :slot_a2)::int, -2);
SELECT uji_ok('semua transaksi tetap seimbang', NOT EXISTS (SELECT transaksi_id FROM entri_ledger GROUP BY transaksi_id HAVING SUM(nominal_rp) <> 0 OR COUNT(*) < 2));
SELECT uji_sama('rekonsiliasi akhir: selisih 0', (SELECT jumlah_selisih FROM rekonsiliasi_malam()), 0);
