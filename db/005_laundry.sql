-- =====================================================================
-- 005 — LAUNDRY (Fase 2) — PRD §7.6 (F-50–F-52)
-- "Layanan yang ditagih belakangan": terima cucian tanpa uang berpindah,
-- bayar saat ambil dengan PIN (wajib, F-31), kartu harus milik pemilik order.
-- =====================================================================

CREATE TYPE jenis_tarif_laundry AS ENUM ('kiloan', 'satuan');

CREATE TABLE tarif_laundry (
    id        SERIAL PRIMARY KEY,
    kode      TEXT NOT NULL UNIQUE,          -- 'kiloan', 'seragam', 'jas', ...
    nama      TEXT NOT NULL,
    jenis     jenis_tarif_laundry NOT NULL,
    harga_rp  BIGINT NOT NULL CHECK (harga_rp > 0),   -- kiloan: per kg
    aktif     BOOLEAN NOT NULL DEFAULT TRUE,
    diubah    TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO tarif_laundry (kode, nama, jenis, harga_rp) VALUES
 ('kiloan',   'Cuci kiloan (per kg)', 'kiloan', 7000),
 ('seragam',  'Seragam (setel)',      'satuan', 6000),
 ('jas',      'Jas / blazer',         'satuan', 15000),
 ('sepatu',   'Sepatu (pasang)',      'satuan', 20000),
 ('bedcover', 'Bed cover',            'satuan', 25000);

CREATE OR REPLACE FUNCTION tarif_laundry_simpan(p_kode TEXT, p_nama TEXT, p_jenis jenis_tarif_laundry, p_harga_rp BIGINT, p_aktif BOOLEAN, p_aktor TEXT)
RETURNS INTEGER AS $$
DECLARE lama tarif_laundry; tid INTEGER;
BEGIN
    IF p_harga_rp IS NULL OR p_harga_rp <= 0 OR p_harga_rp % 100 <> 0 THEN
        RAISE EXCEPTION 'harga harus kelipatan Rp 100' USING HINT = 'NILAI_TIDAK_VALID';
    END IF;
    SELECT * INTO lama FROM tarif_laundry WHERE kode = p_kode FOR UPDATE;
    INSERT INTO tarif_laundry (kode, nama, jenis, harga_rp, aktif) VALUES (p_kode, p_nama, p_jenis, p_harga_rp, COALESCE(p_aktif, TRUE))
    ON CONFLICT (kode) DO UPDATE SET nama = EXCLUDED.nama, jenis = EXCLUDED.jenis, harga_rp = EXCLUDED.harga_rp,
                                     aktif = COALESCE(p_aktif, tarif_laundry.aktif), diubah = now()
    RETURNING id INTO tid;
    PERFORM catat_audit(p_aktor, NULL, 'ubah_tarif_laundry', 'tarif_laundry:' || p_kode,
        jsonb_build_object('sebelum', CASE WHEN lama.id IS NULL THEN NULL ELSE jsonb_build_object('harga_rp', lama.harga_rp, 'aktif', lama.aktif) END,
                           'sesudah', jsonb_build_object('harga_rp', p_harga_rp, 'aktif', p_aktif)));
    RETURN tid;
END $$ LANGUAGE plpgsql;

CREATE TYPE status_laundry AS ENUM ('diterima', 'diproses', 'siap', 'diambil', 'dibatalkan');
CREATE SEQUENCE order_laundry_kode_seq;

CREATE TABLE order_laundry (
    id               BIGSERIAL PRIMARY KEY,
    kode             TEXT NOT NULL UNIQUE DEFAULT 'LDY-' || lpad(nextval('order_laundry_kode_seq')::text, 4, '0'),
    siswa_id         BIGINT NOT NULL REFERENCES siswa(id),
    device_terima_id BIGINT REFERENCES device(id),
    petugas          TEXT,
    berat_kg         NUMERIC(4,1) NOT NULL DEFAULT 0 CHECK (berat_kg >= 0),   -- sudah dibulatkan
    express          BOOLEAN NOT NULL DEFAULT FALSE,
    total_rp         BIGINT NOT NULL CHECK (total_rp > 0),
    status           status_laundry NOT NULL DEFAULT 'diterima',
    rak              TEXT,
    catatan          TEXT,
    dibuat           TIMESTAMPTZ NOT NULL DEFAULT now(),
    siap_pada        TIMESTAMPTZ,
    diambil_pada     TIMESTAMPTZ,
    transaksi_id     BIGINT REFERENCES transaksi(id),
    dibatalkan_oleh  TEXT
);
CREATE INDEX ON order_laundry (siswa_id, dibuat DESC);
CREATE INDEX ON order_laundry (status) WHERE status <> 'diambil';

CREATE TABLE order_laundry_item (
    id        BIGSERIAL PRIMARY KEY,
    order_id  BIGINT NOT NULL REFERENCES order_laundry(id) ON DELETE CASCADE,
    tarif_id  INTEGER REFERENCES tarif_laundry(id),
    nama      TEXT NOT NULL,
    harga_rp  BIGINT NOT NULL,
    qty       NUMERIC(6,1) NOT NULL CHECK (qty > 0)    -- kg untuk kiloan, buah untuk satuan
);
CREATE INDEX ON order_laundry_item (order_id);

-- Hitung tagihan dari berat + satuan. p_items: [{"kode":"seragam","qty":2}]
-- Aturan: kiloan dibulatkan NAIK ke 0,5 kg, minimum & maksimum dari kebijakan,
-- express +N% dibulatkan naik ke Rp 500.
CREATE OR REPLACE FUNCTION laundry_hitung(p_berat_kg NUMERIC, p_items JSONB, p_express BOOLEAN)
RETURNS TABLE (total_rp BIGINT, berat_kg NUMERIC, items JSONB) AS $$
DECLARE mn NUMERIC := kebijakan_int('laundry_min_kg'); mx NUMERIC := kebijakan_int('laundry_maks_kg');
        persen INTEGER := kebijakan_int('laundry_express_persen');
        kg NUMERIC := 0; t_kilo tarif_laundry;
        sub_kilo BIGINT := 0; sub_satuan BIGINT := 0; it_kilo JSONB := '[]'::jsonb; it_satuan JSONB := '[]'::jsonb;
        sub BIGINT; n INTEGER; n_valid INTEGER;
BEGIN
    IF COALESCE(p_berat_kg, 0) > 0 THEN
        kg := ceil(p_berat_kg * 2) / 2.0;                       -- bulatkan naik ke 0,5 kg
        IF kg < mn THEN kg := mn; END IF;                       -- minimum yang ditagih
        IF kg > mx THEN
            RAISE EXCEPTION 'maksimal % kg per order — pecah menjadi 2 order', mx USING HINT = 'MELEBIHI_MAKS_KG';
        END IF;
        SELECT * INTO t_kilo FROM tarif_laundry WHERE kode = 'kiloan' AND aktif;
        IF t_kilo.id IS NULL THEN RAISE EXCEPTION 'tarif kiloan tidak aktif' USING HINT = 'TARIF_TIDAK_ADA'; END IF;
        sub_kilo := (kg * t_kilo.harga_rp)::BIGINT;
        it_kilo := jsonb_build_array(jsonb_build_object('tarif_id', t_kilo.id, 'nama', t_kilo.nama, 'harga_rp', t_kilo.harga_rp, 'qty', kg));
    END IF;
    IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
        n := jsonb_array_length(p_items);
        SELECT COUNT(*), COALESCE(SUM(t.harga_rp * (x->>'qty')::int), 0),
               COALESCE(jsonb_agg(jsonb_build_object('tarif_id', t.id, 'nama', t.nama, 'harga_rp', t.harga_rp, 'qty', (x->>'qty')::int)), '[]'::jsonb)
          INTO n_valid, sub_satuan, it_satuan
          FROM jsonb_array_elements(p_items) x
          JOIN tarif_laundry t ON t.kode = x->>'kode' AND t.aktif AND t.jenis = 'satuan'
         WHERE COALESCE((x->>'qty')::int, 0) BETWEEN 1 AND 20;
        IF n_valid <> n THEN RAISE EXCEPTION 'ada item satuan yang tidak dikenal / qty tidak valid' USING HINT = 'ITEM_TIDAK_VALID'; END IF;
    END IF;
    sub := sub_kilo + sub_satuan;
    IF sub <= 0 THEN RAISE EXCEPTION 'order kosong — isi berat atau item satuan' USING HINT = 'ITEM_KOSONG'; END IF;
    IF p_express THEN
        sub := (ceil(sub * (100 + persen) / 100.0 / 500) * 500)::BIGINT;   -- +N%, bulatkan naik ke Rp 500
    END IF;
    RETURN QUERY SELECT sub, kg, it_kilo || it_satuan;
END $$ LANGUAGE plpgsql STABLE;

-- F-50: terima cucian. Tap kartu (identitas) → catat. Belum ada uang berpindah.
CREATE OR REPLACE FUNCTION laundry_terima(
    p_device_kode TEXT, p_uid TEXT, p_berat_kg NUMERIC, p_items JSONB, p_express BOOLEAN,
    p_petugas TEXT, p_catatan TEXT DEFAULT NULL, p_rak TEXT DEFAULT NULL
) RETURNS TABLE (order_id BIGINT, kode TEXT, total_rp BIGINT, siswa_id BIGINT, nama TEXT) AS $$
DECLARE d device; r RECORD; h RECORD; oid BIGINT;
BEGIN
    d := device_aktif(p_device_kode);
    IF d.layanan <> 'laundry' THEN RAISE EXCEPTION 'bukan terminal laundry' USING HINT = 'LAYANAN_TIDAK_VALID'; END IF;
    SELECT * INTO r FROM identifikasi_kartu(p_uid);
    SELECT * INTO h FROM laundry_hitung(p_berat_kg, p_items, COALESCE(p_express, FALSE));
    INSERT INTO order_laundry (siswa_id, device_terima_id, petugas, berat_kg, express, total_rp, catatan, rak)
    VALUES (r.siswa_id, d.id, p_petugas, h.berat_kg, COALESCE(p_express, FALSE), h.total_rp, p_catatan, p_rak)
    RETURNING id INTO oid;
    INSERT INTO order_laundry_item (order_id, tarif_id, nama, harga_rp, qty)
    SELECT oid, (x->>'tarif_id')::int, x->>'nama', (x->>'harga_rp')::bigint, (x->>'qty')::numeric FROM jsonb_array_elements(h.items) x;
    RETURN QUERY SELECT oid, o.kode, o.total_rp, r.siswa_id, r.nama FROM order_laundry o WHERE o.id = oid;
END $$ LANGUAGE plpgsql;

-- Ubah status: diterima → diproses → siap (notifikasi) ; dibatalkan oleh petugas (tercatat).
CREATE OR REPLACE FUNCTION laundry_ubah_status(p_order_id BIGINT, p_status status_laundry, p_oleh TEXT, p_rak TEXT DEFAULT NULL, p_alasan TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE o order_laundry;
BEGIN
    SELECT * INTO o FROM order_laundry WHERE id = p_order_id FOR UPDATE;
    IF o.id IS NULL THEN RAISE EXCEPTION 'order tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    IF o.status IN ('diambil', 'dibatalkan') THEN RAISE EXCEPTION 'order sudah %', o.status USING HINT = 'STATUS_TIDAK_SESUAI'; END IF;
    IF p_status = 'diambil' THEN RAISE EXCEPTION 'status diambil hanya lewat laundry_bayar()' USING HINT = 'STATUS_TIDAK_SESUAI'; END IF;
    IF p_status = 'dibatalkan' AND coalesce(p_alasan, '') = '' THEN RAISE EXCEPTION 'alasan pembatalan wajib' USING HINT = 'ALASAN_WAJIB'; END IF;
    UPDATE order_laundry
       SET status = p_status, rak = COALESCE(p_rak, rak),
           siap_pada = CASE WHEN p_status = 'siap' THEN now() ELSE siap_pada END,
           dibatalkan_oleh = CASE WHEN p_status = 'dibatalkan' THEN p_oleh ELSE NULL END,
           catatan = CASE WHEN p_status = 'dibatalkan' THEN COALESCE(catatan || ' | ', '') || 'dibatalkan: ' || p_alasan ELSE catatan END
     WHERE id = o.id;
    IF p_status = 'siap' THEN
        PERFORM notifikasi_wali(o.siswa_id, 'laundry_siap', 'Cucian siap diambil',
            format('Order %s (Rp %s) siap diambil di laundry asrama%s.', o.kode, rp_teks(o.total_rp),
                   COALESCE(' — rak ' || COALESCE(p_rak, o.rak), '')));
    END IF;
    PERFORM catat_audit(p_oleh, NULL, 'laundry_status', 'order_laundry:' || o.kode,
        jsonb_build_object('sebelum', o.status, 'sesudah', p_status, 'alasan', p_alasan));
END $$ LANGUAGE plpgsql;

-- F-51: ambil & bayar. Kartu HARUS milik pemilik order; PIN wajib (ditegakkan bayar()).
CREATE OR REPLACE FUNCTION laundry_bayar(p_device_kode TEXT, p_order_id BIGINT, p_uid TEXT, p_pin_ok BOOLEAN, p_idem TEXT DEFAULT NULL)
RETURNS TABLE (order_id BIGINT, kode TEXT, transaksi_id BIGINT, total_rp BIGINT, saldo_rp BIGINT, rak TEXT) AS $$
DECLARE o order_laundry; r RECORD; b RECORD; d device;
BEGIN
    d := device_aktif(p_device_kode);
    SELECT * INTO o FROM order_laundry WHERE id = p_order_id FOR UPDATE;
    IF o.id IS NULL THEN RAISE EXCEPTION 'order tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    IF o.status = 'diambil' THEN
        -- idempoten: kiriman ulang setelah sukses
        RETURN QUERY SELECT o.id, o.kode, o.transaksi_id, o.total_rp, saldo_siswa(o.siswa_id), o.rak;
        RETURN;
    END IF;
    IF o.status NOT IN ('siap', 'diproses', 'diterima') THEN
        RAISE EXCEPTION 'order berstatus %', o.status USING HINT = 'STATUS_TIDAK_SESUAI';
    END IF;
    SELECT * INTO r FROM identifikasi_kartu(p_uid);
    IF r.siswa_id <> o.siswa_id THEN
        -- Penolakan ini dicatat ke audit_log oleh lapisan API (catatPenolakan) —
        -- INSERT di sini akan ikut ter-rollback oleh RAISE.
        RAISE EXCEPTION 'kartu milik % — bukan pemilik order %. Titip-ambil hanya lewat pembina asrama.', r.nama, o.kode
            USING HINT = 'BUKAN_PEMILIK';
    END IF;
    SELECT * INTO b FROM bayar(p_device_kode, COALESCE(p_idem, 'laundry:' || o.kode), p_uid, o.total_rp,
                               'Laundry ' || o.kode, p_pin_ok, FALSE, now(), NULL,
                               -- satu baris item ringkas (rincian per kg/satuan ada di order_laundry_item;
                               -- jumlah item tidak selalu = total karena pembulatan & express)
                               jsonb_build_array(jsonb_build_object(
                                   'nama', 'Laundry ' || o.kode || ' — ' ||
                                           (SELECT string_agg(CASE WHEN i.qty = ceil(i.qty) THEN i.qty::int::text ELSE replace(i.qty::text, '.', ',') END || '× ' || i.nama, ', ' ORDER BY i.id)
                                              FROM order_laundry_item i WHERE i.order_id = o.id) ||
                                           CASE WHEN o.express THEN ' (express)' ELSE '' END,
                                   'harga_rp', o.total_rp, 'qty', 1, 'ref_id', o.id)));
    UPDATE order_laundry SET status = 'diambil', diambil_pada = now(), transaksi_id = b.transaksi_id WHERE id = o.id;
    RETURN QUERY SELECT o.id, o.kode, b.transaksi_id, o.total_rp, b.saldo_rp, o.rak;
END $$ LANGUAGE plpgsql;

-- Tunggakan: siap tapi belum diambil > N hari (dashboard asrama, F-51)
CREATE OR REPLACE VIEW v_laundry_tunggakan AS
SELECT o.id, o.kode, o.siswa_id, s.nama, o.total_rp, o.rak, o.siap_pada,
       (hari_ini() - tgl_sekolah(o.siap_pada)) AS hari_menunggu
  FROM order_laundry o JOIN siswa s ON s.id = o.siswa_id
 WHERE o.status = 'siap' AND o.siap_pada < now() - make_interval(days => kebijakan_int('laundry_telat_hari')::int);

CREATE OR REPLACE VIEW v_laundry_aktif AS
SELECT o.id, o.kode, o.status, o.siswa_id, s.nama,
       (SELECT pk.kelas FROM penempatan_kelas pk WHERE pk.siswa_id = s.id AND pk.tahun_ajaran_id = (SELECT id FROM tahun_ajaran WHERE aktif LIMIT 1)) AS kelas,
       o.berat_kg, o.express, o.total_rp, o.rak, o.dibuat, o.siap_pada, o.petugas,
       (SELECT string_agg(CASE WHEN i.qty = ceil(i.qty) THEN i.qty::int::text ELSE i.qty::text END || '× ' || i.nama, ', ' ORDER BY i.id) FROM order_laundry_item i WHERE i.order_id = o.id) AS item
  FROM order_laundry o JOIN siswa s ON s.id = o.siswa_id
 WHERE o.status IN ('diterima', 'diproses', 'siap');
