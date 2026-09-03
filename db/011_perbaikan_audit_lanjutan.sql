-- =====================================================================
-- 011 — Lanjutan perbaikan audit: kontrol dua orang pada top-up tunai
--
-- Rujukan: claude/smart-campus/audit-keamanan-2026-09-03.md §2.5
--
-- Migrasi 010 tidak boleh disunting lagi (sudah dijalankan) — perubahan
-- berikutnya selalu jadi berkas bernomor baru.
-- =====================================================================
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- §2.5 — "dua tanda tangan" top-up tunai hanyalah teks yang diketik
--
-- p_disetujui_oleh datang dari body permintaan. Database hanya memastikan
-- emailnya berbeda dari penginput dan merupakan staf aktif — peran apa pun
-- (laundry, wali kelas), tanpa sesi, tanpa persetujuan orang kedua.
-- Satu petugas TU bisa mengisi saldo siapa pun berulang kali sambil
-- mencantumkan nama rekan yang tidak pernah tahu. PRD F-23 mensyaratkan
-- kontrol dua orang.
--
-- Yang bisa ditegakkan di lapisan database: penyetuju harus benar-benar
-- berperan keuangan/tu, dan peran yang dicatat di audit adalah peran
-- SUNGGUHAN penginput, bukan 'tu' yang selama ini di-hardcode.
--
-- Yang TIDAK bisa ditegakkan di sini dan masih harus dikerjakan:
-- persetujuan dari sesi penyetuju sendiri (token sekali pakai). Sampai itu
-- ada, notifikasi ke penyetuju adalah pengaman kompensasinya — dikerjakan
-- di lapisan API.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION topup_tunai(p_siswa_id BIGINT, p_nominal BIGINT, p_input_oleh TEXT, p_disetujui_oleh TEXT, p_catatan TEXT DEFAULT NULL)
RETURNS TABLE (topup_id BIGINT, transaksi_id BIGINT, saldo_rp BIGINT) AS $$
DECLARE tid BIGINT; tpid BIGINT; mx BIGINT := kebijakan_int('topup_max_rp'); plafon BIGINT := kebijakan_int('plafon_saldo_rp');
        peran_input peran[];
BEGIN
    IF lower(p_input_oleh) = lower(p_disetujui_oleh) THEN
        RAISE EXCEPTION 'top-up tunai butuh dua staf berbeda (yang input ≠ yang menyetujui)' USING HINT = 'DUA_TANDA_TANGAN';
    END IF;
    -- Dua pemeriksaan terpisah supaya pesannya berguna bagi petugas TU:
    -- "orangnya tidak dikenal" beda masalah dengan "orangnya tidak berwenang".
    IF NOT EXISTS (SELECT 1 FROM staf WHERE email = lower(p_input_oleh) AND aktif)
       OR NOT EXISTS (SELECT 1 FROM staf WHERE email = lower(p_disetujui_oleh) AND aktif) THEN
        RAISE EXCEPTION 'kedua penanda tangan harus staf aktif' USING HINT = 'STAF_TIDAK_DIKENAL';
    END IF;
    peran_input := peran_staf(p_input_oleh);
    IF NOT (peran_input && ARRAY['keuangan','tu']::peran[]) THEN
        RAISE EXCEPTION 'yang menginput top-up tunai harus berperan keuangan/tu' USING HINT = 'PERAN_TIDAK_CUKUP';
    END IF;
    -- §2.5: penyetuju juga harus punya wewenang uang. Sebelumnya staf mana
    -- pun bisa dicantumkan sebagai penyetuju.
    IF NOT (peran_staf(p_disetujui_oleh) && ARRAY['keuangan','tu']::peran[]) THEN
        RAISE EXCEPTION 'penyetuju top-up tunai harus berperan keuangan/tu' USING HINT = 'PERAN_TIDAK_CUKUP';
    END IF;
    IF p_nominal <= 0 OR p_nominal > mx THEN
        RAISE EXCEPTION 'nominal top-up tunai maksimal Rp %', mx USING HINT = 'NOMINAL_DI_LUAR_BATAS';
    END IF;
    IF saldo_siswa(p_siswa_id) + p_nominal > plafon THEN
        RAISE EXCEPTION 'saldo akan melebihi plafon Rp %', plafon USING HINT = 'MELEBIHI_PLAFON';
    END IF;
    INSERT INTO topup (siswa_id, nominal_rp, gateway, status, dibayar)
    VALUES (p_siswa_id, p_nominal, 'tunai', 'lunas', now()) RETURNING id INTO tpid;
    SELECT p.transaksi_id INTO tid
      FROM posting('topup', akun_kode('KAS_TU'), akun_siswa(p_siswa_id), p_nominal, p_siswa_id,
                   'tunai:' || tpid, NULL, NULL, 'topup', COALESCE('Top-up tunai TU — ' || p_catatan, 'Top-up tunai TU'),
                   FALSE, FALSE, now(), NULL, 'TUNAI:' || tpid, 'selesai', FALSE, lower(p_input_oleh)) p;
    UPDATE topup SET transaksi_id = tid, invoice_id = 'TUNAI:' || tpid WHERE id = tpid;
    -- Peran sungguhan, bukan 'tu' yang dulu ditulis mati.
    PERFORM catat_audit(lower(p_input_oleh), array_to_string(peran_input, ','), 'topup_tunai', 'siswa:' || p_siswa_id,
        jsonb_build_object('nominal_rp', p_nominal, 'disetujui_oleh', lower(p_disetujui_oleh), 'transaksi_id', tid, 'catatan', p_catatan));
    PERFORM notifikasi_wali(p_siswa_id, 'topup_berhasil', 'Top-up tunai diterima',
        format('Top-up tunai Rp %s dicatat oleh TU. Saldo sekarang Rp %s.', rp_teks(p_nominal), rp_teks(saldo_siswa(p_siswa_id))));
    RETURN QUERY SELECT tpid, tid, saldo_siswa(p_siswa_id);
END $$ LANGUAGE plpgsql;
