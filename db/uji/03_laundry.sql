-- =====================================================================
-- UJI LAUNDRY (F-50–F-52) — Rafif (1) saldo 150.000, Keenan (3) 56.000, Aisha (2) 69.000
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;
SELECT uji_berkas('03_laundry');
\o /dev/null

-- ---------- HITUNG ----------
SELECT uji_sama('3,2 kg → dibulatkan 3,5 kg × 7.000 + 2 seragam = 36.500',
    (SELECT total_rp FROM laundry_hitung(3.2, '[{"kode":"seragam","qty":2}]', FALSE)), 36500::bigint);
SELECT uji_sama('berat tercatat 3,5', (SELECT berat_kg FROM laundry_hitung(3.2, NULL, FALSE)), 3.5::numeric);
SELECT uji_sama('express +50% dibulatkan naik ke 500: 36.500 → 55.000',
    (SELECT total_rp FROM laundry_hitung(3.2, '[{"kode":"seragam","qty":2}]', TRUE)), 55000::bigint);
SELECT uji_sama('di bawah minimum ditagih 2 kg = 14.000', (SELECT total_rp FROM laundry_hitung(1.0, NULL, FALSE)), 14000::bigint);
SELECT uji_gagal('lebih dari 6 kg ditolak', $$SELECT * FROM laundry_hitung(6.5, NULL, FALSE)$$, 'MELEBIHI_MAKS_KG');
SELECT uji_gagal('item satuan tak dikenal ditolak', $$SELECT * FROM laundry_hitung(0, '[{"kode":"karpet","qty":1}]', FALSE)$$, 'ITEM_TIDAK_VALID');
SELECT uji_gagal('order kosong ditolak', $$SELECT * FROM laundry_hitung(0, '[]', FALSE)$$, 'ITEM_KOSONG');
SELECT uji_sama('hanya satuan (sepatu) = 20.000', (SELECT total_rp FROM laundry_hitung(NULL, '[{"kode":"sepatu","qty":1}]', FALSE)), 20000::bigint);
SELECT tarif_laundry_simpan('kiloan', 'Cuci kiloan (per kg)', 'kiloan', 8000, TRUE, 'asrama@semesta.sch.id');
SELECT uji_sama('tarif diubah dari dashboard → 2 kg = 16.000', (SELECT total_rp FROM laundry_hitung(2, NULL, FALSE)), 16000::bigint);
SELECT tarif_laundry_simpan('kiloan', 'Cuci kiloan (per kg)', 'kiloan', 7000, TRUE, 'asrama@semesta.sch.id');
SELECT uji_sama('perubahan tarif di audit', (SELECT COUNT(*) FROM audit_log WHERE aksi = 'ubah_tarif_laundry')::int, 2);

-- ---------- TERIMA (F-50: tanpa uang berpindah) ----------
SELECT uji_gagal('terima dari terminal kantin ditolak', $$SELECT * FROM laundry_terima('KANTIN-01', '04A1B2C3D4E5F6', 3.5, NULL, FALSE, 'x')$$, 'LAYANAN_TIDAK_VALID');
SELECT * FROM laundry_terima('LNDRY-01', '04A1B2C3D4E5F6', 3.5, NULL, FALSE, 'Pak Slamet', NULL, 'B-14') \gset o1_
SELECT uji_sama('order Rafif 3,5 kg = 24.500', :o1_total_rp::bigint, 24500::bigint);
SELECT uji_sama('kode order berurutan LDY-0001', :'o1_kode'::text, 'LDY-0001');
SELECT uji_sama('saldo Rafif TIDAK berubah saat terima', saldo_siswa(1), 150000::bigint);
SELECT uji_gagal('kartu hilang tidak bisa setor', $$SELECT * FROM laundry_terima('LNDRY-01', '04C0FFEE000001', 2, NULL, FALSE, 'x')$$, 'KARTU_DIBLOKIR');

-- ---------- STATUS & NOTIFIKASI ----------
SELECT laundry_ubah_status(:o1_order_id, 'diproses', 'asrama@semesta.sch.id');
SELECT uji_gagal('status diambil hanya lewat pembayaran', $$SELECT laundry_ubah_status($$ || :o1_order_id || $$, 'diambil', 'x')$$, 'STATUS_TIDAK_SESUAI');
SELECT uji_gagal('batal tanpa alasan ditolak', $$SELECT laundry_ubah_status($$ || :o1_order_id || $$, 'dibatalkan', 'x')$$, 'ALASAN_WAJIB');
SELECT laundry_ubah_status(:o1_order_id, 'siap', 'asrama@semesta.sch.id', 'B-14');
SELECT uji_sama('siap → ortu diberi tahu', (SELECT COUNT(*) FROM notifikasi WHERE jenis = 'laundry_siap' AND siswa_id = 1)::int, 1);
SELECT uji_ok('order tampil di daftar aktif dengan item', EXISTS (SELECT 1 FROM v_laundry_aktif WHERE kode = :'o1_kode' AND item LIKE '3.5× Cuci kiloan%'));

-- ---------- AMBIL & BAYAR (F-51) ----------
SELECT uji_gagal('kartu bukan pemilik ditolak', $$SELECT * FROM laundry_bayar('LNDRY-01', $$ || :o1_order_id || $$, '04FFEE11223344', TRUE)$$, 'BUKAN_PEMILIK');
SELECT uji_gagal('pemilik tanpa PIN ditolak (laundry wajib PIN)', $$SELECT * FROM laundry_bayar('LNDRY-01', $$ || :o1_order_id || $$, '04A1B2C3D4E5F6', FALSE)$$, 'BUTUH_PIN');
SELECT * FROM laundry_bayar('LNDRY-01', :o1_order_id, '04A1B2C3D4E5F6', TRUE) \gset lb_
SELECT uji_sama('lunas → saldo Rafif 125.500 (limit harian kantin tidak menghalangi laundry)', saldo_siswa(1), 125500::bigint);
SELECT uji_sama('order diambil & menunjuk transaksi', (SELECT status::text FROM order_laundry WHERE id = :o1_order_id AND transaksi_id = :lb_transaksi_id), 'diambil');
SELECT uji_sama('rak dikembalikan ke petugas', :'lb_rak'::text, 'B-14');
SELECT uji_ok('transaksi laundry punya item', EXISTS (SELECT 1 FROM transaksi_item WHERE transaksi_id = :lb_transaksi_id));
SELECT * FROM laundry_bayar('LNDRY-01', :o1_order_id, '04A1B2C3D4E5F6', TRUE) \gset lb2_
SELECT uji_sama('bayar ulang (retry) idempoten — transaksi sama', :lb2_transaksi_id::bigint, :lb_transaksi_id::bigint);
SELECT uji_sama('saldo tidak terpotong dua kali', saldo_siswa(1), 125500::bigint);
SELECT uji_gagal('ubah status order yang sudah diambil ditolak', $$SELECT laundry_ubah_status($$ || :o1_order_id || $$, 'siap', 'x')$$, 'STATUS_TIDAK_SESUAI');

-- ---------- TUNGGAKAN ----------
SELECT * FROM laundry_terima('LNDRY-01', '04DEADBEEF0001', 2, '[{"kode":"sepatu","qty":1}]', TRUE, 'Pak Slamet') \gset o2_
SELECT uji_sama('Keenan 2 kg + sepatu express: (14.000+20.000)×1,5 = 51.000', :o2_total_rp::bigint, 51000::bigint);
SELECT laundry_ubah_status(:o2_order_id, 'siap', 'asrama@semesta.sch.id', 'B-09');
UPDATE order_laundry SET siap_pada = now() - interval '8 days' WHERE id = :o2_order_id;
SELECT uji_ok('siap > 7 hari belum diambil → tampil tunggakan', EXISTS (SELECT 1 FROM v_laundry_tunggakan WHERE id = :o2_order_id AND hari_menunggu >= 8));
SELECT laundry_ubah_status(:o2_order_id, 'dibatalkan', 'asrama@semesta.sch.id', NULL, 'siswa pulang, cucian diambil ortu');
SELECT uji_sama('dibatalkan oleh petugas tercatat', (SELECT dibatalkan_oleh FROM order_laundry WHERE id = :o2_order_id), 'asrama@semesta.sch.id');
SELECT uji_sama('laundry tidak pernah menyentuh ledger kecuali saat bayar', (SELECT COUNT(*) FROM transaksi WHERE layanan = 'laundry')::int, 1);
