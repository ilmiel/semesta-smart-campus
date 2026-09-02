-- =====================================================================
-- 002 — AKSES, KEBIJAKAN, PENDUKUNG
--
-- Isi: staf & peran (RBAC ditegakkan server), kebijakan uang yang bisa
--      diubah admin (bukan hard-code), limit harian dari wali, tagihan
--      menunggu, outbox notifikasi, log rekonsiliasi, dan beberapa kolom
--      tambahan pada transaksi.
-- Semua fungsi memakai zona waktu sekolah (Asia/Jakarta) secara eksplisit
-- supaya "hari ini" tidak bergantung pada setelan server.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. WAKTU SEKOLAH
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION waktu_sekolah() RETURNS TIMESTAMP AS $$
    SELECT (now() AT TIME ZONE 'Asia/Jakarta');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION hari_ini() RETURNS DATE AS $$
    SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date;
$$ LANGUAGE sql STABLE;

-- Format rupiah untuk pesan notifikasi: 125000 → '125.000' (tidak bergantung locale).
CREATE OR REPLACE FUNCTION rp_teks(n BIGINT) RETURNS TEXT AS $$
    SELECT replace(to_char(COALESCE(n, 0), 'FM999G999G999G999'), ',', '.');
$$ LANGUAGE sql IMMUTABLE;

-- Tanggal sekolah dari sebuah timestamptz (untuk pengelompokan harian).
CREATE OR REPLACE FUNCTION tgl_sekolah(t TIMESTAMPTZ) RETURNS DATE AS $$
    SELECT (t AT TIME ZONE 'Asia/Jakarta')::date;
$$ LANGUAGE sql IMMUTABLE;

-- ---------------------------------------------------------------------
-- 2. STAF & PERAN
--
-- Login staf memakai Google Workspace (SSO). Tabel ini yang menentukan
-- APA yang boleh dilakukan akun itu — bukan tabel user milik library auth.
-- Email yang tidak ada di sini = bisa login, tapi tidak punya akses apa pun.
-- ---------------------------------------------------------------------
CREATE TYPE peran AS ENUM (
    'admin_it',    -- device, kartu, akun staf, monitor sinkron
    'keuangan',    -- rekonsiliasi, refund, koreksi, penarikan, settlement
    'tu',          -- tata usaha: reset PIN, top-up tunai, kartu pengganti
    'kasir',       -- terminal kantin (lewat device key; peran ini untuk dashboard rekap sendiri)
    'laundry',     -- petugas laundry asrama
    'asrama',      -- pembina asrama: loker, denda asrama
    'pustakawan',
    'kesiswaan',   -- pola makan, indikator kesejahteraan — tanpa rupiah
    'wali_kelas',
    'manajemen'    -- dashboard ringkasan lintas modul
);

CREATE TABLE staf (
    id        BIGSERIAL PRIMARY KEY,
    email     TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    nama      TEXT NOT NULL,
    peran     peran[] NOT NULL DEFAULT '{}',
    aktif     BOOLEAN NOT NULL DEFAULT TRUE,
    dibuat    TIMESTAMPTZ NOT NULL DEFAULT now(),
    diubah    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cari peran dari email login. Kosong = tidak punya akses staf.
CREATE OR REPLACE FUNCTION peran_staf(p_email TEXT) RETURNS peran[] AS $$
    SELECT COALESCE((SELECT peran FROM staf WHERE email = lower(p_email) AND aktif), '{}');
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- 3. AUDIT — fungsi bantu
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION catat_audit(
    p_aktor TEXT, p_peran TEXT, p_aksi TEXT, p_objek TEXT,
    p_meta JSONB DEFAULT NULL, p_ip INET DEFAULT NULL
) RETURNS BIGINT AS $$
    INSERT INTO audit_log (aktor, peran, aksi, objek, meta, ip)
    VALUES (COALESCE(p_aktor, 'sistem'), p_peran, p_aksi, p_objek, p_meta, p_ip)
    RETURNING id;
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------
-- 4. KEBIJAKAN
--
-- Angka-angka §12-5 PRD. Nilai default di bawah adalah USULAN; admin
-- mengubahnya dari dashboard, setiap perubahan tercatat di audit_log.
-- Disimpan JSONB supaya satu tabel cukup untuk angka, teks, jam, boolean.
-- ---------------------------------------------------------------------
CREATE TABLE kebijakan (
    kunci       TEXT PRIMARY KEY,
    nilai       JSONB NOT NULL,
    keterangan  TEXT,
    diubah      TIMESTAMPTZ NOT NULL DEFAULT now(),
    diubah_oleh TEXT
);

INSERT INTO kebijakan (kunci, nilai, keterangan) VALUES
 ('limit_harian_rp',        '50000',   'Plafon belanja kantin+vending per siswa per hari (F-17). Wali hanya bisa menurunkan.'),
 ('ambang_pin_rp',          '25000',   'Transaksi keuangan di atas ini wajib PIN (F-31). Harus = limit offline (F-33).'),
 ('limit_offline_rp',       '25000',   'Maks per transaksi saat terminal offline (F-43). Harus = ambang PIN.'),
 ('kumulatif_offline_rp',   '50000',   'Maks kumulatif offline per kartu (dihitung terminal, F-43).'),
 ('plafon_saldo_rp',        '1000000', 'Saldo maksimum per siswa (F-24).'),
 ('topup_min_rp',           '20000',   'Top-up minimum per transaksi (F-24).'),
 ('topup_max_rp',           '500000',  'Top-up maksimum per transaksi (F-24).'),
 ('saldo_rendah_rp',        '20000',   'Di bawah ini ortu diberi tahu (F-25).'),
 ('pin_maks_gagal',         '5',       'Salah PIN berturut sebelum terkunci (F-32).'),
 ('pin_kunci_menit',        '30',      'Lama kunci setelah salah PIN (F-32).'),
 ('batal_kasir_menit',      '5',       'Jendela pembatalan oleh kasir (F-45).'),
 ('transfer_aktif',         'false',   'Transfer antar-siswa — MATI sampai tinjauan hukum (§8.4).'),
 ('po_aktif',               'true',    'Saklar pra-pesan kantin (F-49).'),
 ('po_buka',                '"06:00"', 'Jam PO dibuka (F-49).'),
 ('po_tutup',               '"09:30"', 'Jam PO ditutup; setelah ini tidak bisa pesan/batal (F-49).'),
 ('po_ambil_mulai',         '"11:30"', 'Jendela pengambilan PO mulai.'),
 ('po_ambil_selesai',       '"13:00"', 'Jendela pengambilan PO selesai.'),
 ('po_tidak_diambil',       '"tetap_ditagih"', 'tetap_ditagih | refund — pesanan yang tidak diambil (F-49).'),
 ('vending_maks_transaksi', '3',       'Maks transaksi vending per kartu per hari (F-112).'),
 ('vending_maks_rp',        '20000',   'Maks rupiah vending per kartu per hari (F-112).'),
 ('vending_pending_detik',  '90',      'Transaksi vending pending lebih lama dari ini dibatalkan otomatis.'),
 ('laundry_telat_hari',     '7',       'Order siap tapi belum diambil > N hari tampil di dashboard asrama (F-51).'),
 ('laundry_min_kg',         '2',       'Berat minimum yang ditagih per order kiloan.'),
 ('laundry_maks_kg',        '6',       'Berat maksimum per order; lebih dari itu dipecah.'),
 ('laundry_express_persen', '50',      'Tambahan tarif express (%).');

CREATE OR REPLACE FUNCTION kebijakan_int(p_kunci TEXT) RETURNS BIGINT AS $$
DECLARE v JSONB;
BEGIN
    SELECT nilai INTO v FROM kebijakan WHERE kunci = p_kunci;
    IF v IS NULL THEN RAISE EXCEPTION 'kebijakan % tidak ada', p_kunci USING HINT = 'KEBIJAKAN_TIDAK_ADA'; END IF;
    RETURN (v #>> '{}')::BIGINT;
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION kebijakan_bool(p_kunci TEXT) RETURNS BOOLEAN AS $$
DECLARE v JSONB;
BEGIN
    SELECT nilai INTO v FROM kebijakan WHERE kunci = p_kunci;
    IF v IS NULL THEN RAISE EXCEPTION 'kebijakan % tidak ada', p_kunci USING HINT = 'KEBIJAKAN_TIDAK_ADA'; END IF;
    RETURN (v #>> '{}')::BOOLEAN;
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION kebijakan_text(p_kunci TEXT) RETURNS TEXT AS $$
DECLARE v JSONB;
BEGIN
    SELECT nilai INTO v FROM kebijakan WHERE kunci = p_kunci;
    IF v IS NULL THEN RAISE EXCEPTION 'kebijakan % tidak ada', p_kunci USING HINT = 'KEBIJAKAN_TIDAK_ADA'; END IF;
    RETURN v #>> '{}';
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION kebijakan_jam(p_kunci TEXT) RETURNS TIME AS $$
    SELECT kebijakan_text(p_kunci)::TIME;
$$ LANGUAGE sql STABLE;

-- Ubah kebijakan + audit. Menolak nilai yang melanggar F-33 (ambang PIN
-- harus sama dengan limit offline) dan kunci yang tidak dikenal.
CREATE OR REPLACE FUNCTION kebijakan_set(p_kunci TEXT, p_nilai JSONB, p_aktor TEXT)
RETURNS VOID AS $$
DECLARE lama JSONB;
BEGIN
    SELECT nilai INTO lama FROM kebijakan WHERE kunci = p_kunci FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'kebijakan % tidak dikenal', p_kunci USING HINT = 'KEBIJAKAN_TIDAK_ADA';
    END IF;
    IF p_kunci IN ('ambang_pin_rp', 'limit_offline_rp') THEN
        -- F-33: keduanya harus disetel bersama lewat kebijakan_set_ambang_pin()
        RAISE EXCEPTION 'ambang PIN dan limit offline harus diubah bersama (F-33) — pakai kebijakan_set_ambang_pin()'
            USING HINT = 'F33';
    END IF;
    IF p_kunci = 'po_tidak_diambil' AND (p_nilai #>> '{}') NOT IN ('tetap_ditagih', 'refund') THEN
        RAISE EXCEPTION 'po_tidak_diambil harus tetap_ditagih atau refund' USING HINT = 'NILAI_TIDAK_VALID';
    END IF;
    IF p_kunci LIKE 'po\_%' AND p_kunci IN ('po_buka','po_tutup','po_ambil_mulai','po_ambil_selesai') THEN
        PERFORM (p_nilai #>> '{}')::TIME;  -- gagal kalau bukan format jam
    END IF;
    UPDATE kebijakan SET nilai = p_nilai, diubah = now(), diubah_oleh = p_aktor WHERE kunci = p_kunci;
    PERFORM catat_audit(p_aktor, NULL, 'ubah_kebijakan', 'kebijakan:' || p_kunci,
                        jsonb_build_object('sebelum', lama, 'sesudah', p_nilai));
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION kebijakan_set_ambang_pin(p_rp BIGINT, p_aktor TEXT) RETURNS VOID AS $$
BEGIN
    IF p_rp < 0 THEN RAISE EXCEPTION 'ambang tidak boleh negatif' USING HINT = 'NILAI_TIDAK_VALID'; END IF;
    UPDATE kebijakan SET nilai = to_jsonb(p_rp), diubah = now(), diubah_oleh = p_aktor
     WHERE kunci IN ('ambang_pin_rp', 'limit_offline_rp');
    -- limit offline per device mengikuti (device yang di-set lebih rendah dibiarkan)
    UPDATE device SET limit_offline_rp = p_rp WHERE limit_offline_rp > p_rp;
    PERFORM catat_audit(p_aktor, NULL, 'ubah_kebijakan', 'kebijakan:ambang_pin_rp+limit_offline_rp',
                        jsonb_build_object('sesudah', p_rp));
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 5. LIMIT HARIAN DARI WALI (F-17, edge case dua ortu)
-- Wali hanya bisa MENURUNKAN di bawah plafon sekolah; yang terendah berlaku.
-- ---------------------------------------------------------------------
CREATE TABLE limit_wali (
    wali_id          BIGINT PRIMARY KEY REFERENCES wali(id) ON DELETE CASCADE,
    siswa_id         BIGINT NOT NULL REFERENCES siswa(id) ON DELETE CASCADE,
    limit_harian_rp  BIGINT NOT NULL CHECK (limit_harian_rp >= 0),
    diubah           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON limit_wali (siswa_id);

CREATE OR REPLACE FUNCTION limit_wali_set(p_wali_id BIGINT, p_rp BIGINT) RETURNS BIGINT AS $$
DECLARE sid BIGINT; plafon BIGINT;
BEGIN
    SELECT siswa_id INTO sid FROM wali WHERE id = p_wali_id;
    IF sid IS NULL THEN RAISE EXCEPTION 'wali tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    plafon := kebijakan_int('limit_harian_rp');
    IF p_rp > plafon THEN
        RAISE EXCEPTION 'limit harian maksimal Rp % (plafon sekolah)', plafon USING HINT = 'MELEBIHI_PLAFON';
    END IF;
    INSERT INTO limit_wali (wali_id, siswa_id, limit_harian_rp) VALUES (p_wali_id, sid, p_rp)
    ON CONFLICT (wali_id) DO UPDATE SET limit_harian_rp = EXCLUDED.limit_harian_rp, diubah = now();
    PERFORM catat_audit('wali:' || p_wali_id, 'wali', 'ubah_limit_harian', 'siswa:' || sid,
                        jsonb_build_object('limit_rp', p_rp));
    RETURN limit_harian_efektif(sid);
END $$ LANGUAGE plpgsql;

-- Didefinisikan sebelum dipakai di atas? Tidak perlu — plpgsql resolve saat eksekusi.
CREATE OR REPLACE FUNCTION limit_harian_efektif(p_siswa_id BIGINT) RETURNS BIGINT AS $$
    SELECT LEAST(kebijakan_int('limit_harian_rp'),
                 COALESCE((SELECT MIN(limit_harian_rp) FROM limit_wali WHERE siswa_id = p_siswa_id),
                          kebijakan_int('limit_harian_rp')));
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- 6. KOLOM TAMBAHAN PADA TRANSAKSI
-- ---------------------------------------------------------------------
ALTER TABLE transaksi
    ADD COLUMN layanan     jenis_layanan,                       -- unit: kantin/laundry/… (settlement per unit, F-92)
    ADD COLUMN tanpa_kartu BOOLEAN NOT NULL DEFAULT FALSE,      -- mode darurat NIS+PIN (§9)
    ADD COLUMN oleh        TEXT;                                -- aktor non-terminal: email staf / 'wali:12' / 'siswa'

-- F-16: refund & koreksi wajib menunjuk transaksi asal.
-- (penarikan menunjuk wallet secara keseluruhan, bukan satu transaksi —
--  ia wajib membawa bukti transfer di `keterangan`, dicek di fungsi.)
ALTER TABLE transaksi
    ADD CONSTRAINT refund_koreksi_wajib_ref
    CHECK (jenis NOT IN ('refund', 'koreksi') OR ref_transaksi_id IS NOT NULL);

CREATE INDEX ON transaksi (layanan, dibuat DESC);
CREATE INDEX ON transaksi (ref_transaksi_id) WHERE ref_transaksi_id IS NOT NULL;
CREATE INDEX ON transaksi (siswa_id, waktu_terminal DESC);

-- Akun sistem tambahan
INSERT INTO akun (jenis, kode, nama, boleh_minus) VALUES
    ('kas',        'KAS_TU',       'Kas — Tunai Tata Usaha (top-up darurat & penarikan)', TRUE),
    ('pendapatan', 'DENDA_ASRAMA', 'Pendapatan Denda Asrama (loker, dll.)',              TRUE)
ON CONFLICT (kode) DO NOTHING;

-- ---------------------------------------------------------------------
-- 7. TAGIHAN MENUNGGU
-- Denda/biaya yang belum bisa dipotong (saldo kurang, siswa tidak bawa
-- kartu). Tampil di portal ortu; dipotong saat ortu/TU menekan "bayar".
-- ---------------------------------------------------------------------
CREATE TYPE status_tagihan AS ENUM ('menunggu', 'lunas', 'dibebaskan');

CREATE TABLE tagihan (
    id            BIGSERIAL PRIMARY KEY,
    siswa_id      BIGINT NOT NULL REFERENCES siswa(id),
    sumber        jenis_layanan NOT NULL,
    ref           TEXT,                          -- 'pinjaman:12', 'loker:A-117'
    keterangan    TEXT NOT NULL,
    nominal_rp    BIGINT NOT NULL CHECK (nominal_rp > 0),
    status        status_tagihan NOT NULL DEFAULT 'menunggu',
    transaksi_id  BIGINT REFERENCES transaksi(id),
    dibuat        TIMESTAMPTZ NOT NULL DEFAULT now(),
    diselesaikan  TIMESTAMPTZ,
    oleh          TEXT
);
CREATE INDEX ON tagihan (siswa_id) WHERE status = 'menunggu';

-- ---------------------------------------------------------------------
-- 8. OUTBOX NOTIFIKASI (F-25, F-51, dll.)
-- Kanal (email/WhatsApp) belum diputuskan (§12-9). Tabel ini menampung
-- pesan yang HARUS dikirim; pengirimnya worker terpisah yang membaca
-- status 'antri'. Dengan begitu keputusan kanal tidak menahan modul lain.
-- ---------------------------------------------------------------------
CREATE TABLE notifikasi (
    id         BIGSERIAL PRIMARY KEY,
    siswa_id   BIGINT REFERENCES siswa(id),
    wali_id    BIGINT REFERENCES wali(id),
    jenis      TEXT NOT NULL,          -- 'topup_berhasil','saldo_rendah','laundry_siap','po_dibatalkan',...
    judul      TEXT NOT NULL,
    isi        TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'antri',   -- antri|terkirim|gagal
    dibuat     TIMESTAMPTZ NOT NULL DEFAULT now(),
    terkirim   TIMESTAMPTZ,
    catatan    TEXT
);
CREATE INDEX ON notifikasi (status) WHERE status = 'antri';

-- Kirim ke wali utama siswa (kalau tidak ada yang utama, ke semua wali ber-email/WA).
CREATE OR REPLACE FUNCTION notifikasi_wali(p_siswa_id BIGINT, p_jenis TEXT, p_judul TEXT, p_isi TEXT)
RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
    INSERT INTO notifikasi (siswa_id, wali_id, jenis, judul, isi)
    SELECT p_siswa_id, w.id, p_jenis, p_judul, p_isi
      FROM wali w
     WHERE w.siswa_id = p_siswa_id
       AND (w.utama OR NOT EXISTS (SELECT 1 FROM wali x WHERE x.siswa_id = p_siswa_id AND x.utama));
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 9. LOG REKONSILIASI MALAM (F-15, §8.4 total float)
-- ---------------------------------------------------------------------
CREATE TABLE rekonsiliasi_log (
    id            BIGSERIAL PRIMARY KEY,
    waktu         TIMESTAMPTZ NOT NULL DEFAULT now(),
    tanggal       DATE NOT NULL DEFAULT hari_ini(),
    jumlah_selisih INTEGER NOT NULL,
    detail        JSONB,
    total_float_rp BIGINT NOT NULL,       -- jumlah saldo seluruh siswa (posisi terhadap ambang BI)
    jumlah_akun_siswa INTEGER NOT NULL
);

CREATE OR REPLACE FUNCTION rekonsiliasi_malam() RETURNS rekonsiliasi_log AS $$
DECLARE r rekonsiliasi_log; d JSONB; n INTEGER; f BIGINT; na INTEGER;
BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb), COUNT(*) INTO d, n FROM cek_rekonsiliasi() x;
    SELECT COALESCE(SUM(saldo_rp), 0), COUNT(*) INTO f, na FROM saldo_ledger WHERE jenis = 'siswa';
    INSERT INTO rekonsiliasi_log (jumlah_selisih, detail, total_float_rp, jumlah_akun_siswa)
    VALUES (n, d, f, na) RETURNING * INTO r;
    IF n > 0 THEN
        PERFORM catat_audit('sistem', NULL, 'rekonsiliasi_selisih', 'rekonsiliasi:' || r.id, d);
    END IF;
    RETURN r;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 10. DEVICE — kolom operasional (F-93) & feed kartu dicabut (F-03)
-- ---------------------------------------------------------------------
ALTER TABLE device
    ADD COLUMN terakhir_sinkron TIMESTAMPTZ,
    ADD COLUMN versi_terminal   TEXT,
    ADD COLUMN dinonaktifkan    TIMESTAMPTZ;

-- Kartu yang dicabut sejak waktu tertentu — terminal offline menariknya
-- saat sinkron dan menolak UID ini secara lokal.
CREATE OR REPLACE FUNCTION kartu_dicabut_sejak(p_sejak TIMESTAMPTZ)
RETURNS TABLE (uid TEXT, status status_kartu, dicabut TIMESTAMPTZ) AS $$
    SELECT k.uid, k.status, k.dicabut FROM kartu k
     WHERE k.status <> 'aktif' AND k.dicabut >= COALESCE(p_sejak, '-infinity'::timestamptz)
    UNION ALL
    -- kartu masih 'aktif' tapi siswanya tidak aktif (cuti dll.) → juga harus ditolak
    SELECT k.uid, k.status, s.diubah FROM kartu k JOIN siswa s ON s.id = k.siswa_id
     WHERE k.status = 'aktif' AND s.status <> 'aktif' AND s.diubah >= COALESCE(p_sejak, '-infinity'::timestamptz);
$$ LANGUAGE sql STABLE;

-- Data ringkas kartu aktif untuk cache terminal (nama, kelas, saldo
-- terakhir) — dipakai mode offline (F-43). Tidak pernah memuat PIN.
CREATE OR REPLACE FUNCTION snapshot_kartu_aktif()
RETURNS TABLE (uid TEXT, siswa_id BIGINT, nama TEXT, kelas TEXT, saldo_rp BIGINT, limit_harian_rp BIGINT) AS $$
    SELECT k.uid, s.id, s.nama, pk.kelas, COALESCE(sc.saldo_rp, 0), limit_harian_efektif(s.id)
      FROM kartu k
      JOIN siswa s ON s.id = k.siswa_id AND s.status = 'aktif'
      LEFT JOIN akun a ON a.siswa_id = s.id
      LEFT JOIN saldo_cache sc ON sc.akun_id = a.id
      LEFT JOIN penempatan_kelas pk ON pk.siswa_id = s.id
           AND pk.tahun_ajaran_id = (SELECT id FROM tahun_ajaran WHERE aktif LIMIT 1)
     WHERE k.status = 'aktif';
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- 11. SISWA — perubahan status & kenaikan kelas (F-04, F-06)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION siswa_ubah_status(p_siswa_id BIGINT, p_status status_siswa, p_aktor TEXT, p_alasan TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE lama status_siswa;
BEGIN
    SELECT status INTO lama FROM siswa WHERE id = p_siswa_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'siswa tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    UPDATE siswa SET status = p_status, diubah = now() WHERE id = p_siswa_id;
    -- lulus/pindah/keluar: kartu ditarik permanen. cuti: kartu tetap, otomatis tidak bisa transaksi.
    IF p_status IN ('lulus', 'pindah', 'keluar') THEN
        UPDATE kartu SET status = 'ditarik', dicabut = now(), alasan = 'siswa ' || p_status::text
         WHERE siswa_id = p_siswa_id AND status = 'aktif';
    END IF;
    PERFORM catat_audit(p_aktor, NULL, 'ubah_status_siswa', 'siswa:' || p_siswa_id,
                        jsonb_build_object('sebelum', lama, 'sesudah', p_status, 'alasan', p_alasan));
END $$ LANGUAGE plpgsql;

-- Kenaikan kelas massal: p_daftar = [{"siswa_id":1,"kelas":"8.A","wali_email":"..."}, ...]
CREATE OR REPLACE FUNCTION naik_kelas(p_tahun_ajaran_id SMALLINT, p_daftar JSONB, p_aktor TEXT)
RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
    INSERT INTO penempatan_kelas (siswa_id, tahun_ajaran_id, kelas, wali_email)
    SELECT (x->>'siswa_id')::BIGINT, p_tahun_ajaran_id, x->>'kelas', x->>'wali_email'
      FROM jsonb_array_elements(p_daftar) x
    ON CONFLICT (siswa_id, tahun_ajaran_id) DO UPDATE
       SET kelas = EXCLUDED.kelas, wali_email = COALESCE(EXCLUDED.wali_email, penempatan_kelas.wali_email);
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM catat_audit(p_aktor, NULL, 'naik_kelas', 'tahun_ajaran:' || p_tahun_ajaran_id,
                        jsonb_build_object('jumlah', n));
    RETURN n;
END $$ LANGUAGE plpgsql;

-- Ganti tahun ajaran aktif (satu operasi, satu audit).
CREATE OR REPLACE FUNCTION tahun_ajaran_aktifkan(p_id SMALLINT, p_aktor TEXT) RETURNS VOID AS $$
BEGIN
    UPDATE tahun_ajaran SET aktif = FALSE WHERE aktif;
    UPDATE tahun_ajaran SET aktif = TRUE WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'tahun ajaran tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    PERFORM catat_audit(p_aktor, NULL, 'aktifkan_tahun_ajaran', 'tahun_ajaran:' || p_id);
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 12. KARTU — terbit, cabut, aktifkan lagi (F-02, F-03, F-102, §9)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION kartu_terbit(p_siswa_id BIGINT, p_uid TEXT, p_aktor TEXT, p_alasan_lama TEXT DEFAULT 'diganti')
RETURNS BIGINT AS $$
DECLARE kid BIGINT; u TEXT := upper(regexp_replace(p_uid, '[^0-9A-Fa-f]', '', 'g'));
BEGIN
    IF length(u) < 8 THEN RAISE EXCEPTION 'UID kartu tidak valid' USING HINT = 'UID_TIDAK_VALID'; END IF;
    PERFORM 1 FROM siswa WHERE id = p_siswa_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'siswa tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    -- kartu lama yang masih aktif otomatis 'diganti' (F-02: maksimal satu aktif)
    UPDATE kartu SET status = 'diganti', dicabut = now(), alasan = p_alasan_lama
     WHERE siswa_id = p_siswa_id AND status = 'aktif';
    -- UID yang pernah dipakai dan sudah dicabut tidak boleh hidup lagi lewat jalur ini
    IF EXISTS (SELECT 1 FROM kartu WHERE uid = u) THEN
        RAISE EXCEPTION 'UID % sudah pernah terdaftar — kartu lama tidak bisa diterbitkan ulang', u USING HINT = 'UID_SUDAH_ADA';
    END IF;
    INSERT INTO kartu (uid, siswa_id) VALUES (u, p_siswa_id) RETURNING id INTO kid;
    PERFORM catat_audit(p_aktor, NULL, 'terbit_kartu', 'siswa:' || p_siswa_id, jsonb_build_object('kartu_id', kid, 'uid', u));
    RETURN kid;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION kartu_cabut(p_kartu_id BIGINT, p_status status_kartu, p_aktor TEXT, p_alasan TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE sid BIGINT;
BEGIN
    IF p_status = 'aktif' THEN RAISE EXCEPTION 'gunakan kartu_aktifkan_lagi()' USING HINT = 'NILAI_TIDAK_VALID'; END IF;
    UPDATE kartu SET status = p_status, dicabut = now(), alasan = p_alasan
     WHERE id = p_kartu_id AND status = 'aktif' RETURNING siswa_id INTO sid;
    IF NOT FOUND THEN RAISE EXCEPTION 'kartu tidak ditemukan atau sudah tidak aktif' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    PERFORM catat_audit(p_aktor, NULL, 'cabut_kartu', 'siswa:' || sid,
                        jsonb_build_object('kartu_id', p_kartu_id, 'status', p_status, 'alasan', p_alasan));
END $$ LANGUAGE plpgsql;

-- Kartu ditemukan setelah dilapor hilang: boleh aktif lagi HANYA kalau
-- belum ada kartu pengganti (§9). Setelah kartu baru terbit, yang lama mati permanen.
CREATE OR REPLACE FUNCTION kartu_aktifkan_lagi(p_kartu_id BIGINT, p_aktor TEXT) RETURNS VOID AS $$
DECLARE sid BIGINT; st status_kartu;
BEGIN
    SELECT siswa_id, status INTO sid, st FROM kartu WHERE id = p_kartu_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'kartu tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    IF st <> 'hilang' THEN
        RAISE EXCEPTION 'hanya kartu berstatus hilang yang bisa diaktifkan lagi (status sekarang: %)', st USING HINT = 'STATUS_TIDAK_SESUAI';
    END IF;
    IF EXISTS (SELECT 1 FROM kartu WHERE siswa_id = sid AND status = 'aktif') THEN
        RAISE EXCEPTION 'kartu pengganti sudah terbit — kartu lama tidak bisa diaktifkan lagi' USING HINT = 'SUDAH_ADA_PENGGANTI';
    END IF;
    UPDATE kartu SET status = 'aktif', dicabut = NULL, alasan = NULL WHERE id = p_kartu_id;
    PERFORM catat_audit(p_aktor, NULL, 'aktifkan_kartu_lagi', 'siswa:' || sid, jsonb_build_object('kartu_id', p_kartu_id));
END $$ LANGUAGE plpgsql;

-- Impor massal dari Smart Classroom (F-05, F-80): [{"nis":"26001","uid":"04A1..."}]
-- Baris yang gagal dikembalikan, tidak menghentikan yang lain.
CREATE OR REPLACE FUNCTION kartu_impor(p_daftar JSONB, p_aktor TEXT)
RETURNS TABLE (nis TEXT, uid TEXT, berhasil BOOLEAN, pesan TEXT) AS $$
DECLARE x JSONB; sid BIGINT;
BEGIN
    FOR x IN SELECT * FROM jsonb_array_elements(p_daftar) LOOP
        nis := x->>'nis'; uid := upper(x->>'uid');
        BEGIN
            SELECT id INTO sid FROM siswa WHERE siswa.nis = x->>'nis';
            IF sid IS NULL THEN
                berhasil := FALSE; pesan := 'NIS tidak ditemukan';
            ELSIF EXISTS (SELECT 1 FROM kartu k WHERE k.siswa_id = sid AND k.status = 'aktif') THEN
                berhasil := FALSE; pesan := 'siswa sudah punya kartu aktif';
            ELSE
                PERFORM kartu_terbit(sid, uid, p_aktor);
                berhasil := TRUE; pesan := 'ok';
            END IF;
        EXCEPTION WHEN OTHERS THEN
            berhasil := FALSE; pesan := SQLERRM;
        END;
        RETURN NEXT;
    END LOOP;
END $$ LANGUAGE plpgsql;
