-- =====================================================================
-- 015 — Nonaktifkan staf tanpa mengirim ulang seluruh barisnya
--
-- Kelanjutan dari 014, pola yang sama tapi taruhannya lebih tinggi.
--
-- Menonaktifkan staf lewat halaman admin mengirim seluruh isi barisnya —
-- email, nama, daftar peran — ke POST /api/admin/staf. Validator route itu
-- (bukan staf_simpan; SQL-nya hanya menjaga admin IT terakhir) menolak nama
-- di bawah 2 huruf, email yang tidak lolos regex, dan peran di luar daftar
-- yang dikenal aplikasi.
--
-- Baris lama belum tentu memenuhinya. Yang paling mungkin: peran baru
-- ditambahkan ke enum SQL tapi belum masuk daftar di kode, sehingga baris
-- yang memakainya ditolak validator. Akibatnya akses orang itu TIDAK BISA
-- DICABUT lewat layar — persis pada saat pencabutan biasanya mendesak
-- (orang keluar, akun disalahgunakan, laptop hilang).
--
-- Fungsi ini hanya menyentuh kolom `aktif`. Penjaga admin IT terakhir dari
-- migrasi 013 tetap berlaku dan sengaja diulang di sini: kalau tidak,
-- jalur ini menjadi jalan memutar untuk larangan itu.
-- =====================================================================
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION staf_status(p_email TEXT, p_aktif BOOLEAN, p_aktor TEXT)
RETURNS BIGINT AS $$
DECLARE lama staf; email_l TEXT := lower(trim(p_email));
BEGIN
    IF p_aktif IS NULL THEN
        RAISE EXCEPTION 'aktif wajib diisi' USING HINT = 'NILAI_TIDAK_VALID';
    END IF;
    SELECT * INTO lama FROM staf WHERE email = email_l FOR UPDATE;
    IF lama.id IS NULL THEN
        RAISE EXCEPTION 'staf tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN';
    END IF;

    -- Sama seperti 013: jangan biarkan admin IT aktif terakhir hilang.
    IF NOT p_aktif AND lama.aktif AND 'admin_it' = ANY(lama.peran)
       AND NOT EXISTS (
           SELECT 1 FROM staf WHERE aktif AND 'admin_it' = ANY(peran) AND id <> lama.id
       )
    THEN
        RAISE EXCEPTION
            'ini admin IT aktif terakhir — angkat admin IT lain dulu sebelum menonaktifkan akun ini'
            USING HINT = 'ADMIN_TERAKHIR';
    END IF;

    UPDATE staf SET aktif = p_aktif, diubah = now() WHERE id = lama.id;
    PERFORM catat_audit(p_aktor, NULL, 'ubah_status_staf', 'staf:' || email_l,
        jsonb_build_object('sebelum', jsonb_build_object('aktif', lama.aktif),
                           'sesudah', jsonb_build_object('aktif', p_aktif)));
    RETURN lama.id;
END $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION staf_status(TEXT, BOOLEAN, TEXT) IS
  'Aktifkan/nonaktifkan akun staf tanpa memvalidasi ulang nama, email, dan peran (015). Penjaga admin IT terakhir tetap berlaku.';
