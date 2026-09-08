-- =====================================================================
-- 021_staf_hapus.sql
-- Menambahkan fungsi staf_hapus untuk menghapus akun staf secara permanen.
-- Menjaga agar tidak dapat menghapus akun sendiri dan tidak dapat
-- menghapus akun admin IT aktif terakhir.
-- =====================================================================
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION staf_hapus(p_email TEXT, p_aktor TEXT)
RETURNS BIGINT AS $$
DECLARE
    lama staf;
    email_l TEXT := lower(trim(p_email));
    aktor_l TEXT := lower(trim(p_aktor));
BEGIN
    IF email_l = '' THEN
        RAISE EXCEPTION 'email staf wajib diisi' USING HINT = 'NILAI_TIDAK_VALID';
    END IF;

    SELECT * INTO lama FROM staf WHERE email = email_l FOR UPDATE;
    IF lama.id IS NULL THEN
        RAISE EXCEPTION 'staf tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN';
    END IF;

    -- Cegah menghapus akun sendiri
    IF aktor_l = email_l THEN
        RAISE EXCEPTION 'tidak dapat menghapus akun Anda sendiri' USING HINT = 'AKUN_SENDIRI';
    END IF;

    -- Cegah admin IT aktif terakhir terhapus
    IF lama.aktif AND 'admin_it' = ANY(lama.peran)
       AND NOT EXISTS (
           SELECT 1 FROM staf WHERE aktif AND 'admin_it' = ANY(peran) AND id <> lama.id
       )
    THEN
        RAISE EXCEPTION
            'ini admin IT aktif terakhir — angkat admin IT lain dulu sebelum menghapus akun ini'
            USING HINT = 'ADMIN_TERAKHIR';
    END IF;

    DELETE FROM staf WHERE id = lama.id;

    PERFORM catat_audit(p_aktor, NULL, 'hapus_staf', 'staf:' || email_l,
        jsonb_build_object('nama', lama.nama, 'peran', lama.peran, 'aktif', lama.aktif));

    RETURN lama.id;
END $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION staf_hapus(TEXT, TEXT) IS
  'Hapus permanen akun staf. Menolak menghapus akun sendiri dan admin IT aktif terakhir (021).';
