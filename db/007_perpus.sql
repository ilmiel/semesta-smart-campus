-- =====================================================================
-- 007 — PERPUSTAKAAN (Fase 3) — PRD §7.8 (F-70–F-72)
-- Pinjam/kembali = akses (bisa offline). Hanya pemotongan denda yang
-- menyentuh wallet → butuh PIN → butuh online (F-33). Saldo kurang / tanpa
-- PIN → buku tetap diterima, denda jadi tagihan menunggu (F-71).
-- =====================================================================

CREATE TABLE buku (
    id         BIGSERIAL PRIMARY KEY,
    isbn       TEXT,
    judul      TEXT NOT NULL,
    pengarang  TEXT,
    penerbit   TEXT,
    tahun      SMALLINT,
    kategori   TEXT,
    bahasa     TEXT DEFAULT 'id',
    referensi  BOOLEAN NOT NULL DEFAULT FALSE,     -- baca di tempat, tidak bisa dipinjam
    rak        TEXT,
    dibuat     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON buku (lower(judul));
CREATE INDEX ON buku (isbn) WHERE isbn IS NOT NULL;

CREATE TYPE status_eksemplar AS ENUM ('tersedia', 'dipinjam', 'hilang', 'ditarik', 'perbaikan');

CREATE TABLE eksemplar (
    id        BIGSERIAL PRIMARY KEY,
    buku_id   BIGINT NOT NULL REFERENCES buku(id),
    barcode   TEXT NOT NULL UNIQUE,
    nomor     SMALLINT NOT NULL DEFAULT 1,           -- eks. #2 dari 4
    kondisi   TEXT DEFAULT 'baik',
    status    status_eksemplar NOT NULL DEFAULT 'tersedia',
    dibuat    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON eksemplar (buku_id);

-- Batas per jenjang (F-70)
CREATE TABLE aturan_pinjam (
    jenjang         TEXT PRIMARY KEY,                -- 'SMP' | 'SMA' | '*'
    maks_buku       SMALLINT NOT NULL,
    lama_hari       SMALLINT NOT NULL,
    denda_per_hari  BIGINT NOT NULL,
    maks_denda_rp   BIGINT NOT NULL,                  -- denda tidak melebihi ini per pinjaman
    boleh_perpanjang SMALLINT NOT NULL DEFAULT 1
);
INSERT INTO aturan_pinjam VALUES ('SMP', 3, 7, 1000, 20000, 1), ('SMA', 5, 14, 1000, 30000, 1), ('*', 3, 7, 1000, 20000, 1);

CREATE OR REPLACE FUNCTION aturan_untuk(p_siswa_id BIGINT) RETURNS aturan_pinjam AS $$
    SELECT a.* FROM aturan_pinjam a
     WHERE a.jenjang = COALESCE((SELECT jenjang FROM siswa WHERE id = p_siswa_id), '*')
    UNION ALL SELECT a.* FROM aturan_pinjam a WHERE a.jenjang = '*'
    LIMIT 1;
$$ LANGUAGE sql STABLE;

CREATE TYPE status_denda AS ENUM ('tidak_ada', 'dipotong', 'menunggu', 'dibebaskan');

CREATE TABLE pinjaman (
    id                 BIGSERIAL PRIMARY KEY,
    eksemplar_id       BIGINT NOT NULL REFERENCES eksemplar(id),
    siswa_id           BIGINT NOT NULL REFERENCES siswa(id),
    device_id          BIGINT REFERENCES device(id),
    petugas            TEXT,
    dipinjam           TIMESTAMPTZ NOT NULL DEFAULT now(),
    jatuh_tempo        DATE NOT NULL,
    diperpanjang       SMALLINT NOT NULL DEFAULT 0,
    dikembalikan       TIMESTAMPTZ,
    denda_rp           BIGINT NOT NULL DEFAULT 0,
    denda_status       status_denda NOT NULL DEFAULT 'tidak_ada',
    denda_transaksi_id BIGINT REFERENCES transaksi(id),
    tagihan_id         BIGINT REFERENCES tagihan(id)
);
CREATE UNIQUE INDEX eksemplar_satu_pinjaman ON pinjaman (eksemplar_id) WHERE dikembalikan IS NULL;
CREATE INDEX ON pinjaman (siswa_id, dipinjam DESC);
CREATE INDEX ON pinjaman (jatuh_tempo) WHERE dikembalikan IS NULL;

-- Tambah buku + N eksemplar sekaligus (impor katalog).
CREATE OR REPLACE FUNCTION buku_tambah(p_judul TEXT, p_pengarang TEXT, p_kategori TEXT, p_isbn TEXT, p_rak TEXT, p_referensi BOOLEAN, p_jumlah_eksemplar INTEGER, p_prefix_barcode TEXT, p_aktor TEXT)
RETURNS BIGINT AS $$
DECLARE bid BIGINT;
BEGIN
    INSERT INTO buku (judul, pengarang, kategori, isbn, rak, referensi) VALUES (p_judul, p_pengarang, p_kategori, p_isbn, p_rak, COALESCE(p_referensi, FALSE)) RETURNING id INTO bid;
    INSERT INTO eksemplar (buku_id, barcode, nomor)
    SELECT bid, p_prefix_barcode || '-' || lpad(g::text, 2, '0'), g FROM generate_series(1, GREATEST(p_jumlah_eksemplar, 0)) g;
    PERFORM catat_audit(p_aktor, NULL, 'tambah_buku', 'buku:' || bid, jsonb_build_object('judul', p_judul, 'eksemplar', p_jumlah_eksemplar));
    RETURN bid;
END $$ LANGUAGE plpgsql;

-- Langkah 1 terminal: scan barcode → info + bisa dipinjam?
CREATE OR REPLACE FUNCTION perpus_scan(p_barcode TEXT)
RETURNS TABLE (eksemplar_id BIGINT, buku_id BIGINT, judul TEXT, pengarang TEXT, kategori TEXT, rak TEXT, nomor SMALLINT, total_eksemplar BIGINT,
               status status_eksemplar, bisa_dipinjam BOOLEAN, alasan TEXT, peminjam TEXT, pinjaman_id BIGINT) AS $$
    SELECT e.id, b.id, b.judul, b.pengarang, b.kategori, b.rak, e.nomor,
           (SELECT COUNT(*) FROM eksemplar x WHERE x.buku_id = b.id),
           e.status,
           e.status = 'tersedia' AND NOT b.referensi,
           CASE WHEN b.referensi THEN 'buku referensi — baca di tempat'
                WHEN e.status <> 'tersedia' THEN 'eksemplar sedang ' || e.status END,
           (SELECT s.nama FROM pinjaman p JOIN siswa s ON s.id = p.siswa_id WHERE p.eksemplar_id = e.id AND p.dikembalikan IS NULL),
           (SELECT p.id FROM pinjaman p WHERE p.eksemplar_id = e.id AND p.dikembalikan IS NULL)
      FROM eksemplar e JOIN buku b ON b.id = e.buku_id
     WHERE e.barcode = trim(p_barcode);
$$ LANGUAGE sql STABLE;

-- Langkah 2: tap kartu → pinjam. Batas jumlah per jenjang, tidak ada tombol pengecualian di terminal.
CREATE OR REPLACE FUNCTION perpus_pinjam(p_device_kode TEXT, p_barcode TEXT, p_uid TEXT, p_petugas TEXT DEFAULT NULL)
RETURNS TABLE (pinjaman_id BIGINT, judul TEXT, siswa_id BIGINT, nama TEXT, jatuh_tempo DATE, pinjaman_aktif INTEGER, maks_buku SMALLINT) AS $$
DECLARE d device; sc RECORD; r RECORD; a aturan_pinjam; n INTEGER; pid BIGINT; jt DATE;
BEGIN
    d := device_aktif(p_device_kode);
    SELECT * INTO sc FROM perpus_scan(p_barcode);
    IF sc.eksemplar_id IS NULL THEN RAISE EXCEPTION 'barcode tidak dikenal' USING HINT = 'BUKU_TIDAK_DIKENAL'; END IF;
    IF NOT sc.bisa_dipinjam THEN RAISE EXCEPTION '%', sc.alasan USING HINT = 'TIDAK_BISA_DIPINJAM'; END IF;
    SELECT * INTO r FROM identifikasi_kartu(p_uid);
    a := aturan_untuk(r.siswa_id);
    SELECT COUNT(*) INTO n FROM pinjaman p WHERE p.siswa_id = r.siswa_id AND p.dikembalikan IS NULL;
    IF n >= a.maks_buku THEN
        RAISE EXCEPTION 'batas pinjam % buku (%) — kembalikan satu dulu', a.maks_buku, a.jenjang USING HINT = 'BATAS_PINJAM';
    END IF;
    IF EXISTS (SELECT 1 FROM pinjaman p WHERE p.siswa_id = r.siswa_id AND p.dikembalikan IS NULL AND p.jatuh_tempo < hari_ini()) THEN
        RAISE EXCEPTION 'ada pinjaman yang terlambat — kembalikan dulu' USING HINT = 'ADA_TERLAMBAT';
    END IF;
    jt := hari_ini() + a.lama_hari;
    INSERT INTO pinjaman (eksemplar_id, siswa_id, device_id, petugas, jatuh_tempo)
    VALUES (sc.eksemplar_id, r.siswa_id, d.id, p_petugas, jt) RETURNING id INTO pid;
    UPDATE eksemplar SET status = 'dipinjam' WHERE id = sc.eksemplar_id;
    RETURN QUERY SELECT pid, sc.judul, r.siswa_id, r.nama, jt, n + 1, a.maks_buku;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION perpus_hitung_denda(p_pinjaman_id BIGINT, p_tanggal DATE DEFAULT hari_ini())
RETURNS TABLE (hari_telat INTEGER, denda_rp BIGINT) AS $$
DECLARE p pinjaman; a aturan_pinjam; h INTEGER;
BEGIN
    SELECT * INTO p FROM pinjaman WHERE id = p_pinjaman_id;
    a := aturan_untuk(p.siswa_id);
    h := GREATEST(p_tanggal - p.jatuh_tempo, 0);
    RETURN QUERY SELECT h, LEAST(h * a.denda_per_hari, a.maks_denda_rp);
END $$ LANGUAGE plpgsql STABLE;

-- Perpanjang (portal / terminal): sekali, hanya kalau belum terlambat.
CREATE OR REPLACE FUNCTION perpus_perpanjang(p_pinjaman_id BIGINT, p_oleh TEXT) RETURNS DATE AS $$
DECLARE p pinjaman; a aturan_pinjam; jt DATE;
BEGIN
    SELECT * INTO p FROM pinjaman WHERE id = p_pinjaman_id FOR UPDATE;
    IF p.id IS NULL OR p.dikembalikan IS NOT NULL THEN RAISE EXCEPTION 'pinjaman tidak aktif' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    a := aturan_untuk(p.siswa_id);
    IF p.diperpanjang >= a.boleh_perpanjang THEN RAISE EXCEPTION 'sudah diperpanjang % kali (maks)', p.diperpanjang USING HINT = 'MAKS_PERPANJANG'; END IF;
    IF p.jatuh_tempo < hari_ini() THEN RAISE EXCEPTION 'sudah terlambat — tidak bisa diperpanjang' USING HINT = 'SUDAH_TERLAMBAT'; END IF;
    jt := p.jatuh_tempo + a.lama_hari;
    UPDATE pinjaman SET jatuh_tempo = jt, diperpanjang = diperpanjang + 1 WHERE id = p.id;
    PERFORM catat_audit(p_oleh, NULL, 'perpanjang_pinjaman', 'pinjaman:' || p.id, jsonb_build_object('jatuh_tempo', jt));
    RETURN jt;
END $$ LANGUAGE plpgsql;

-- Kembali (F-71). p_pin_ok TRUE = siswa memasukkan PIN & aplikasi sudah verifikasi → potong wallet.
-- Saldo kurang atau tanpa PIN → tagihan menunggu. Buku SELALU diterima.
CREATE OR REPLACE FUNCTION perpus_kembali(p_device_kode TEXT, p_barcode TEXT, p_pin_ok BOOLEAN DEFAULT FALSE, p_petugas TEXT DEFAULT NULL)
RETURNS TABLE (pinjaman_id BIGINT, judul TEXT, siswa_id BIGINT, nama TEXT, hari_telat INTEGER, denda_rp BIGINT, denda_status status_denda, saldo_rp BIGINT, rak TEXT, pinjaman_aktif INTEGER) AS $$
DECLARE d device; sc RECORD; p pinjaman; dn RECORD; tid BIGINT; tg BIGINT; st status_denda := 'tidak_ada'; pesan TEXT; kode TEXT; snama TEXT;
BEGIN
    d := device_aktif(p_device_kode);
    SELECT * INTO sc FROM perpus_scan(p_barcode);
    IF sc.eksemplar_id IS NULL THEN RAISE EXCEPTION 'barcode tidak dikenal' USING HINT = 'BUKU_TIDAK_DIKENAL'; END IF;
    IF sc.pinjaman_id IS NULL THEN RAISE EXCEPTION 'eksemplar ini tidak sedang dipinjam' USING HINT = 'TIDAK_DIPINJAM'; END IF;
    SELECT * INTO p FROM pinjaman WHERE id = sc.pinjaman_id FOR UPDATE;
    SELECT * INTO dn FROM perpus_hitung_denda(p.id);
    SELECT s.nama INTO snama FROM siswa s WHERE s.id = p.siswa_id;

    IF dn.denda_rp > 0 THEN
        IF p_pin_ok THEN
            BEGIN
                tid := denda(p.siswa_id, dn.denda_rp, 'perpustakaan',
                             format('Denda telat %s hari — %s', dn.hari_telat, sc.judul), 'device:' || d.kode, TRUE,
                             'denda-perpus:' || p.id, d.id);
                st := 'dipotong';
            EXCEPTION WHEN OTHERS THEN
                GET STACKED DIAGNOSTICS pesan = MESSAGE_TEXT, kode = PG_EXCEPTION_HINT;
                IF kode <> 'SALDO_KURANG' THEN RAISE; END IF;
                st := 'menunggu';
            END;
        ELSE
            st := 'menunggu';
        END IF;
        IF st = 'menunggu' THEN
            INSERT INTO tagihan (siswa_id, sumber, ref, keterangan, nominal_rp, oleh)
            VALUES (p.siswa_id, 'perpustakaan', 'pinjaman:' || p.id,
                    format('Denda telat %s hari — %s', dn.hari_telat, sc.judul), dn.denda_rp, 'device:' || d.kode)
            RETURNING id INTO tg;
            PERFORM notifikasi_wali(p.siswa_id, 'tagihan_baru', 'Denda perpustakaan',
                format('Denda keterlambatan Rp %s untuk "%s" menunggu pembayaran di portal.', rp_teks(dn.denda_rp), sc.judul));
        END IF;
    END IF;

    UPDATE pinjaman SET dikembalikan = now(), denda_rp = dn.denda_rp, denda_status = st,
                        denda_transaksi_id = tid, tagihan_id = tg WHERE id = p.id;
    UPDATE eksemplar SET status = 'tersedia' WHERE id = sc.eksemplar_id;
    RETURN QUERY SELECT p.id, sc.judul, p.siswa_id, snama, dn.hari_telat, dn.denda_rp, st, saldo_siswa(p.siswa_id), sc.rak,
                        (SELECT COUNT(*)::int FROM pinjaman x WHERE x.siswa_id = p.siswa_id AND x.dikembalikan IS NULL);
END $$ LANGUAGE plpgsql;

-- Pustakawan membebaskan denda (dari dashboard, tercatat).
CREATE OR REPLACE FUNCTION perpus_bebaskan_denda(p_pinjaman_id BIGINT, p_oleh TEXT, p_alasan TEXT) RETURNS VOID AS $$
DECLARE p pinjaman;
BEGIN
    SELECT * INTO p FROM pinjaman WHERE id = p_pinjaman_id FOR UPDATE;
    IF p.id IS NULL THEN RAISE EXCEPTION 'pinjaman tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    IF p.denda_status <> 'menunggu' THEN RAISE EXCEPTION 'denda berstatus % — hanya yang menunggu bisa dibebaskan (yang sudah dipotong lewat refund keuangan)', p.denda_status USING HINT = 'STATUS_TIDAK_SESUAI'; END IF;
    PERFORM tagihan_bebaskan(p.tagihan_id, p_oleh, p_alasan);
    UPDATE pinjaman SET denda_status = 'dibebaskan' WHERE id = p.id;
END $$ LANGUAGE plpgsql;

-- Sinkron status denda saat tagihan dibayar dari portal.
CREATE OR REPLACE FUNCTION tagihan_perpus_lunas() RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'lunas' AND OLD.status = 'menunggu' AND NEW.sumber = 'perpustakaan' THEN
        UPDATE pinjaman SET denda_status = 'dipotong', denda_transaksi_id = NEW.transaksi_id WHERE tagihan_id = NEW.id;
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tagihan_perpus_lunas AFTER UPDATE OF status ON tagihan FOR EACH ROW EXECUTE FUNCTION tagihan_perpus_lunas();

-- Eksemplar hilang: pustakawan menandai; penggantian = tagihan menunggu (nominal ditentukan pustakawan).
CREATE OR REPLACE FUNCTION perpus_hilang(p_barcode TEXT, p_nominal_ganti BIGINT, p_oleh TEXT, p_alasan TEXT) RETURNS BIGINT AS $$
DECLARE sc RECORD; p pinjaman; tg BIGINT;
BEGIN
    SELECT * INTO sc FROM perpus_scan(p_barcode);
    IF sc.eksemplar_id IS NULL THEN RAISE EXCEPTION 'barcode tidak dikenal' USING HINT = 'BUKU_TIDAK_DIKENAL'; END IF;
    IF sc.pinjaman_id IS NOT NULL THEN
        SELECT * INTO p FROM pinjaman WHERE id = sc.pinjaman_id FOR UPDATE;
        IF p_nominal_ganti > 0 THEN
            INSERT INTO tagihan (siswa_id, sumber, ref, keterangan, nominal_rp, oleh)
            VALUES (p.siswa_id, 'perpustakaan', 'pinjaman:' || p.id, 'Penggantian buku hilang — ' || sc.judul, p_nominal_ganti, p_oleh)
            RETURNING id INTO tg;
        END IF;
        UPDATE pinjaman SET dikembalikan = now(), denda_rp = COALESCE(p_nominal_ganti, 0),
               denda_status = CASE WHEN p_nominal_ganti > 0 THEN 'menunggu'::status_denda ELSE 'tidak_ada' END, tagihan_id = tg WHERE id = p.id;
    END IF;
    UPDATE eksemplar SET status = 'hilang' WHERE id = sc.eksemplar_id;
    PERFORM catat_audit(p_oleh, NULL, 'buku_hilang', 'eksemplar:' || sc.eksemplar_id, jsonb_build_object('alasan', p_alasan, 'nominal_ganti', p_nominal_ganti, 'tagihan_id', tg));
    RETURN tg;
END $$ LANGUAGE plpgsql;

-- Pinjaman aktif + denda berjalan (dashboard pustakawan)
CREATE OR REPLACE VIEW v_pinjaman_aktif AS
SELECT p.id, p.siswa_id, s.nama, s.nis,
       (SELECT pk.kelas FROM penempatan_kelas pk WHERE pk.siswa_id = s.id AND pk.tahun_ajaran_id = (SELECT id FROM tahun_ajaran WHERE aktif LIMIT 1)) AS kelas,
       b.judul, b.pengarang, e.barcode, b.rak, p.dipinjam, p.jatuh_tempo, p.diperpanjang,
       GREATEST(hari_ini() - p.jatuh_tempo, 0) AS hari_telat,
       (SELECT denda_rp FROM perpus_hitung_denda(p.id)) AS denda_berjalan_rp
  FROM pinjaman p JOIN eksemplar e ON e.id = p.eksemplar_id JOIN buku b ON b.id = e.buku_id JOIN siswa s ON s.id = p.siswa_id
 WHERE p.dikembalikan IS NULL;

-- Riwayat bacaan (F-72) — untuk ortu & wali kelas: TANPA rupiah.
CREATE OR REPLACE VIEW v_riwayat_bacaan AS
SELECT p.siswa_id, b.judul, b.pengarang, b.kategori, p.dipinjam, p.jatuh_tempo, p.dikembalikan,
       p.dikembalikan IS NULL AS masih_dipinjam,
       CASE WHEN p.dikembalikan IS NULL THEN p.jatuh_tempo < hari_ini() ELSE tgl_sekolah(p.dikembalikan) > p.jatuh_tempo END AS terlambat
  FROM pinjaman p JOIN eksemplar e ON e.id = p.eksemplar_id JOIN buku b ON b.id = e.buku_id;

CREATE OR REPLACE VIEW v_buku_populer AS
SELECT b.id, b.judul, b.pengarang, b.kategori, COUNT(p.id) AS kali_dipinjam,
       COUNT(p.id) FILTER (WHERE p.dipinjam > now() - interval '30 days') AS dipinjam_30hari
  FROM buku b JOIN eksemplar e ON e.buku_id = b.id LEFT JOIN pinjaman p ON p.eksemplar_id = e.id
 GROUP BY b.id;
