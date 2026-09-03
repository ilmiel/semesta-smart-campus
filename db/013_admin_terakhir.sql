-- =====================================================================
-- 013 — Lindungi admin IT terakhir
--
-- Fase 1.4a membuka pengelolaan peran staf lewat halaman admin. Sebelum
-- ini RBAC hanya bisa diubah lewat SQL, jadi kesalahannya terbatas pada
-- orang yang memang bisa membuka psql.
--
-- Begitu tombolnya ada di layar, satu kesalahan klik jadi mungkin: admin
-- IT terakhir mencabut peran admin_it-nya sendiri (atau menonaktifkan
-- akunnya sendiri). Setelah itu TIDAK ADA satu pun akun yang bisa
-- mengangkat admin baru — /api/admin/staf POST butuh peran admin_it —
-- dan pemulihannya hanya lewat akses langsung ke database produksi.
--
-- Larangan ini ditaruh di fungsi SQL, bukan di layar. Tombol yang
-- disembunyikan tidak menghalangi siapa pun yang memanggil API-nya
-- langsung, dan aturan ini terlalu mahal untuk dilanggar.
--
-- Yang TIDAK dilarang: mencabut peran admin_it selama masih ada admin IT
-- aktif lain. Ini bukan kunci permanen, hanya penghalang langkah terakhir.
-- =====================================================================
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION staf_simpan(p_email TEXT, p_nama TEXT, p_peran peran[], p_aktif BOOLEAN, p_aktor TEXT)
RETURNS BIGINT AS $$
DECLARE
    sid        BIGINT;
    lama       staf;
    email_l    TEXT := lower(trim(p_email));
    aktif_baru BOOLEAN;
BEGIN
    SELECT * INTO lama FROM staf WHERE email = email_l FOR UPDATE;
    aktif_baru := COALESCE(p_aktif, lama.aktif, TRUE);

    -- Baris ini sedang melepas admin_it (lewat pencabutan peran ATAU
    -- penonaktifan akun) dan tidak ada admin IT aktif lain yang tersisa.
    IF lama.id IS NOT NULL
       AND lama.aktif
       AND 'admin_it' = ANY(lama.peran)
       AND NOT (aktif_baru AND 'admin_it' = ANY(COALESCE(p_peran, '{}')))
       AND NOT EXISTS (
           SELECT 1 FROM staf
            WHERE aktif AND 'admin_it' = ANY(peran) AND id <> lama.id
       )
    THEN
        RAISE EXCEPTION
            'ini admin IT aktif terakhir — angkat admin IT lain dulu sebelum mencabut peran atau menonaktifkan akun ini'
            USING HINT = 'ADMIN_TERAKHIR';
    END IF;

    INSERT INTO staf (email, nama, peran, aktif)
    VALUES (email_l, p_nama, p_peran, COALESCE(p_aktif, TRUE))
    ON CONFLICT (email) DO UPDATE
       SET nama = EXCLUDED.nama, peran = EXCLUDED.peran,
           aktif = COALESCE(p_aktif, staf.aktif), diubah = now()
    RETURNING id INTO sid;

    PERFORM catat_audit(p_aktor, NULL, 'simpan_staf', 'staf:' || email_l,
        jsonb_build_object(
            'sebelum', CASE WHEN lama.id IS NULL THEN NULL
                            ELSE jsonb_build_object('peran', lama.peran, 'aktif', lama.aktif) END,
            'sesudah', jsonb_build_object('peran', p_peran, 'aktif', aktif_baru)));
    RETURN sid;
END $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION staf_simpan(TEXT, TEXT, peran[], BOOLEAN, TEXT) IS
  'Simpan/ubah akun staf. Menolak mencabut peran admin_it terakhir yang masih aktif (013).';
