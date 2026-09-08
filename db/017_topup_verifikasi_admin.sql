-- =====================================================================
-- 017 — Top-up by verifikasi admin & konfigurasi payment gateway
-- =====================================================================

-- 1. Tambah nilai 'ditolak' pada enum status_topup jika belum ada
DO $$ BEGIN
    ALTER TYPE status_topup ADD VALUE IF NOT EXISTS 'ditolak';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tambah kolom pada tabel topup
ALTER TABLE topup ADD COLUMN IF NOT EXISTS metode TEXT DEFAULT 'gateway';
ALTER TABLE topup ADD COLUMN IF NOT EXISTS bukti_foto TEXT;
ALTER TABLE topup ADD COLUMN IF NOT EXISTS catatan_wali TEXT;
ALTER TABLE topup ADD COLUMN IF NOT EXISTS diputus_oleh TEXT;
ALTER TABLE topup ADD COLUMN IF NOT EXISTS diputus_pada TIMESTAMPTZ;
ALTER TABLE topup ADD COLUMN IF NOT EXISTS alasan_tolak TEXT;

-- 3. Kebijakan baru untuk metode top-up & gateway
INSERT INTO kebijakan (kunci, nilai, keterangan) VALUES
 ('topup_metode',           '"verifikasi_admin"', 'Metode top-up ortu: verifikasi_admin | gateway'),
 ('topup_bank_nama',        '"Bank Central Asia (BCA)"', 'Nama bank tujuan transfer manual'),
 ('topup_bank_rekening',    '"8230918239"', 'Nomor rekening tujuan transfer manual'),
 ('topup_bank_atas_nama',   '"Yayasan Semesta Smart Campus"', 'Nama pemilik rekening bank tujuan'),
 ('topup_bank_petunjuk',    '"Transfer sesuai nominal tagihan. Foto atau unggah bukti transfer. Saldo akan otomatis bertambah setelah diverifikasi admin."', 'Petunjuk transfer untuk orang tua siswa'),
 ('gateway_provider',       '"mayar"', 'Provider payment gateway: mayar | midtrans | simulasi'),
 ('gateway_api_key',        '""', 'API Key payment gateway'),
 ('gateway_webhook_token',  '""', 'Webhook Token / Secret verifikasi payment gateway')
ON CONFLICT (kunci) DO NOTHING;

-- 4. Fungsi membuat permintaan top-up transfer manual
CREATE OR REPLACE FUNCTION topup_buat_transfer(
    p_siswa_id BIGINT,
    p_nominal BIGINT,
    p_bukti_foto TEXT,
    p_catatan TEXT,
    p_oleh TEXT
) RETURNS BIGINT AS $$
DECLARE
    mn BIGINT := kebijakan_int('topup_min_rp');
    mx BIGINT := kebijakan_int('topup_max_rp');
    plafon BIGINT := kebijakan_int('plafon_saldo_rp');
    s BIGINT;
    menunggu BIGINT;
    tid BIGINT;
    inv TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM siswa WHERE id = p_siswa_id AND status IN ('aktif', 'cuti')) THEN
        RAISE EXCEPTION 'siswa tidak aktif' USING HINT = 'SISWA_NONAKTIF';
    END IF;
    IF p_nominal < mn OR p_nominal > mx THEN
        RAISE EXCEPTION 'nominal top-up harus antara Rp % dan Rp %', mn, mx USING HINT = 'NOMINAL_DI_LUAR_BATAS';
    END IF;
    IF p_bukti_foto IS NULL OR length(trim(p_bukti_foto)) < 10 THEN
        RAISE EXCEPTION 'bukti transfer wajib diunggah' USING HINT = 'BUKTI_WAJIB';
    END IF;

    s := saldo_siswa(p_siswa_id);
    SELECT COALESCE(SUM(nominal_rp), 0) INTO menunggu
      FROM topup WHERE siswa_id = p_siswa_id AND status = 'menunggu';
    IF s + menunggu + p_nominal > plafon THEN
        RAISE EXCEPTION 'saldo akan melebihi plafon Rp % (saldo Rp %, top-up berjalan Rp %)',
            plafon, s, menunggu USING HINT = 'MELEBIHI_PLAFON';
    END IF;

    INSERT INTO topup (siswa_id, nominal_rp, status, gateway, metode, bukti_foto, catatan_wali, dibuat)
    VALUES (p_siswa_id, p_nominal, 'menunggu', 'transfer_manual', 'verifikasi_admin', p_bukti_foto, p_catatan, now())
    RETURNING id INTO tid;

    inv := 'TRF-' || tid || '-' || upper(substr(md5(random()::text), 1, 6));
    UPDATE topup SET invoice_id = inv WHERE id = tid;

    PERFORM catat_audit(p_oleh, NULL, 'buat_topup_transfer', 'topup:' || tid,
        jsonb_build_object('nominal_rp', p_nominal, 'metode', 'verifikasi_admin', 'invoice_id', inv));

    RETURN tid;
END $$ LANGUAGE plpgsql;

-- 5. Fungsi persetujuan top-up transfer manual oleh admin/staf
CREATE OR REPLACE FUNCTION topup_verifikasi_setujui(
    p_topup_id BIGINT,
    p_staf_email TEXT
) RETURNS TABLE (topup_id BIGINT, transaksi_id BIGINT, saldo_rp BIGINT) AS $$
DECLARE
    t topup;
    tid BIGINT;
    brand BOOLEAN;
    plafon BIGINT := kebijakan_int('plafon_saldo_rp');
BEGIN
    SELECT * INTO t FROM topup WHERE id = p_topup_id FOR UPDATE;
    IF t.id IS NULL THEN
        RAISE EXCEPTION 'top-up #% tidak ditemukan', p_topup_id USING HINT = 'TIDAK_DITEMUKAN';
    END IF;
    IF t.status <> 'menunggu' THEN
        RAISE EXCEPTION 'top-up #% berstatus %, tidak bisa disetujui', p_topup_id, t.status
            USING HINT = 'STATUS_TIDAK_SESUAI';
    END IF;

    -- Posting pembukuan ke buku besar (ledger)
    SELECT p.transaksi_id, p.baru INTO tid, brand
      FROM posting('topup', akun_kode('GATEWAY'), akun_siswa(t.siswa_id), t.nominal_rp, t.siswa_id,
                   'topup:' || COALESCE(t.invoice_id, t.id::text), NULL, NULL, 'topup',
                   'Top-up transfer diverifikasi oleh ' || p_staf_email, FALSE, FALSE,
                   now(), NULL, t.invoice_id, 'selesai', FALSE, 'staf:' || p_staf_email) p;

    UPDATE topup
       SET status = 'lunas',
           transaksi_id = tid,
           dibayar = now(),
           diputus_oleh = p_staf_email,
           diputus_pada = now()
     WHERE id = t.id;

    IF saldo_siswa(t.siswa_id) > plafon THEN
        PERFORM catat_audit('sistem', NULL, 'plafon_terlampaui', 'siswa:' || t.siswa_id,
            jsonb_build_object('saldo_rp', saldo_siswa(t.siswa_id), 'plafon_rp', plafon, 'topup_id', t.id));
    END IF;

    PERFORM notifikasi_wali(t.siswa_id, 'topup_berhasil', 'Top-up berhasil diverifikasi',
        format('Top-up transfer Rp %s telah diverifikasi oleh admin (%s) dan masuk ke saldo. Saldo sekarang Rp %s.',
               rp_teks(t.nominal_rp), p_staf_email, rp_teks(saldo_siswa(t.siswa_id))));

    PERFORM catat_audit(p_staf_email, NULL, 'verifikasi_topup_setujui', 'topup:' || t.id,
        jsonb_build_object('siswa_id', t.siswa_id, 'nominal_rp', t.nominal_rp, 'transaksi_id', tid));

    RETURN QUERY SELECT t.id, tid, saldo_siswa(t.siswa_id);
END $$ LANGUAGE plpgsql;

-- 6. Fungsi penolakan top-up transfer manual
CREATE OR REPLACE FUNCTION topup_verifikasi_tolak(
    p_topup_id BIGINT,
    p_alasan TEXT,
    p_staf_email TEXT
) RETURNS VOID AS $$
DECLARE
    t topup;
BEGIN
    SELECT * INTO t FROM topup WHERE id = p_topup_id FOR UPDATE;
    IF t.id IS NULL THEN
        RAISE EXCEPTION 'top-up #% tidak ditemukan', p_topup_id USING HINT = 'TIDAK_DITEMUKAN';
    END IF;
    IF t.status <> 'menunggu' THEN
        RAISE EXCEPTION 'top-up #% berstatus %, tidak bisa ditolak', p_topup_id, t.status
            USING HINT = 'STATUS_TIDAK_SESUAI';
    END IF;

    UPDATE topup
       SET status = 'ditolak',
           alasan_tolak = p_alasan,
           diputus_oleh = p_staf_email,
           diputus_pada = now()
     WHERE id = t.id;

    PERFORM notifikasi_wali(t.siswa_id, 'topup_gagal', 'Top-up transfer ditolak',
        format('Permintaan top-up transfer Rp %s ditolak. Alasan: %s',
               rp_teks(t.nominal_rp), COALESCE(p_alasan, 'Bukti transfer tidak sesuai')));

    PERFORM catat_audit(p_staf_email, NULL, 'verifikasi_topup_tolak', 'topup:' || t.id,
        jsonb_build_object('siswa_id', t.siswa_id, 'alasan', p_alasan));
END $$ LANGUAGE plpgsql;

-- 7. Views untuk antarmuka admin keuangan
CREATE OR REPLACE VIEW v_topup_verifikasi_menunggu AS
SELECT t.id, t.siswa_id, s.nis, s.nama,
       (SELECT pk.kelas FROM penempatan_kelas pk
         WHERE pk.siswa_id = s.id AND pk.tahun_ajaran_id = (SELECT id FROM tahun_ajaran WHERE aktif LIMIT 1)) AS kelas,
       saldo_siswa(s.id) AS saldo_sekarang_rp,
       t.nominal_rp, t.metode, t.bukti_foto, t.catatan_wali,
       t.invoice_id, t.dibuat,
       w.nama AS wali_nama, w.whatsapp AS wali_wa, w.email AS wali_email
  FROM topup t
  JOIN siswa s ON s.id = t.siswa_id
  LEFT JOIN LATERAL (
    SELECT nama, whatsapp, email FROM wali WHERE siswa_id = s.id ORDER BY utama DESC, id ASC LIMIT 1
  ) w ON true
 WHERE t.status = 'menunggu' AND (t.metode = 'verifikasi_admin' OR t.bukti_foto IS NOT NULL)
 ORDER BY t.dibuat ASC;

CREATE OR REPLACE VIEW v_topup_verifikasi_riwayat AS
SELECT t.id, t.siswa_id, s.nis, s.nama,
       (SELECT pk.kelas FROM penempatan_kelas pk
         WHERE pk.siswa_id = s.id AND pk.tahun_ajaran_id = (SELECT id FROM tahun_ajaran WHERE aktif LIMIT 1)) AS kelas,
       t.nominal_rp, t.status, t.metode, t.bukti_foto, t.catatan_wali,
       t.invoice_id, t.dibuat, t.diputus_pada, t.diputus_oleh, t.alasan_tolak,
       t.transaksi_id,
       w.nama AS wali_nama
  FROM topup t
  JOIN siswa s ON s.id = t.siswa_id
  LEFT JOIN LATERAL (
    SELECT nama FROM wali WHERE siswa_id = s.id ORDER BY utama DESC, id ASC LIMIT 1
  ) w ON true
 WHERE t.status IN ('lunas', 'ditolak') AND (t.metode = 'verifikasi_admin' OR t.bukti_foto IS NOT NULL)
 ORDER BY t.diputus_pada DESC NULLS LAST, t.dibuat DESC
 LIMIT 100;
