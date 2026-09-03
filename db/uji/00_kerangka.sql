-- =====================================================================
-- KERANGKA UJI + DATA CONTOH
-- Dijalankan pertama oleh migrate.sh --uji pada database sementara.
-- Setiap uji mencatat LOLOS/GAGAL ke tabel uji_hasil; _ringkasan.sql
-- mencetak hasilnya dan mengembalikan exit code ≠ 0 kalau ada yang gagal.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;
-- Keluaran per-pernyataan disenyapkan oleh pemanggil (migrate.sh / harness),
-- bukan oleh `\o /dev/null` — perintah itu hanya ada di Unix dan membuat
-- seluruh suite gagal di Windows, padahal tim IT sekolah memakai Windows.

CREATE TABLE IF NOT EXISTS uji_hasil (
    no SERIAL PRIMARY KEY, berkas TEXT, nama TEXT NOT NULL, lolos BOOLEAN NOT NULL, pesan TEXT
);
CREATE TABLE IF NOT EXISTS uji_ctx (kunci TEXT PRIMARY KEY, nilai TEXT);
INSERT INTO uji_ctx VALUES ('berkas', '00_kerangka') ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai;

CREATE OR REPLACE FUNCTION uji_berkas(p TEXT) RETURNS VOID AS $$
    INSERT INTO uji_ctx VALUES ('berkas', p) ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai;
$$ LANGUAGE sql;

-- Kondisi harus TRUE.
CREATE OR REPLACE FUNCTION uji_ok(p_nama TEXT, p_kondisi BOOLEAN, p_pesan TEXT DEFAULT NULL) RETURNS VOID AS $$
BEGIN
    INSERT INTO uji_hasil (berkas, nama, lolos, pesan)
    VALUES ((SELECT nilai FROM uji_ctx WHERE kunci = 'berkas'), p_nama, COALESCE(p_kondisi, FALSE), p_pesan);
END $$ LANGUAGE plpgsql;

-- Dua nilai harus sama (pesan otomatis berisi keduanya).
CREATE OR REPLACE FUNCTION uji_sama(p_nama TEXT, p_dapat ANYELEMENT, p_harap ANYELEMENT) RETURNS VOID AS $$
BEGIN
    PERFORM uji_ok(p_nama, p_dapat IS NOT DISTINCT FROM p_harap,
                   format('dapat=%s harap=%s', p_dapat, p_harap));
END $$ LANGUAGE plpgsql;

-- Pernyataan SQL HARUS gagal dengan HINT (kode mesin) tertentu.
-- Dijalankan dalam sub-transaksi, jadi efeknya selalu di-rollback.
CREATE OR REPLACE FUNCTION uji_gagal(p_nama TEXT, p_sql TEXT, p_kode TEXT DEFAULT NULL) RETURNS VOID AS $$
DECLARE pesan TEXT; kode TEXT;
BEGIN
    BEGIN
        EXECUTE p_sql;
        -- paksa constraint trigger yang tertunda (seimbang, saldo ≥ 0) jalan sekarang
        SET CONSTRAINTS ALL IMMEDIATE;
        SET CONSTRAINTS ALL DEFERRED;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS pesan = MESSAGE_TEXT, kode = PG_EXCEPTION_HINT;
        SET CONSTRAINTS ALL DEFERRED;
        PERFORM uji_ok(p_nama,
                       p_kode IS NULL OR kode = p_kode OR pesan ILIKE '%' || p_kode || '%',
                       format('gagal dengan [%s] %s', COALESCE(kode, '-'), pesan));
        RETURN;
    END;
    PERFORM uji_ok(p_nama, FALSE, 'TIDAK gagal padahal seharusnya gagal dengan ' || COALESCE(p_kode, '(apa pun)'));
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- DATA CONTOH (mengikuti mockup frontend)
-- ---------------------------------------------------------------------
INSERT INTO tahun_ajaran (kode, mulai, selesai, aktif) VALUES ('2026/2027', '2026-07-15', '2027-06-30', TRUE);

INSERT INTO siswa (nis, nama, email, jenjang, boarding) VALUES
 ('26001', 'Rafif Gamma Wisanggeni', 'rafif.26@semesta.sch.id',      'SMP', TRUE),
 ('26002', 'Aishabilla Piliang',     'aishabilla.26@semesta.sch.id', 'SMP', TRUE),
 ('25017', 'Keenan Alvaro',          'keenan.25@semesta.sch.id',     'SMP', TRUE),
 ('23004', 'Alfian Pratama',         'alfian.23@semesta.sch.id',     'SMA', FALSE);

INSERT INTO penempatan_kelas (siswa_id, tahun_ajaran_id, kelas, wali_email) VALUES
 (1, 1, '7.A', 'walikelas7a@semesta.sch.id'), (2, 1, '7.A', 'walikelas7a@semesta.sch.id'),
 (3, 1, '8.B', 'walikelas8b@semesta.sch.id'), (4, 1, '10.A', 'walikelas10a@semesta.sch.id');

INSERT INTO wali (siswa_id, nama, hubungan, whatsapp, email, utama) VALUES
 (1, 'Bapak Gamma',   'ayah', '08111', 'gamma@example.com',  TRUE),
 (1, 'Ibu Wisanggeni','ibu',  '08112', 'ibu.w@example.com',  FALSE),
 (2, 'Ibu Piliang',   'ibu',  '08113', 'piliang@example.com', TRUE),
 (3, 'Bapak Alvaro',  'ayah', '08114', 'alvaro@example.com',  TRUE);

INSERT INTO kartu (uid, siswa_id) VALUES
 ('04A1B2C3D4E5F6', 1), ('04FFEE11223344', 2), ('04C0FFEE000001', 3);

INSERT INTO device (kode, nama, layanan, lokasi, api_key_hash) VALUES
 ('KANTIN-01', 'Kasir Kantin 1',    'kantin',       'Kantin Utama',     'hash-dummy-1'),
 ('KANTIN-02', 'Kasir Kantin 2',    'kantin',       'Kantin Utama',     'hash-dummy-2'),
 ('LNDRY-01',  'Terminal Laundry',  'laundry',      'Asrama Putra',     'hash-dummy-3'),
 ('PERPUS-01', 'Meja Sirkulasi',    'perpustakaan', 'Perpustakaan',     'hash-dummy-4'),
 ('VEND-01',   'Vending Akademik',  'vending',      'Gd. Akademik lt.1','hash-dummy-5'),
 ('VEND-02',   'Vending Asrama',    'vending',      'Asrama Putra',     'hash-dummy-6'),
 ('LOKER-A',   'Controller Loker A','locker',       'Asrama Putra',     'hash-dummy-7');

INSERT INTO staf (email, nama, peran) VALUES
 ('it@semesta.sch.id',       'Admin IT',    '{admin_it}'),
 ('keuangan@semesta.sch.id', 'Bu Rina',     '{keuangan}'),
 ('tu@semesta.sch.id',       'Pak Budi',    '{tu}'),
 ('tu2@semesta.sch.id',      'Bu Sari TU',  '{tu}'),
 ('perpus@semesta.sch.id',   'Bu Sari',     '{pustakawan}'),
 ('asrama@semesta.sch.id',   'Pak Slamet',  '{asrama,laundry}'),
 ('gm@semesta.sch.id',       'GM',          '{manajemen}');

SELECT uji_sama('akun wallet otomatis untuk 4 siswa', (SELECT COUNT(*) FROM akun WHERE jenis = 'siswa')::int, 4);
SELECT uji_sama('peran staf dari email (case-insensitive)', peran_staf('TU@semesta.sch.id')::text, '{tu}');
SELECT uji_sama('email tak terdaftar → tanpa peran', peran_staf('orang@luar.com')::text, '{}');
SELECT uji_sama('kebijakan default ambang PIN', kebijakan_int('ambang_pin_rp'), 25000::bigint);
SELECT uji_gagal('kebijakan tak dikenal ditolak', $$SELECT kebijakan_int('tidak_ada')$$, 'KEBIJAKAN_TIDAK_ADA');
