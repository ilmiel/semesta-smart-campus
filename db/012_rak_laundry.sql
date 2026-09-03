-- =====================================================================
-- 012 — Daftar rak laundry
--
-- Sebelumnya `order_laundry.rak` hanya teks bebas: petugas mengetik "B14",
-- "B-14", "b 14" dan ketiganya jadi rak berbeda saat dicari. Sekarang ada
-- daftar rak yang dikelola admin; terminal menampilkannya sebagai pilihan,
-- tapi mengetik manual TETAP boleh — asrama sering pakai rak sementara dan
-- sistem tidak boleh menghalangi pekerjaan yang sedang berjalan.
--
-- Petugas TIDAK dibuatkan tabel: orangnya sudah ada di `staf`. Terminal
-- mengambil nama staf berperan laundry/asrama dari snapshot.
-- =====================================================================
\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS rak_laundry (
    kode    TEXT PRIMARY KEY,
    lokasi  TEXT,
    aktif   BOOLEAN NOT NULL DEFAULT TRUE,
    urutan  SMALLINT NOT NULL DEFAULT 0,
    dibuat  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rak_laundry IS
  'Rak tempat cucian selesai disimpan. Terminal menampilkannya sebagai saran; teks bebas tetap diterima.';

CREATE OR REPLACE FUNCTION rak_laundry_simpan(
    p_kode TEXT, p_lokasi TEXT, p_aktif BOOLEAN, p_urutan SMALLINT, p_aktor TEXT
) RETURNS TEXT AS $$
DECLARE k TEXT := upper(trim(p_kode)); lama rak_laundry;
BEGIN
    IF k = '' OR k IS NULL THEN
        RAISE EXCEPTION 'kode rak wajib' USING HINT = 'NILAI_TIDAK_VALID';
    END IF;
    SELECT * INTO lama FROM rak_laundry WHERE kode = k;
    INSERT INTO rak_laundry (kode, lokasi, aktif, urutan)
    VALUES (k, p_lokasi, COALESCE(p_aktif, TRUE), COALESCE(p_urutan, 0))
    ON CONFLICT (kode) DO UPDATE
       SET lokasi = EXCLUDED.lokasi, aktif = EXCLUDED.aktif, urutan = EXCLUDED.urutan;
    PERFORM catat_audit(p_aktor, NULL, 'simpan_rak_laundry', 'rak:' || k,
        jsonb_build_object('sebelum', to_jsonb(lama), 'sesudah',
                           jsonb_build_object('lokasi', p_lokasi, 'aktif', COALESCE(p_aktif, TRUE))));
    RETURN k;
END $$ LANGUAGE plpgsql;
