-- =====================================================================
-- 020_staf_berwenang_resilient.sql
-- Memastikan pembersihan email pada staf_berwenang_tunai dan topup_tunai
-- agar tetap mengenali email staf meskipun ada spasi atau tag tambahan.
-- =====================================================================

CREATE OR REPLACE FUNCTION staf_berwenang_tunai(p_email TEXT) RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM staf
         WHERE email = lower(trim(split_part(p_email, ' ', 1))) AND aktif
           AND peran && ARRAY['keuangan', 'tu']::peran[]
    );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION topup_tunai_minta(
    p_siswa_id BIGINT, p_nominal BIGINT, p_catatan TEXT, p_oleh TEXT
) RETURNS BIGINT AS $$
DECLARE
    pid       BIGINT;
    mx        BIGINT := kebijakan_int('topup_max_rp');
    mn        BIGINT := kebijakan_int('topup_min_rp');
    plafon    BIGINT := kebijakan_int('plafon_saldo_rp');
    menunggu  BIGINT;
    v_oleh    TEXT := lower(trim(split_part(p_oleh, ' ', 1)));
BEGIN
    IF NOT EXISTS (SELECT 1 FROM siswa WHERE id = p_siswa_id AND status IN ('aktif', 'cuti')) THEN
        RAISE EXCEPTION 'siswa tidak aktif' USING HINT = 'SISWA_TIDAK_AKTIF';
    END IF;
    IF NOT staf_berwenang_tunai(v_oleh) THEN
        RAISE EXCEPTION 'peminta harus staf aktif berperan keuangan atau tu' USING HINT = 'PERAN_TIDAK_CUKUP';
    END IF;
    IF p_nominal < mn OR p_nominal > mx THEN
        RAISE EXCEPTION 'nominal top-up tunai antara Rp % dan Rp %', mn, mx USING HINT = 'NOMINAL_DI_LUAR_BATAS';
    END IF;

    SELECT COALESCE(SUM(nominal_rp), 0) INTO menunggu
      FROM topup_tunai_permintaan
     WHERE siswa_id = p_siswa_id AND status = 'menunggu' AND kedaluwarsa > now();

    IF saldo_siswa(p_siswa_id) + menunggu + p_nominal > plafon THEN
        RAISE EXCEPTION 'saldo akan melebihi plafon Rp % (termasuk % permintaan yang menunggu)', plafon, menunggu
            USING HINT = 'MELEBIHI_PLAFON';
    END IF;

    INSERT INTO topup_tunai_permintaan (siswa_id, nominal_rp, catatan, diminta_oleh, kedaluwarsa)
    VALUES (p_siswa_id, p_nominal, NULLIF(trim(p_catatan), ''), v_oleh,
            now() + make_interval(mins => kebijakan_int('topup_tunai_kedaluwarsa_menit')::int))
    RETURNING id INTO pid;

    PERFORM catat_audit(v_oleh, NULL, 'minta_topup_tunai', 'siswa:' || p_siswa_id,
        jsonb_build_object('permintaan_id', pid, 'nominal_rp', p_nominal, 'catatan', p_catatan));
    RETURN pid;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION topup_tunai_putus(
    p_permintaan_id BIGINT, p_setuju BOOLEAN, p_oleh TEXT, p_alasan TEXT DEFAULT NULL
) RETURNS TABLE (permintaan_id BIGINT, status TEXT, transaksi_id BIGINT, saldo_rp BIGINT) AS $$
DECLARE
    r    topup_tunai_permintaan;
    oleh TEXT := lower(trim(split_part(p_oleh, ' ', 1)));
    h    RECORD;
BEGIN
    SELECT * INTO r FROM topup_tunai_permintaan WHERE id = p_permintaan_id FOR UPDATE;
    IF r.id IS NULL THEN
        RAISE EXCEPTION 'permintaan tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN';
    END IF;
    IF r.status <> 'menunggu' THEN
        RAISE EXCEPTION 'permintaan sudah %', r.status USING HINT = 'STATUS_TIDAK_SESUAI';
    END IF;

    IF r.kedaluwarsa <= now() THEN
        UPDATE topup_tunai_permintaan
           SET status = 'kedaluwarsa', diputus_pada = now()
         WHERE id = r.id;
        PERFORM catat_audit(oleh, NULL, 'topup_tunai_kedaluwarsa', 'siswa:' || r.siswa_id,
            jsonb_build_object('permintaan_id', r.id, 'nominal_rp', r.nominal_rp));
        RETURN QUERY SELECT r.id, 'kedaluwarsa'::TEXT, NULL::BIGINT, saldo_siswa(r.siswa_id);
        RETURN;
    END IF;

    IF NOT staf_berwenang_tunai(oleh) THEN
        RAISE EXCEPTION 'pemutus harus staf aktif berperan keuangan atau tu' USING HINT = 'PERAN_TIDAK_CUKUP';
    END IF;

    -- Inti dari seluruh migrasi ini: yang memutuskan tidak boleh yang meminta.
    IF oleh = lower(trim(split_part(r.diminta_oleh, ' ', 1))) THEN
        RAISE EXCEPTION 'top-up tunai butuh dua orang — permintaanmu sendiri harus disetujui staf lain'
            USING HINT = 'DUA_TANDA_TANGAN';
    END IF;

    IF NOT p_setuju THEN
        UPDATE topup_tunai_permintaan
           SET status = 'ditolak', diputus_oleh = oleh, diputus_pada = now(), alasan = NULLIF(trim(p_alasan), '')
         WHERE id = r.id;
        PERFORM catat_audit(oleh, NULL, 'tolak_topup_tunai', 'siswa:' || r.siswa_id,
            jsonb_build_object('permintaan_id', r.id, 'nominal_rp', r.nominal_rp,
                               'diminta_oleh', r.diminta_oleh, 'alasan', p_alasan));
        RETURN QUERY SELECT r.id, 'ditolak'::TEXT, NULL::BIGINT, saldo_siswa(r.siswa_id);
        RETURN;
    END IF;

    SELECT * INTO h FROM topup_tunai(r.siswa_id, r.nominal_rp, r.diminta_oleh, oleh, r.catatan);

    UPDATE topup_tunai_permintaan
       SET status = 'disetujui', diputus_oleh = oleh, diputus_pada = now(),
           topup_id = h.topup_id, transaksi_id = h.transaksi_id
     WHERE id = r.id;

    RETURN QUERY SELECT r.id, 'disetujui'::TEXT, h.transaksi_id, h.saldo_rp;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION topup_tunai_batal(p_permintaan_id BIGINT, p_oleh TEXT)
RETURNS BIGINT AS $$
DECLARE
    r    topup_tunai_permintaan;
    oleh TEXT := lower(trim(split_part(p_oleh, ' ', 1)));
BEGIN
    SELECT * INTO r FROM topup_tunai_permintaan WHERE id = p_permintaan_id FOR UPDATE;
    IF r.id IS NULL THEN
        RAISE EXCEPTION 'permintaan tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN';
    END IF;
    IF r.status <> 'menunggu' THEN
        RAISE EXCEPTION 'permintaan sudah %', r.status USING HINT = 'STATUS_TIDAK_SESUAI';
    END IF;
    IF oleh <> lower(trim(split_part(r.diminta_oleh, ' ', 1))) THEN
        RAISE EXCEPTION 'hanya peminta yang bisa membatalkan permintaannya' USING HINT = 'BUKAN_PEMINTA';
    END IF;

    UPDATE topup_tunai_permintaan
       SET status = 'dibatalkan', diputus_oleh = oleh, diputus_pada = now()
     WHERE id = r.id;
    PERFORM catat_audit(oleh, NULL, 'batal_topup_tunai', 'siswa:' || r.siswa_id,
        jsonb_build_object('permintaan_id', r.id, 'nominal_rp', r.nominal_rp));
    RETURN r.id;
END $$ LANGUAGE plpgsql;
