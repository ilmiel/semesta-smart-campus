-- =====================================================================
-- 006 — LOKER (Fase 2) — PRD §7.7 (F-60–F-62)
-- Fasilitas GRATIS (keputusan GM, 2 Sep 2026). Buka = akses, bukan uang:
-- tanpa PIN, tanpa ledger. Denda kerusakan hanya atas keputusan manusia
-- (pembina/TU) → masuk tagihan menunggu, tidak pernah otomatis.
-- =====================================================================

CREATE TYPE kondisi_loker AS ENUM ('baik', 'rusak', 'perbaikan');

CREATE TABLE loker (
    id         SERIAL PRIMARY KEY,
    kode       TEXT NOT NULL UNIQUE,               -- 'A-117'
    blok       TEXT NOT NULL,                      -- 'A'
    nomor      INTEGER NOT NULL,
    lokasi     TEXT,                               -- 'Asrama Putra lt. 1'
    device_id  BIGINT REFERENCES device(id),       -- controller yang mengendalikan kunci blok ini
    kondisi    kondisi_loker NOT NULL DEFAULT 'baik',
    aktif      BOOLEAN NOT NULL DEFAULT TRUE,
    catatan    TEXT,
    UNIQUE (blok, nomor)
);

CREATE TABLE penugasan_loker (
    id               BIGSERIAL PRIMARY KEY,
    loker_id         INTEGER NOT NULL REFERENCES loker(id),
    siswa_id         BIGINT NOT NULL REFERENCES siswa(id),
    tahun_ajaran_id  SMALLINT NOT NULL REFERENCES tahun_ajaran(id),
    mulai            DATE NOT NULL DEFAULT hari_ini(),
    selesai          DATE,
    oleh             TEXT,
    catatan          TEXT
);
-- satu loker satu penghuni; satu siswa satu loker per tahun ajaran
CREATE UNIQUE INDEX loker_satu_penghuni ON penugasan_loker (loker_id) WHERE selesai IS NULL;
CREATE UNIQUE INDEX siswa_satu_loker ON penugasan_loker (siswa_id, tahun_ajaran_id) WHERE selesai IS NULL;
CREATE INDEX ON penugasan_loker (siswa_id);

CREATE TABLE akses_loker (
    id         BIGSERIAL PRIMARY KEY,
    loker_id   INTEGER REFERENCES loker(id),
    device_id  BIGINT REFERENCES device(id),
    kartu_uid  TEXT,
    siswa_id   BIGINT REFERENCES siswa(id),
    berhasil   BOOLEAN NOT NULL,
    alasan     TEXT,
    waktu      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON akses_loker (loker_id, waktu DESC);
CREATE INDEX ON akses_loker (siswa_id, waktu DESC);

-- Buat loker satu blok sekaligus: loker_buat_blok('A', 1, 120, 'Asrama Putra lt.1', 'LOKER-A')
CREATE OR REPLACE FUNCTION loker_buat_blok(p_blok TEXT, p_dari INTEGER, p_sampai INTEGER, p_lokasi TEXT, p_device_kode TEXT, p_aktor TEXT)
RETURNS INTEGER AS $$
DECLARE did BIGINT; n INTEGER;
BEGIN
    IF p_device_kode IS NOT NULL THEN
        SELECT id INTO did FROM device WHERE kode = p_device_kode AND layanan = 'locker';
        IF did IS NULL THEN RAISE EXCEPTION 'controller loker % tidak ada', p_device_kode USING HINT = 'DEVICE_TIDAK_DIKENAL'; END IF;
    END IF;
    INSERT INTO loker (kode, blok, nomor, lokasi, device_id)
    SELECT p_blok || '-' || lpad(g::text, 3, '0'), p_blok, g, p_lokasi, did FROM generate_series(p_dari, p_sampai) g
    ON CONFLICT (blok, nomor) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM catat_audit(p_aktor, NULL, 'buat_blok_loker', 'loker:' || p_blok, jsonb_build_object('dari', p_dari, 'sampai', p_sampai, 'dibuat', n));
    RETURN n;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION loker_tugaskan(p_loker_kode TEXT, p_siswa_id BIGINT, p_oleh TEXT, p_catatan TEXT DEFAULT NULL)
RETURNS BIGINT AS $$
DECLARE l loker; ta SMALLINT; pid BIGINT;
BEGIN
    SELECT * INTO l FROM loker WHERE kode = p_loker_kode FOR UPDATE;
    IF l.id IS NULL THEN RAISE EXCEPTION 'loker % tidak ada', p_loker_kode USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    IF NOT l.aktif OR l.kondisi <> 'baik' THEN RAISE EXCEPTION 'loker % %', l.kode, CASE WHEN NOT l.aktif THEN 'nonaktif' ELSE l.kondisi::text END USING HINT = 'LOKER_TIDAK_TERSEDIA'; END IF;
    IF EXISTS (SELECT 1 FROM penugasan_loker WHERE loker_id = l.id AND selesai IS NULL) THEN
        RAISE EXCEPTION 'loker % sudah terisi', l.kode USING HINT = 'LOKER_TERISI';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM siswa WHERE id = p_siswa_id AND status = 'aktif') THEN
        RAISE EXCEPTION 'siswa tidak aktif' USING HINT = 'SISWA_NONAKTIF';
    END IF;
    SELECT id INTO ta FROM tahun_ajaran WHERE aktif;
    IF EXISTS (SELECT 1 FROM penugasan_loker WHERE siswa_id = p_siswa_id AND tahun_ajaran_id = ta AND selesai IS NULL) THEN
        RAISE EXCEPTION 'siswa sudah punya loker tahun ini — lepas dulu' USING HINT = 'SISWA_SUDAH_PUNYA_LOKER';
    END IF;
    INSERT INTO penugasan_loker (loker_id, siswa_id, tahun_ajaran_id, oleh, catatan)
    VALUES (l.id, p_siswa_id, ta, p_oleh, p_catatan) RETURNING id INTO pid;
    PERFORM catat_audit(p_oleh, NULL, 'tugaskan_loker', 'siswa:' || p_siswa_id, jsonb_build_object('loker', l.kode));
    RETURN pid;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION loker_lepas(p_loker_kode TEXT, p_oleh TEXT, p_alasan TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE sid BIGINT;
BEGIN
    UPDATE penugasan_loker p SET selesai = hari_ini(), catatan = COALESCE(p.catatan || ' | ', '') || COALESCE('dilepas: ' || p_alasan, 'dilepas')
      FROM loker l WHERE l.id = p.loker_id AND l.kode = p_loker_kode AND p.selesai IS NULL
    RETURNING p.siswa_id INTO sid;
    IF sid IS NULL THEN RAISE EXCEPTION 'loker % tidak sedang ditempati', p_loker_kode USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    PERFORM catat_audit(p_oleh, NULL, 'lepas_loker', 'siswa:' || sid, jsonb_build_object('loker', p_loker_kode, 'alasan', p_alasan));
END $$ LANGUAGE plpgsql;

-- F-60: buka dengan tap. Mengembalikan boolean + alasan (controller butuh jawaban,
-- bukan exception). Setiap percobaan tercatat.
CREATE OR REPLACE FUNCTION loker_buka(p_device_kode TEXT, p_loker_kode TEXT, p_uid TEXT)
RETURNS TABLE (buka BOOLEAN, alasan TEXT, nama TEXT) AS $$
DECLARE d device; l loker; k kartu; s siswa; u TEXT := upper(regexp_replace(p_uid, '[^0-9A-Fa-f]', '', 'g'));
BEGIN
    d := device_aktif(p_device_kode);
    SELECT * INTO l FROM loker WHERE kode = p_loker_kode;
    IF l.id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'loker tidak dikenal', NULL::text; RETURN;
    END IF;
    SELECT * INTO k FROM kartu WHERE uid = u;
    IF k.id IS NOT NULL THEN SELECT * INTO s FROM siswa WHERE id = k.siswa_id; END IF;

    IF l.device_id IS NOT NULL AND l.device_id <> d.id THEN
        alasan := 'loker bukan milik controller ini'; buka := FALSE;
    ELSIF NOT l.aktif OR l.kondisi <> 'baik' THEN
        alasan := 'loker ' || CASE WHEN NOT l.aktif THEN 'nonaktif' ELSE l.kondisi::text END; buka := FALSE;
    ELSIF k.id IS NULL THEN
        alasan := 'kartu tidak dikenal'; buka := FALSE;
    ELSIF k.status <> 'aktif' THEN
        alasan := 'kartu diblokir (' || k.status || ')'; buka := FALSE;
    ELSIF s.status <> 'aktif' THEN
        alasan := 'siswa ' || s.status; buka := FALSE;
    ELSIF NOT EXISTS (SELECT 1 FROM penugasan_loker p WHERE p.loker_id = l.id AND p.siswa_id = s.id AND p.selesai IS NULL) THEN
        alasan := 'bukan loker siswa ini'; buka := FALSE;
    ELSE
        alasan := NULL; buka := TRUE;
    END IF;
    INSERT INTO akses_loker (loker_id, device_id, kartu_uid, siswa_id, berhasil, alasan)
    VALUES (l.id, d.id, u, s.id, buka, alasan);
    nama := s.nama;
    RETURN NEXT;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION loker_kondisi(p_loker_kode TEXT, p_kondisi kondisi_loker, p_oleh TEXT, p_catatan TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE lama kondisi_loker;
BEGIN
    UPDATE loker SET kondisi = p_kondisi, catatan = COALESCE(p_catatan, catatan) WHERE kode = p_loker_kode RETURNING kondisi INTO lama;
    IF NOT FOUND THEN RAISE EXCEPTION 'loker tidak ada' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    PERFORM catat_audit(p_oleh, NULL, 'ubah_kondisi_loker', 'loker:' || p_loker_kode, jsonb_build_object('kondisi', p_kondisi, 'catatan', p_catatan));
END $$ LANGUAGE plpgsql;

-- F-61: denda kerusakan — keputusan pembina/TU, masuk tagihan menunggu (bukan potong otomatis).
CREATE OR REPLACE FUNCTION loker_denda(p_loker_kode TEXT, p_siswa_id BIGINT, p_nominal BIGINT, p_alasan TEXT, p_oleh TEXT)
RETURNS BIGINT AS $$
DECLARE tid BIGINT;
BEGIN
    IF coalesce(p_alasan, '') = '' THEN RAISE EXCEPTION 'alasan denda wajib' USING HINT = 'ALASAN_WAJIB'; END IF;
    IF p_nominal IS NULL OR p_nominal <= 0 THEN RAISE EXCEPTION 'nominal tidak valid' USING HINT = 'NOMINAL_TIDAK_VALID'; END IF;
    IF NOT EXISTS (SELECT 1 FROM loker WHERE kode = p_loker_kode) THEN RAISE EXCEPTION 'loker tidak ada' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    INSERT INTO tagihan (siswa_id, sumber, ref, keterangan, nominal_rp, oleh)
    VALUES (p_siswa_id, 'locker', 'loker:' || p_loker_kode, 'Denda loker ' || p_loker_kode || ': ' || p_alasan, p_nominal, p_oleh)
    RETURNING id INTO tid;
    PERFORM catat_audit(p_oleh, NULL, 'denda_loker', 'siswa:' || p_siswa_id, jsonb_build_object('loker', p_loker_kode, 'nominal_rp', p_nominal, 'alasan', p_alasan, 'tagihan_id', tid));
    PERFORM notifikasi_wali(p_siswa_id, 'tagihan_baru', 'Tagihan denda loker',
        format('Denda loker %s Rp %s: %s. Bayar lewat portal.', p_loker_kode, rp_teks(p_nominal), p_alasan));
    RETURN tid;
END $$ LANGUAGE plpgsql;

-- Peta loker untuk dashboard
CREATE OR REPLACE VIEW v_loker_peta AS
SELECT l.id, l.kode, l.blok, l.nomor, l.lokasi, l.kondisi, l.aktif,
       CASE WHEN NOT l.aktif OR l.kondisi <> 'baik' THEN 'rusak'
            WHEN p.id IS NULL THEN 'kosong' ELSE 'isi' END AS status,
       p.siswa_id, s.nama, s.nis,
       (SELECT pk.kelas FROM penempatan_kelas pk WHERE pk.siswa_id = s.id AND pk.tahun_ajaran_id = (SELECT id FROM tahun_ajaran WHERE aktif LIMIT 1)) AS kelas,
       p.mulai,
       (SELECT MAX(a.waktu) FROM akses_loker a WHERE a.loker_id = l.id AND a.berhasil) AS akses_terakhir,
       (SELECT COUNT(*) FROM akses_loker a WHERE a.loker_id = l.id AND NOT a.berhasil AND a.waktu > now() - interval '7 days') AS gagal_7hari
  FROM loker l
  LEFT JOIN penugasan_loker p ON p.loker_id = l.id AND p.selesai IS NULL
  LEFT JOIN siswa s ON s.id = p.siswa_id;
