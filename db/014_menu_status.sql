-- =====================================================================
-- 014 — Ubah status menu tanpa mengirim ulang seluruh barisnya
--
-- Halaman kantin (Fase 1.4a) punya tombol "Hentikan" dan "Tutup PO" per
-- menu. Cara termudah membuatnya adalah memanggil menu_simpan() dengan
-- seluruh isi baris yang sudah ada — dan itu salah.
--
-- menu_simpan() menegakkan aturan untuk data BARU: nama minimal 2 huruf,
-- harga kelipatan Rp 100. Baris lama tidak pernah melewati aturan itu:
-- tabel `menu` sendiri hanya menuntut harga_rp > 0, dan datanya bisa masuk
-- lewat impor atau migrasi dari sistem sebelumnya. Menekan "Hentikan" pada
-- menu seharga Rp 50 atau bernama satu huruf akan ditolak — dengan pesan
-- tentang kolom yang tidak disentuh siapa pun.
--
-- Itu pola kegagalan yang paling merepotkan di sekolah: aturan baru
-- mengunci data lama, dan yang tidak bisa dikerjakan justru menghentikan
-- penjualan — hal yang biasanya mendesak.
--
-- Fungsi ini hanya menyentuh dua kolom boolean. Tidak memvalidasi ulang
-- apa pun, karena tidak mengubah apa pun yang perlu divalidasi.
-- =====================================================================
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION menu_status(
    p_id BIGINT, p_aktif BOOLEAN, p_po_bisa BOOLEAN, p_aktor TEXT
) RETURNS BIGINT AS $$
DECLARE lama menu;
BEGIN
    SELECT * INTO lama FROM menu WHERE id = p_id FOR UPDATE;
    IF lama.id IS NULL THEN
        RAISE EXCEPTION 'menu tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN';
    END IF;
    IF p_aktif IS NULL AND p_po_bisa IS NULL THEN
        RAISE EXCEPTION 'tidak ada yang diubah' USING HINT = 'NILAI_TIDAK_VALID';
    END IF;

    UPDATE menu
       SET aktif   = COALESCE(p_aktif, aktif),
           po_bisa = COALESCE(p_po_bisa, po_bisa),
           diubah  = now()
     WHERE id = p_id;

    PERFORM catat_audit(p_aktor, NULL, 'ubah_status_menu', 'menu:' || p_id,
        jsonb_build_object(
            'sebelum', jsonb_build_object('aktif', lama.aktif, 'po_bisa', lama.po_bisa),
            'sesudah', jsonb_build_object('aktif', COALESCE(p_aktif, lama.aktif),
                                          'po_bisa', COALESCE(p_po_bisa, lama.po_bisa))));
    RETURN p_id;
END $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION menu_status(BIGINT, BOOLEAN, BOOLEAN, TEXT) IS
  'Hidupkan/matikan penjualan & jalur PO satu menu, tanpa memvalidasi ulang nama & harga (014).';
