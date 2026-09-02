-- =====================================================================
-- SEMESTA SMART CAMPUS — SKEMA INTI
-- PostgreSQL 14+
--
--   psql -U postgres -d smartcampus -f 01_core.sql
--
-- Isi: identity (siswa, kartu, PIN), wallet (ledger double-entry),
--      device registry (terminal), audit.
-- Layanan spesifik (kantin, perpus, locker, laundry) menyusul di file
-- terpisah dan HANYA berbicara lewat wallet + identity di sini.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. IDENTITY
-- =====================================================================

CREATE TABLE tahun_ajaran (
    id          SMALLSERIAL PRIMARY KEY,
    kode        TEXT NOT NULL UNIQUE,          -- '2026/2027'
    mulai       DATE NOT NULL,
    selesai     DATE NOT NULL,
    aktif       BOOLEAN NOT NULL DEFAULT FALSE,
    CHECK (selesai > mulai)
);
-- Hanya boleh ada satu tahun ajaran aktif.
CREATE UNIQUE INDEX ON tahun_ajaran (aktif) WHERE aktif;

CREATE TYPE status_siswa AS ENUM ('aktif', 'cuti', 'pindah', 'lulus', 'keluar');

CREATE TABLE siswa (
    id           BIGSERIAL PRIMARY KEY,
    nis          TEXT NOT NULL UNIQUE,
    nama         TEXT NOT NULL,
    email        TEXT UNIQUE,                  -- akun Google Workspace
    jenjang      TEXT,                         -- 'SMP' | 'SMA'
    status       status_siswa NOT NULL DEFAULT 'aktif',
    boarding     BOOLEAN NOT NULL DEFAULT TRUE,
    dibuat       TIMESTAMPTZ NOT NULL DEFAULT now(),
    diubah       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON siswa (status) WHERE status = 'aktif';
CREATE INDEX ON siswa (lower(nama));

-- Kelas berubah tiap tahun. Riwayatnya disimpan, bukan ditimpa —
-- supaya laporan tahun lalu tetap menampilkan kelas yang benar.
CREATE TABLE penempatan_kelas (
    id              BIGSERIAL PRIMARY KEY,
    siswa_id        BIGINT NOT NULL REFERENCES siswa(id) ON DELETE RESTRICT,
    tahun_ajaran_id SMALLINT NOT NULL REFERENCES tahun_ajaran(id),
    kelas           TEXT NOT NULL,             -- '7.A'
    wali_email      TEXT,
    UNIQUE (siswa_id, tahun_ajaran_id)
);
CREATE INDEX ON penempatan_kelas (tahun_ajaran_id, kelas);

CREATE TABLE wali (
    id          BIGSERIAL PRIMARY KEY,
    siswa_id    BIGINT NOT NULL REFERENCES siswa(id) ON DELETE CASCADE,
    nama        TEXT NOT NULL,
    hubungan    TEXT,                          -- 'ayah' | 'ibu' | 'wali'
    whatsapp    TEXT,
    email       TEXT,
    utama       BOOLEAN NOT NULL DEFAULT FALSE -- penerima notifikasi
);
CREATE INDEX ON wali (siswa_id);

-- ---------------------------------------------------------------------
-- KARTU RFID
--
-- Kartu bisa hilang, rusak, atau diganti. Yang menempel pada transaksi
-- adalah SISWA, bukan kartu — jadi kartu baru tidak menghapus riwayat.
-- Satu siswa boleh punya beberapa kartu, tapi hanya satu yang aktif.
-- ---------------------------------------------------------------------
CREATE TYPE status_kartu AS ENUM ('aktif', 'hilang', 'rusak', 'diganti', 'ditarik');

CREATE TABLE kartu (
    id           BIGSERIAL PRIMARY KEY,
    uid          TEXT NOT NULL UNIQUE,         -- UID Mifare, hex uppercase
    siswa_id     BIGINT NOT NULL REFERENCES siswa(id) ON DELETE RESTRICT,
    status       status_kartu NOT NULL DEFAULT 'aktif',
    terbit       TIMESTAMPTZ NOT NULL DEFAULT now(),
    dicabut      TIMESTAMPTZ,
    alasan       TEXT,
    CHECK (status = 'aktif' OR dicabut IS NOT NULL)
);
CREATE UNIQUE INDEX satu_kartu_aktif ON kartu (siswa_id) WHERE status = 'aktif';
CREATE INDEX ON kartu (uid) WHERE status = 'aktif';

-- ---------------------------------------------------------------------
-- PIN
--
-- Milik SISWA, bukan kartu — ganti kartu tidak mengubah PIN.
-- Hash dibuat di aplikasi (bcrypt/argon2). Kolom ini tidak pernah
-- menyimpan PIN mentah, dan verifikasi TIDAK PERNAH terjadi di terminal.
-- ---------------------------------------------------------------------
CREATE TABLE pin_siswa (
    siswa_id     BIGINT PRIMARY KEY REFERENCES siswa(id) ON DELETE CASCADE,
    hash         TEXT NOT NULL,
    diubah       TIMESTAMPTZ NOT NULL DEFAULT now(),
    gagal        SMALLINT NOT NULL DEFAULT 0,
    terkunci_hingga TIMESTAMPTZ,
    harus_ganti  BOOLEAN NOT NULL DEFAULT TRUE  -- PIN awal wajib diganti
);

CREATE TABLE percobaan_pin (
    id         BIGSERIAL PRIMARY KEY,
    siswa_id   BIGINT REFERENCES siswa(id) ON DELETE SET NULL,
    device_id  BIGINT,
    berhasil   BOOLEAN NOT NULL,
    waktu      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip         INET
);
CREATE INDEX ON percobaan_pin (siswa_id, waktu DESC);

-- =====================================================================
-- 2. DEVICE / TERMINAL
--
-- Tiap reader punya identitas sendiri. Terminal membuktikan dirinya
-- dengan API key (yang disimpan sebagai hash), bukan sekadar berada
-- di jaringan sekolah — supaya orang tidak bisa mencolok laptop dan
-- berpura-pura jadi mesin kantin.
-- =====================================================================
CREATE TYPE jenis_layanan AS ENUM
    ('kantin', 'perpustakaan', 'locker', 'vending', 'laundry', 'kelas', 'gerbang', 'topup');

CREATE TABLE device (
    id            BIGSERIAL PRIMARY KEY,
    kode          TEXT NOT NULL UNIQUE,        -- 'KANTIN-01'
    nama          TEXT NOT NULL,
    layanan       jenis_layanan NOT NULL,
    lokasi        TEXT,
    api_key_hash  TEXT NOT NULL,
    aktif         BOOLEAN NOT NULL DEFAULT TRUE,
    -- batas transaksi saat terminal offline
    limit_offline_rp   INTEGER NOT NULL DEFAULT 25000,
    terakhir_online    TIMESTAMPTZ,
    dibuat        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON device (layanan) WHERE aktif;

-- =====================================================================
-- 3. WALLET — LEDGER DOUBLE-ENTRY
--
-- Saldo TIDAK disimpan sebagai kolom yang di-update. Saldo adalah hasil
-- penjumlahan seluruh entri ledger. Alasannya: kalau saldo disimpan
-- sebagai satu angka, satu request dobel atau satu koneksi putus bisa
-- membuat uang hilang tanpa jejak. Dengan ledger, setiap rupiah punya
-- asal-usul dan kesalahan diperbaiki dengan transaksi balik, bukan
-- dengan mengedit angka.
--
-- Setiap transaksi terdiri dari >= 2 entri yang jumlahnya HARUS nol.
-- Aturan itu ditegakkan database, bukan diserahkan ke aplikasi.
--
-- Semua nominal dalam RUPIAH BULAT (BIGINT). Tidak ada pecahan sen,
-- tidak ada floating point — uang tidak pernah disimpan sebagai float.
-- =====================================================================

CREATE TYPE jenis_akun AS ENUM ('siswa', 'pendapatan', 'kas', 'penyesuaian');

CREATE TABLE akun (
    id        BIGSERIAL PRIMARY KEY,
    jenis     jenis_akun NOT NULL,
    siswa_id  BIGINT UNIQUE REFERENCES siswa(id) ON DELETE RESTRICT,
    kode      TEXT UNIQUE,                     -- untuk akun sistem: 'KANTIN', 'GATEWAY'
    nama      TEXT NOT NULL,
    -- saldo siswa tidak boleh minus; akun sistem boleh
    boleh_minus BOOLEAN NOT NULL DEFAULT FALSE,
    dibuat    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ( (jenis = 'siswa' AND siswa_id IS NOT NULL AND kode IS NULL)
         OR (jenis <> 'siswa' AND siswa_id IS NULL AND kode IS NOT NULL) )
);

CREATE TYPE jenis_transaksi AS ENUM
    ('topup', 'belanja', 'refund', 'denda', 'koreksi', 'transfer', 'penarikan');
-- 'penarikan' = pengembalian sisa saldo ke ortu saat siswa lulus/pindah/keluar.
-- 'transfer' (antar-siswa) ADA di enum tapi DIMATIKAN di aplikasi sampai
-- tinjauan hukum e-money closed-loop selesai (lihat PRD §8.4).
CREATE TYPE status_transaksi AS ENUM ('pending', 'selesai', 'batal', 'gagal');

CREATE TABLE transaksi (
    id            BIGSERIAL PRIMARY KEY,
    kode          TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(9), 'base64'),
    jenis         jenis_transaksi NOT NULL,
    status        status_transaksi NOT NULL DEFAULT 'selesai',
    -- Kunci idempotensi: terminal yang mengirim ulang request yang sama
    -- (karena timeout) tidak akan memotong saldo dua kali.
    idempotency_key TEXT UNIQUE,
    device_id     BIGINT REFERENCES device(id),
    siswa_id      BIGINT REFERENCES siswa(id),
    kartu_id      BIGINT REFERENCES kartu(id),
    total_rp      BIGINT NOT NULL CHECK (total_rp >= 0),
    pakai_pin     BOOLEAN NOT NULL DEFAULT FALSE,
    offline       BOOLEAN NOT NULL DEFAULT FALSE,
    keterangan    TEXT,
    ref_eksternal TEXT,                        -- id invoice payment gateway
    -- refund/koreksi/penarikan menunjuk transaksi asalnya, supaya riwayat
    -- bisa ditelusuri dua arah: "ini koreksi untuk apa?" dan
    -- "transaksi ini sudah pernah dikoreksi belum?"
    ref_transaksi_id BIGINT REFERENCES transaksi(id),
    dibuat        TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- waktu transaksi terjadi di terminal (bisa lebih awal dari `dibuat`
    -- kalau dikirim menyusul setelah offline)
    waktu_terminal TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON transaksi (siswa_id, dibuat DESC);
CREATE INDEX ON transaksi (device_id, dibuat DESC);
CREATE INDEX ON transaksi (jenis, dibuat DESC);
CREATE INDEX ON transaksi (ref_eksternal) WHERE ref_eksternal IS NOT NULL;

CREATE TABLE entri_ledger (
    id            BIGSERIAL PRIMARY KEY,
    transaksi_id  BIGINT NOT NULL REFERENCES transaksi(id) ON DELETE RESTRICT,
    akun_id       BIGINT NOT NULL REFERENCES akun(id) ON DELETE RESTRICT,
    -- positif = masuk ke akun ini, negatif = keluar
    nominal_rp    BIGINT NOT NULL CHECK (nominal_rp <> 0),
    dibuat        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON entri_ledger (akun_id, id);
CREATE INDEX ON entri_ledger (transaksi_id);

-- Ledger append-only: entri yang sudah masuk tidak boleh diubah/dihapus.
-- Koreksi dilakukan dengan transaksi baru berjenis 'koreksi'.
CREATE OR REPLACE FUNCTION tolak_ubah_ledger() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'entri_ledger bersifat append-only — buat transaksi koreksi, jangan ubah/hapus';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON entri_ledger
    FOR EACH ROW EXECUTE FUNCTION tolak_ubah_ledger();

-- Setiap transaksi harus seimbang (jumlah entri = 0). Diperiksa saat
-- COMMIT, sehingga entri boleh dimasukkan satu per satu dalam transaksi
-- database yang sama.
CREATE OR REPLACE FUNCTION cek_seimbang() RETURNS trigger AS $$
DECLARE
    selisih BIGINT;
    n INTEGER;
BEGIN
    SELECT COALESCE(SUM(nominal_rp), 0), COUNT(*) INTO selisih, n
      FROM entri_ledger WHERE transaksi_id = NEW.transaksi_id;
    IF n < 2 THEN
        RAISE EXCEPTION 'transaksi % hanya punya % entri — minimal 2', NEW.transaksi_id, n;
    END IF;
    IF selisih <> 0 THEN
        RAISE EXCEPTION 'transaksi % tidak seimbang: selisih Rp %', NEW.transaksi_id, selisih;
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_seimbang
    AFTER INSERT ON entri_ledger
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION cek_seimbang();

-- ---------------------------------------------------------------------
-- Saldo
--
-- Sumber kebenaran = penjumlahan ledger. Tabel `saldo_cache` hanya
-- mempercepat pembacaan dan selalu bisa dibangun ulang dari nol.
-- ---------------------------------------------------------------------
CREATE TABLE saldo_cache (
    akun_id     BIGINT PRIMARY KEY REFERENCES akun(id) ON DELETE CASCADE,
    saldo_rp    BIGINT NOT NULL DEFAULT 0,
    entri_terakhir BIGINT NOT NULL DEFAULT 0,
    diubah      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION perbarui_saldo() RETURNS trigger AS $$
BEGIN
    INSERT INTO saldo_cache (akun_id, saldo_rp, entri_terakhir, diubah)
    VALUES (NEW.akun_id, NEW.nominal_rp, NEW.id, now())
    ON CONFLICT (akun_id) DO UPDATE
      SET saldo_rp = saldo_cache.saldo_rp + EXCLUDED.saldo_rp,
          entri_terakhir = GREATEST(saldo_cache.entri_terakhir, EXCLUDED.entri_terakhir),
          diubah = now();
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_saldo AFTER INSERT ON entri_ledger
    FOR EACH ROW EXECUTE FUNCTION perbarui_saldo();

-- Saldo siswa tidak boleh minus. Ditegakkan setelah seluruh entri masuk.
CREATE OR REPLACE FUNCTION cek_saldo_tidak_minus() RETURNS trigger AS $$
DECLARE
    s BIGINT;
    boleh BOOLEAN;
    nm TEXT;
BEGIN
    SELECT a.boleh_minus, a.nama INTO boleh, nm FROM akun a WHERE a.id = NEW.akun_id;
    IF boleh THEN RETURN NULL; END IF;
    SELECT COALESCE(SUM(nominal_rp), 0) INTO s FROM entri_ledger WHERE akun_id = NEW.akun_id;
    IF s < 0 THEN
        RAISE EXCEPTION 'saldo % tidak mencukupi (akan menjadi Rp %)', nm, s;
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_saldo_positif
    AFTER INSERT ON entri_ledger
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION cek_saldo_tidak_minus();

-- Saldo terverifikasi langsung dari ledger — dipakai untuk rekonsiliasi
-- dan untuk membuktikan saldo_cache tidak melenceng.
CREATE VIEW saldo_ledger AS
SELECT a.id AS akun_id, a.jenis, a.nama, a.siswa_id,
       COALESCE(SUM(e.nominal_rp), 0) AS saldo_rp,
       COUNT(e.id) AS jumlah_entri
  FROM akun a LEFT JOIN entri_ledger e ON e.akun_id = a.id
 GROUP BY a.id;

-- =====================================================================
-- 4. TOP-UP (Payment Gateway)
--
-- Alur: buat invoice -> siswa/ortu bayar -> gateway kirim webhook ->
-- verifikasi signature -> baru saldo bertambah.
-- Saldo TIDAK PERNAH bertambah hanya karena aplikasi mengira sudah bayar.
-- =====================================================================
CREATE TYPE status_topup AS ENUM ('menunggu', 'lunas', 'kedaluwarsa', 'gagal');

CREATE TABLE topup (
    id            BIGSERIAL PRIMARY KEY,
    siswa_id      BIGINT NOT NULL REFERENCES siswa(id),
    nominal_rp    BIGINT NOT NULL CHECK (nominal_rp > 0),
    status        status_topup NOT NULL DEFAULT 'menunggu',
    gateway       TEXT NOT NULL DEFAULT 'mayar',
    invoice_id    TEXT UNIQUE,                 -- id dari gateway
    invoice_url   TEXT,
    transaksi_id  BIGINT UNIQUE REFERENCES transaksi(id),
    dibuat        TIMESTAMPTZ NOT NULL DEFAULT now(),
    kedaluwarsa   TIMESTAMPTZ,
    dibayar       TIMESTAMPTZ
);
CREATE INDEX ON topup (siswa_id, dibuat DESC);
CREATE INDEX ON topup (status) WHERE status = 'menunggu';

-- Semua webhook disimpan mentah, termasuk yang ditolak. Tanpa ini,
-- sengketa dengan gateway tidak bisa ditelusuri.
CREATE TABLE webhook_masuk (
    id          BIGSERIAL PRIMARY KEY,
    gateway     TEXT NOT NULL,
    event       TEXT,
    invoice_id  TEXT,
    body        JSONB NOT NULL,
    signature   TEXT,
    valid       BOOLEAN NOT NULL,
    diproses    BOOLEAN NOT NULL DEFAULT FALSE,
    catatan     TEXT,
    diterima    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON webhook_masuk (invoice_id);
CREATE INDEX ON webhook_masuk (diterima DESC);

-- =====================================================================
-- 5. OFFLINE QUEUE
--
-- Transaksi yang terjadi saat terminal kehilangan koneksi. Dikirim
-- menyusul, diverifikasi ulang di server, dan bisa ditolak (mis. saldo
-- ternyata tidak cukup) — karena itu limit offline harus kecil.
-- =====================================================================
CREATE TABLE antrian_offline (
    id            BIGSERIAL PRIMARY KEY,
    device_id     BIGINT NOT NULL REFERENCES device(id),
    idempotency_key TEXT NOT NULL UNIQUE,
    kartu_uid     TEXT NOT NULL,
    nominal_rp    BIGINT NOT NULL CHECK (nominal_rp > 0),
    waktu_terminal TIMESTAMPTZ NOT NULL,
    payload       JSONB,
    diterima      TIMESTAMPTZ NOT NULL DEFAULT now(),
    status        TEXT NOT NULL DEFAULT 'menunggu',  -- menunggu|diproses|ditolak
    transaksi_id  BIGINT REFERENCES transaksi(id),
    alasan_tolak  TEXT
);
CREATE INDEX ON antrian_offline (status) WHERE status = 'menunggu';

-- =====================================================================
-- 6. AUDIT
--
-- Wajib untuk uang dan untuk data siswa di bawah umur: siapa mengakses
-- apa, kapan. Melindungi staf sekolah sama seperti melindungi siswa.
-- =====================================================================
CREATE TABLE audit_log (
    id         BIGSERIAL PRIMARY KEY,
    waktu      TIMESTAMPTZ NOT NULL DEFAULT now(),
    aktor      TEXT NOT NULL,                  -- email staf / kode device / 'sistem'
    peran      TEXT,
    aksi       TEXT NOT NULL,                  -- 'lihat_siswa','ubah_pin','refund',...
    objek      TEXT,                           -- 'siswa:1234'
    ip         INET,
    meta       JSONB
);
CREATE INDEX ON audit_log (waktu DESC);
CREATE INDEX ON audit_log (aktor, waktu DESC);
CREATE INDEX ON audit_log (objek, waktu DESC);

-- =====================================================================
-- 7. AKUN SISTEM
-- =====================================================================
INSERT INTO akun (jenis, kode, nama, boleh_minus) VALUES
    ('kas',          'GATEWAY',     'Kas — Payment Gateway',   TRUE),
    ('pendapatan',   'KANTIN',      'Pendapatan Kantin',       TRUE),
    ('pendapatan',   'LAUNDRY',     'Pendapatan Laundry',      TRUE),
    ('pendapatan',   'VENDING',     'Pendapatan Vending',      TRUE),
    ('pendapatan',   'DENDA_PERPUS','Pendapatan Denda Perpus', TRUE),
    ('penyesuaian',  'KOREKSI',     'Akun Koreksi',            TRUE);

-- =====================================================================
-- 8. FUNGSI BANTU
-- =====================================================================

-- Otomatis buat akun wallet begitu siswa dibuat.
CREATE OR REPLACE FUNCTION buat_akun_siswa() RETURNS trigger AS $$
BEGIN
    INSERT INTO akun (jenis, siswa_id, nama) VALUES ('siswa', NEW.id, 'Wallet ' || NEW.nama);
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER siswa_buat_akun AFTER INSERT ON siswa
    FOR EACH ROW EXECUTE FUNCTION buat_akun_siswa();

-- Cari siswa dari UID kartu. Mengembalikan NULL kalau kartu tidak aktif.
CREATE OR REPLACE FUNCTION siswa_dari_kartu(p_uid TEXT)
RETURNS TABLE (siswa_id BIGINT, kartu_id BIGINT, nama TEXT, kelas TEXT, saldo_rp BIGINT) AS $$
    SELECT s.id, k.id, s.nama, pk.kelas, COALESCE(sc.saldo_rp, 0)
      FROM kartu k
      JOIN siswa s ON s.id = k.siswa_id AND s.status = 'aktif'
      LEFT JOIN akun a ON a.siswa_id = s.id
      LEFT JOIN saldo_cache sc ON sc.akun_id = a.id
      LEFT JOIN penempatan_kelas pk ON pk.siswa_id = s.id
           AND pk.tahun_ajaran_id = (SELECT id FROM tahun_ajaran WHERE aktif LIMIT 1)
     WHERE k.uid = upper(p_uid) AND k.status = 'aktif';
$$ LANGUAGE sql STABLE;

-- Rekonsiliasi: bandingkan saldo_cache dengan ledger sebenarnya.
-- Dijalankan terjadwal; hasil tidak kosong = ada yang salah.
CREATE OR REPLACE FUNCTION cek_rekonsiliasi()
RETURNS TABLE (akun_id BIGINT, nama TEXT, cache BIGINT, ledger BIGINT, selisih BIGINT) AS $$
    SELECT l.akun_id, l.nama, COALESCE(c.saldo_rp, 0), l.saldo_rp,
           COALESCE(c.saldo_rp, 0) - l.saldo_rp
      FROM saldo_ledger l LEFT JOIN saldo_cache c ON c.akun_id = l.akun_id
     WHERE COALESCE(c.saldo_rp, 0) <> l.saldo_rp;
$$ LANGUAGE sql STABLE;

-- Bangun ulang saldo_cache dari ledger. Aman dijalankan kapan saja.
CREATE OR REPLACE FUNCTION bangun_ulang_saldo() RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
    DELETE FROM saldo_cache;
    INSERT INTO saldo_cache (akun_id, saldo_rp, entri_terakhir, diubah)
    SELECT a.id, COALESCE(SUM(e.nominal_rp), 0), COALESCE(MAX(e.id), 0), now()
      FROM akun a LEFT JOIN entri_ledger e ON e.akun_id = a.id
     GROUP BY a.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$ LANGUAGE plpgsql;
