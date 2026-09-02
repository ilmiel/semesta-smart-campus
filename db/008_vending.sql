-- =====================================================================
-- 008 — VENDING MACHINE (Fase 3) — PRD §7.12 (F-110–F-116)
-- Satu-satunya titik transaksi tanpa manusia → aturan paling ketat:
-- hanya online, dua fase (tahan → sensor jatuh → selesai / batal+refund),
-- batas harian khusus, jam aktif, produk disetujui kesiswaan.
-- =====================================================================

CREATE TABLE mesin_vending (
    device_id     BIGINT PRIMARY KEY REFERENCES device(id),
    jam_mulai     TIME NOT NULL DEFAULT '05:00',
    jam_selesai   TIME NOT NULL DEFAULT '22:00',     -- F-113: asrama mati 22.00–05.00
    selalu_aktif  BOOLEAN NOT NULL DEFAULT FALSE,
    catatan       TEXT
);

CREATE TABLE produk_vending (
    id                   BIGSERIAL PRIMARY KEY,
    nama                 TEXT NOT NULL,
    harga_rp             BIGINT NOT NULL CHECK (harga_rp > 0),
    disetujui_kesiswaan  BOOLEAN NOT NULL DEFAULT FALSE,   -- F-115
    disetujui_oleh       TEXT,
    aktif                BOOLEAN NOT NULL DEFAULT TRUE,
    foto_url             TEXT,
    dibuat               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE slot_vending (
    id          BIGSERIAL PRIMARY KEY,
    device_id   BIGINT NOT NULL REFERENCES device(id),
    slot        TEXT NOT NULL,                        -- 'A1'
    produk_id   BIGINT REFERENCES produk_vending(id),
    kapasitas   INTEGER NOT NULL DEFAULT 10 CHECK (kapasitas > 0),
    stok        INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
    aktif       BOOLEAN NOT NULL DEFAULT TRUE,
    bermasalah  BOOLEAN NOT NULL DEFAULT FALSE,       -- sensor gagal → dimatikan sampai IT cek
    catatan     TEXT,
    UNIQUE (device_id, slot)
);

CREATE TABLE restock_vending (
    id          BIGSERIAL PRIMARY KEY,
    slot_id     BIGINT NOT NULL REFERENCES slot_vending(id),
    oleh        TEXT NOT NULL,
    waktu       TIMESTAMPTZ NOT NULL DEFAULT now(),
    stok_sistem INTEGER NOT NULL,                     -- stok menurut sistem sebelum restock
    stok_fisik  INTEGER,                              -- hitungan fisik (kalau dihitung)
    selisih     INTEGER,                              -- fisik − sistem (F-114)
    ditambah    INTEGER NOT NULL,
    stok_akhir  INTEGER NOT NULL,
    catatan     TEXT
);
CREATE INDEX ON restock_vending (slot_id, waktu DESC);

CREATE TABLE transaksi_vending (
    transaksi_id        BIGINT PRIMARY KEY REFERENCES transaksi(id),
    device_id           BIGINT NOT NULL REFERENCES device(id),
    slot_id             BIGINT NOT NULL REFERENCES slot_vending(id),
    produk_id           BIGINT REFERENCES produk_vending(id),
    siswa_id            BIGINT NOT NULL REFERENCES siswa(id),
    status              status_transaksi NOT NULL DEFAULT 'pending',
    mulai               TIMESTAMPTZ NOT NULL DEFAULT now(),
    konfirmasi          TIMESTAMPTZ,
    sensor_ok           BOOLEAN,
    alasan_batal        TEXT,
    refund_transaksi_id BIGINT REFERENCES transaksi(id)
);
CREATE INDEX ON transaksi_vending (status) WHERE status = 'pending';
CREATE INDEX ON transaksi_vending (siswa_id, mulai DESC);

CREATE TYPE status_sengketa AS ENUM ('menunggu', 'dikabulkan', 'ditolak');

CREATE TABLE sengketa_vending (
    id             BIGSERIAL PRIMARY KEY,
    transaksi_id   BIGINT NOT NULL REFERENCES transaksi(id),
    siswa_id       BIGINT NOT NULL REFERENCES siswa(id),
    oleh           TEXT NOT NULL,
    catatan        TEXT,
    log_sensor     JSONB,                              -- salinan transaksi_vending saat diajukan
    status         status_sengketa NOT NULL DEFAULT 'menunggu',
    diputuskan_oleh TEXT,
    keputusan      TEXT,
    refund_transaksi_id BIGINT REFERENCES transaksi(id),
    dibuat         TIMESTAMPTZ NOT NULL DEFAULT now(),
    diputuskan     TIMESTAMPTZ
);
CREATE UNIQUE INDEX satu_sengketa_per_transaksi ON sengketa_vending (transaksi_id) WHERE status = 'menunggu';

-- ---------------------------------------------------------------------
-- Pengelolaan
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION vending_daftarkan_mesin(p_device_kode TEXT, p_jam_mulai TIME, p_jam_selesai TIME, p_aktor TEXT) RETURNS VOID AS $$
DECLARE d device;
BEGIN
    SELECT * INTO d FROM device WHERE kode = p_device_kode;
    IF d.id IS NULL OR d.layanan <> 'vending' THEN RAISE EXCEPTION 'device % bukan mesin vending', p_device_kode USING HINT = 'DEVICE_TIDAK_DIKENAL'; END IF;
    INSERT INTO mesin_vending (device_id, jam_mulai, jam_selesai) VALUES (d.id, p_jam_mulai, p_jam_selesai)
    ON CONFLICT (device_id) DO UPDATE SET jam_mulai = EXCLUDED.jam_mulai, jam_selesai = EXCLUDED.jam_selesai;
    -- F-110: vending tidak pernah offline
    UPDATE device SET limit_offline_rp = 0 WHERE id = d.id;
    PERFORM catat_audit(p_aktor, NULL, 'atur_mesin_vending', 'device:' || d.kode, jsonb_build_object('jam_mulai', p_jam_mulai, 'jam_selesai', p_jam_selesai));
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vending_produk_simpan(p_id BIGINT, p_nama TEXT, p_harga_rp BIGINT, p_aktif BOOLEAN, p_aktor TEXT) RETURNS BIGINT AS $$
DECLARE pid BIGINT; ambang BIGINT := kebijakan_int('ambang_pin_rp');
BEGIN
    IF p_harga_rp IS NULL OR p_harga_rp <= 0 OR p_harga_rp % 500 <> 0 THEN RAISE EXCEPTION 'harga harus kelipatan Rp 500' USING HINT = 'NILAI_TIDAK_VALID'; END IF;
    IF p_harga_rp > ambang THEN
        RAISE EXCEPTION 'harga vending harus ≤ ambang PIN Rp % (F-110: tanpa PIN)', ambang USING HINT = 'DI_ATAS_AMBANG_PIN';
    END IF;
    IF p_id IS NULL THEN
        INSERT INTO produk_vending (nama, harga_rp, aktif) VALUES (p_nama, p_harga_rp, COALESCE(p_aktif, TRUE)) RETURNING id INTO pid;
    ELSE
        -- ubah harga/nama → persetujuan kesiswaan gugur, harus disetujui ulang
        UPDATE produk_vending SET nama = p_nama, harga_rp = p_harga_rp, aktif = COALESCE(p_aktif, aktif),
               disetujui_kesiswaan = CASE WHEN nama <> p_nama THEN FALSE ELSE disetujui_kesiswaan END
         WHERE id = p_id RETURNING id INTO pid;
        IF pid IS NULL THEN RAISE EXCEPTION 'produk tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    END IF;
    PERFORM catat_audit(p_aktor, NULL, 'simpan_produk_vending', 'produk_vending:' || pid, jsonb_build_object('nama', p_nama, 'harga_rp', p_harga_rp, 'aktif', p_aktif));
    RETURN pid;
END $$ LANGUAGE plpgsql;

-- F-115: hanya kesiswaan yang menyetujui.
CREATE OR REPLACE FUNCTION vending_produk_setujui(p_id BIGINT, p_setuju BOOLEAN, p_aktor TEXT) RETURNS VOID AS $$
BEGIN
    UPDATE produk_vending SET disetujui_kesiswaan = p_setuju, disetujui_oleh = CASE WHEN p_setuju THEN p_aktor END WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'produk tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    PERFORM catat_audit(p_aktor, 'kesiswaan', CASE WHEN p_setuju THEN 'setujui_produk_vending' ELSE 'cabut_persetujuan_produk_vending' END, 'produk_vending:' || p_id);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vending_slot_atur(p_device_kode TEXT, p_slot TEXT, p_produk_id BIGINT, p_kapasitas INTEGER, p_aktor TEXT) RETURNS BIGINT AS $$
DECLARE d device; sid BIGINT;
BEGIN
    SELECT * INTO d FROM device WHERE kode = p_device_kode AND layanan = 'vending';
    IF d.id IS NULL THEN RAISE EXCEPTION 'mesin tidak dikenal' USING HINT = 'DEVICE_TIDAK_DIKENAL'; END IF;
    INSERT INTO slot_vending (device_id, slot, produk_id, kapasitas) VALUES (d.id, upper(p_slot), p_produk_id, COALESCE(p_kapasitas, 10))
    ON CONFLICT (device_id, slot) DO UPDATE SET produk_id = EXCLUDED.produk_id, kapasitas = EXCLUDED.kapasitas
    RETURNING id INTO sid;
    PERFORM catat_audit(p_aktor, NULL, 'atur_slot_vending', 'slot_vending:' || sid, jsonb_build_object('device', d.kode, 'slot', p_slot, 'produk_id', p_produk_id));
    RETURN sid;
END $$ LANGUAGE plpgsql;

-- F-114: restock tercatat; selisih fisik vs sistem tampil.
CREATE OR REPLACE FUNCTION vending_restock(p_device_kode TEXT, p_slot TEXT, p_ditambah INTEGER, p_stok_fisik INTEGER, p_oleh TEXT, p_catatan TEXT DEFAULT NULL)
RETURNS TABLE (stok_akhir INTEGER, selisih INTEGER) AS $$
DECLARE s slot_vending; akhir INTEGER; sel INTEGER;
BEGIN
    SELECT sv.* INTO s FROM slot_vending sv JOIN device d ON d.id = sv.device_id WHERE d.kode = p_device_kode AND sv.slot = upper(p_slot) FOR UPDATE OF sv;
    IF s.id IS NULL THEN RAISE EXCEPTION 'slot tidak ada' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    IF p_ditambah < 0 THEN RAISE EXCEPTION 'jumlah tambah tidak boleh negatif' USING HINT = 'NILAI_TIDAK_VALID'; END IF;
    sel := CASE WHEN p_stok_fisik IS NULL THEN NULL ELSE p_stok_fisik - s.stok END;
    akhir := COALESCE(p_stok_fisik, s.stok) + p_ditambah;
    IF akhir > s.kapasitas THEN RAISE EXCEPTION 'melebihi kapasitas slot (%)', s.kapasitas USING HINT = 'MELEBIHI_KAPASITAS'; END IF;
    INSERT INTO restock_vending (slot_id, oleh, stok_sistem, stok_fisik, selisih, ditambah, stok_akhir, catatan)
    VALUES (s.id, p_oleh, s.stok, p_stok_fisik, sel, p_ditambah, akhir, p_catatan);
    UPDATE slot_vending SET stok = akhir WHERE id = s.id;
    RETURN QUERY SELECT akhir, sel;
END $$ LANGUAGE plpgsql;

-- IT memulihkan slot setelah dicek fisik.
CREATE OR REPLACE FUNCTION vending_slot_pulihkan(p_device_kode TEXT, p_slot TEXT, p_oleh TEXT, p_catatan TEXT DEFAULT NULL) RETURNS VOID AS $$
DECLARE sid BIGINT;
BEGIN
    UPDATE slot_vending sv SET bermasalah = FALSE, catatan = p_catatan FROM device d
     WHERE d.id = sv.device_id AND d.kode = p_device_kode AND sv.slot = upper(p_slot) RETURNING sv.id INTO sid;
    IF sid IS NULL THEN RAISE EXCEPTION 'slot tidak ada' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    PERFORM catat_audit(p_oleh, NULL, 'pulihkan_slot_vending', 'slot_vending:' || sid, jsonb_build_object('catatan', p_catatan));
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Transaksi dua fase (F-110–F-113)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION vending_mulai(p_device_kode TEXT, p_idem TEXT, p_uid TEXT, p_slot TEXT)
RETURNS TABLE (transaksi_id BIGINT, baru BOOLEAN, produk TEXT, harga_rp BIGINT, siswa_id BIGINT, nama TEXT, saldo_rp BIGINT) AS $$
DECLARE d device; m mesin_vending; s slot_vending; pr produk_vending; r RECORD; b RECORD;
        maks_n INTEGER := kebijakan_int('vending_maks_transaksi'); maks_rp BIGINT := kebijakan_int('vending_maks_rp');
        n_hari INTEGER; rp_hari BIGINT; skrg TIME := waktu_sekolah()::time; ada BIGINT;
BEGIN
    d := device_aktif(p_device_kode);
    IF d.layanan <> 'vending' THEN RAISE EXCEPTION 'bukan mesin vending' USING HINT = 'LAYANAN_TIDAK_VALID'; END IF;

    -- kiriman ulang (controller retry) → kembalikan yang ada
    SELECT t.id INTO ada FROM transaksi t WHERE t.idempotency_key = p_idem;
    IF ada IS NOT NULL THEN
        RETURN QUERY SELECT t.id, FALSE, pv.nama, t.total_rp, t.siswa_id, sw.nama, saldo_siswa(t.siswa_id)
                       FROM transaksi t JOIN transaksi_vending tv ON tv.transaksi_id = t.id
                       LEFT JOIN produk_vending pv ON pv.id = tv.produk_id JOIN siswa sw ON sw.id = t.siswa_id WHERE t.id = ada;
        RETURN;
    END IF;

    SELECT * INTO m FROM mesin_vending WHERE device_id = d.id;
    IF m.device_id IS NULL THEN RAISE EXCEPTION 'mesin belum didaftarkan (jam aktif)' USING HINT = 'MESIN_BELUM_DIATUR'; END IF;
    IF NOT m.selalu_aktif AND NOT (
         (m.jam_mulai <= m.jam_selesai AND skrg BETWEEN m.jam_mulai AND m.jam_selesai) OR
         (m.jam_mulai >  m.jam_selesai AND (skrg >= m.jam_mulai OR skrg <= m.jam_selesai))) THEN
        RAISE EXCEPTION 'mesin nonaktif di luar jam %–%', to_char(m.jam_mulai, 'HH24.MI'), to_char(m.jam_selesai, 'HH24.MI') USING HINT = 'DI_LUAR_JAM';
    END IF;

    SELECT * INTO s FROM slot_vending WHERE device_id = d.id AND slot = upper(p_slot) FOR UPDATE;
    IF s.id IS NULL THEN RAISE EXCEPTION 'slot % tidak ada', p_slot USING HINT = 'SLOT_TIDAK_ADA'; END IF;
    IF NOT s.aktif OR s.bermasalah THEN RAISE EXCEPTION 'slot % sedang dinonaktifkan', s.slot USING HINT = 'SLOT_NONAKTIF'; END IF;
    SELECT * INTO pr FROM produk_vending WHERE id = s.produk_id;
    IF pr.id IS NULL OR NOT pr.aktif OR NOT pr.disetujui_kesiswaan THEN
        RAISE EXCEPTION 'produk tidak tersedia / belum disetujui kesiswaan' USING HINT = 'PRODUK_TIDAK_VALID';
    END IF;
    IF s.stok <= 0 THEN RAISE EXCEPTION 'produk habis' USING HINT = 'STOK_HABIS'; END IF;

    SELECT * INTO r FROM identifikasi_kartu(p_uid);

    -- F-112: batas vending per kartu per hari (pending ikut dihitung)
    SELECT COUNT(*), COALESCE(SUM(t.total_rp), 0) INTO n_hari, rp_hari
      FROM transaksi t WHERE t.siswa_id = r.siswa_id AND t.layanan = 'vending' AND t.jenis = 'belanja'
       AND t.status IN ('pending', 'selesai') AND tgl_sekolah(t.waktu_terminal) = hari_ini();
    IF n_hari >= maks_n OR rp_hari + pr.harga_rp > maks_rp THEN
        RAISE EXCEPTION 'batas vending harian: % transaksi / Rp % per kartu', maks_n, maks_rp USING HINT = 'VENDING_BATAS';
    END IF;

    -- tahan saldo: transaksi berstatus pending (F-111)
    SELECT * INTO b FROM bayar(p_device_kode, p_idem, p_uid, pr.harga_rp, 'Vending — ' || pr.nama, FALSE, FALSE, now(), NULL,
                               jsonb_build_array(jsonb_build_object('nama', pr.nama, 'harga_rp', pr.harga_rp, 'qty', 1, 'ref_id', pr.id)),
                               'belanja', 'pending');
    INSERT INTO transaksi_vending (transaksi_id, device_id, slot_id, produk_id, siswa_id)
    VALUES (b.transaksi_id, d.id, s.id, pr.id, r.siswa_id);
    RETURN QUERY SELECT b.transaksi_id, TRUE, pr.nama, pr.harga_rp, r.siswa_id, r.nama, b.saldo_rp;
END $$ LANGUAGE plpgsql;

-- Fase 2: sensor jatuh. TRUE → selesai, stok−1. FALSE → batal + refund seketika, slot ditandai.
CREATE OR REPLACE FUNCTION vending_konfirmasi(p_device_kode TEXT, p_transaksi_id BIGINT, p_sensor_ok BOOLEAN, p_alasan TEXT DEFAULT NULL)
RETURNS TABLE (status status_transaksi, saldo_rp BIGINT, refund_transaksi_id BIGINT) AS $$
DECLARE d device; tv transaksi_vending; t transaksi; ak RECORD; rid BIGINT;
BEGIN
    d := device_aktif(p_device_kode);
    SELECT * INTO tv FROM transaksi_vending WHERE transaksi_id = p_transaksi_id FOR UPDATE;
    IF tv.transaksi_id IS NULL OR tv.device_id <> d.id THEN RAISE EXCEPTION 'transaksi bukan milik mesin ini' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    IF tv.status <> 'pending' THEN
        -- konfirmasi dobel → idempoten
        RETURN QUERY SELECT tv.status, saldo_siswa(tv.siswa_id), tv.refund_transaksi_id; RETURN;
    END IF;
    SELECT * INTO t FROM transaksi WHERE id = p_transaksi_id;
    IF p_sensor_ok THEN
        UPDATE transaksi SET status = 'selesai' WHERE id = t.id;
        UPDATE transaksi_vending SET status = 'selesai', konfirmasi = now(), sensor_ok = TRUE WHERE transaksi_id = t.id;
        UPDATE slot_vending SET stok = GREATEST(stok - 1, 0) WHERE id = tv.slot_id;
        RETURN QUERY SELECT 'selesai'::status_transaksi, saldo_siswa(tv.siswa_id), NULL::bigint;
    ELSE
        ak := akun_transaksi(t.id);
        SELECT p.transaksi_id INTO rid
          FROM posting('refund', ak.ke, ak.dari, t.total_rp, t.siswa_id, 'vending-batal:' || t.id, d.id, t.kartu_id, 'vending',
                       'Vending dibatalkan — ' || COALESCE(p_alasan, 'sensor tidak mendeteksi barang keluar'),
                       FALSE, FALSE, now(), t.id, NULL, 'selesai', FALSE, 'device:' || d.kode) p;
        UPDATE transaksi SET status = 'batal' WHERE id = t.id;
        UPDATE transaksi_vending SET status = 'batal', konfirmasi = now(), sensor_ok = FALSE,
               alasan_batal = COALESCE(p_alasan, 'sensor'), refund_transaksi_id = rid WHERE transaksi_id = t.id;
        UPDATE slot_vending SET bermasalah = TRUE, catatan = 'gagal keluar ' || to_char(waktu_sekolah(), 'DD/MM HH24:MI') WHERE id = tv.slot_id;
        PERFORM catat_audit('device:' || d.kode, 'terminal', 'vending_gagal', 'slot_vending:' || tv.slot_id,
            jsonb_build_object('transaksi_id', t.id, 'refund_id', rid, 'alasan', p_alasan, 'siswa_id', t.siswa_id));
        RETURN QUERY SELECT 'batal'::status_transaksi, saldo_siswa(tv.siswa_id), rid;
    END IF;
END $$ LANGUAGE plpgsql;

-- Job: pending yang tidak pernah dikonfirmasi (controller mati) → batalkan + refund.
CREATE OR REPLACE FUNCTION vending_pending_kedaluwarsa() RETURNS INTEGER AS $$
DECLARE tv RECORD; n INTEGER := 0; detik INTEGER := kebijakan_int('vending_pending_detik');
BEGIN
    FOR tv IN SELECT v.transaksi_id, d.kode FROM transaksi_vending v JOIN device d ON d.id = v.device_id
               WHERE v.status = 'pending' AND v.mulai < now() - make_interval(secs => detik) LOOP
        PERFORM vending_konfirmasi(tv.kode, tv.transaksi_id, FALSE, 'timeout ' || detik || ' detik tanpa konfirmasi sensor');
        n := n + 1;
    END LOOP;
    RETURN n;
END $$ LANGUAGE plpgsql;

-- F-116: siswa/ortu lapor "dana terpotong, barang tidak keluar".
CREATE OR REPLACE FUNCTION vending_sengketa(p_transaksi_id BIGINT, p_siswa_id BIGINT, p_oleh TEXT, p_catatan TEXT) RETURNS BIGINT AS $$
DECLARE tv transaksi_vending; sid BIGINT;
BEGIN
    SELECT * INTO tv FROM transaksi_vending WHERE transaksi_id = p_transaksi_id;
    IF tv.transaksi_id IS NULL OR tv.siswa_id <> p_siswa_id THEN RAISE EXCEPTION 'transaksi vending tidak ditemukan untuk siswa ini' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    IF tv.status <> 'selesai' THEN RAISE EXCEPTION 'transaksi berstatus % — dana tidak terpotong', tv.status USING HINT = 'STATUS_TIDAK_SESUAI'; END IF;
    IF EXISTS (SELECT 1 FROM sengketa_vending WHERE transaksi_id = p_transaksi_id) THEN
        RAISE EXCEPTION 'sengketa untuk transaksi ini sudah pernah diajukan' USING HINT = 'SUDAH_ADA';
    END IF;
    INSERT INTO sengketa_vending (transaksi_id, siswa_id, oleh, catatan, log_sensor)
    VALUES (p_transaksi_id, p_siswa_id, p_oleh, p_catatan, to_jsonb(tv)) RETURNING id INTO sid;
    RETURN sid;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vending_sengketa_putus(p_id BIGINT, p_kabulkan BOOLEAN, p_oleh TEXT, p_keputusan TEXT) RETURNS BIGINT AS $$
DECLARE sg sengketa_vending; rid BIGINT;
BEGIN
    IF coalesce(p_keputusan, '') = '' THEN RAISE EXCEPTION 'alasan keputusan wajib' USING HINT = 'ALASAN_WAJIB'; END IF;
    SELECT * INTO sg FROM sengketa_vending WHERE id = p_id FOR UPDATE;
    IF sg.id IS NULL OR sg.status <> 'menunggu' THEN RAISE EXCEPTION 'sengketa tidak ditemukan / sudah diputus' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    IF p_kabulkan THEN
        rid := refund(sg.transaksi_id, NULL, 'Sengketa vending #' || sg.id || ' dikabulkan: ' || p_keputusan, p_oleh, 'sengketa:' || sg.id);
    END IF;
    UPDATE sengketa_vending SET status = CASE WHEN p_kabulkan THEN 'dikabulkan'::status_sengketa ELSE 'ditolak' END,
           diputuskan_oleh = p_oleh, keputusan = p_keputusan, refund_transaksi_id = rid, diputuskan = now() WHERE id = sg.id;
    PERFORM catat_audit(p_oleh, 'keuangan', 'putus_sengketa_vending', 'sengketa_vending:' || sg.id, jsonb_build_object('dikabulkan', p_kabulkan, 'keputusan', p_keputusan, 'refund_id', rid));
    RETURN rid;
END $$ LANGUAGE plpgsql;

-- Planogram untuk dashboard & controller
CREATE OR REPLACE VIEW v_planogram AS
SELECT d.kode AS device, d.nama AS mesin, s.id AS slot_id, s.slot, s.produk_id, p.nama AS produk, p.harga_rp,
       s.stok, s.kapasitas, s.aktif, s.bermasalah, p.disetujui_kesiswaan,
       s.aktif AND NOT s.bermasalah AND s.stok > 0 AND COALESCE(p.aktif AND p.disetujui_kesiswaan, FALSE) AS bisa_dibeli,
       (SELECT COUNT(*) FROM transaksi_vending tv WHERE tv.slot_id = s.id AND tv.status = 'selesai' AND tgl_sekolah(tv.mulai) = hari_ini()) AS terjual_hari_ini,
       (SELECT r.selisih FROM restock_vending r WHERE r.slot_id = s.id AND r.selisih IS NOT NULL ORDER BY r.waktu DESC LIMIT 1) AS selisih_terakhir
  FROM slot_vending s JOIN device d ON d.id = s.device_id LEFT JOIN produk_vending p ON p.id = s.produk_id
 ORDER BY d.kode, s.slot;
