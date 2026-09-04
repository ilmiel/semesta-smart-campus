-- =====================================================================
-- 016 — Dua tanda tangan top-up tunai yang sungguhan (§2.5, F-23)
--
-- Sebelum ini `topup_tunai()` menerima `disetujui_oleh` sebagai teks dari
-- badan permintaan. Yang diperiksa hanya: emailnya berbeda dari penginput,
-- dan keduanya staf aktif berwenang (migrasi 011). Orang kedua itu tidak
-- pernah tahu namanya dipakai.
--
-- Artinya satu petugas TU bisa mengisi saldo siapa pun, berulang kali,
-- sambil mencantumkan nama rekan sebelahnya. Jejak auditnya rapi dan
-- meyakinkan, dan justru itu bagian terburuknya: kontrol yang terlihat ada
-- lebih berbahaya daripada kontrol yang jelas tidak ada, karena tidak ada
-- yang merasa perlu mencari kontrol lain.
--
-- Sekarang alurnya dipecah dua langkah, dan langkah kedua HANYA bisa
-- dilakukan dari sesi orang kedua:
--
--   1. Petugas A membuat PERMINTAAN. Tidak ada uang yang bergerak.
--   2. Petugas B membuka daftar permintaan di layarnya sendiri dan menekan
--      Setujui. Identitas B diambil dari sesinya, tidak pernah dari isian.
--
-- Permintaan kedaluwarsa setelah beberapa menit (kebijakan
-- `topup_tunai_kedaluwarsa_menit`). Persetujuan yang bisa dieksekusi besok
-- pagi bukan lagi kontrol dua orang — itu cek kosong yang sudah
-- ditandatangani.
--
-- Fungsi `topup_tunai()` lama TIDAK dihapus: ia tetap eksekutornya, dipanggil
-- dari `topup_tunai_putus()`. Yang hilang adalah jalur API yang membiarkan
-- siapa pun mengetikkan nama penyetuju.
-- =====================================================================
\set ON_ERROR_STOP on

INSERT INTO kebijakan (kunci, nilai, keterangan) VALUES
 ('topup_tunai_kedaluwarsa_menit', '30',
  'Umur permintaan top-up tunai sebelum hangus. Persetujuan yang bisa dipakai besok bukan kontrol dua orang (F-23).')
ON CONFLICT (kunci) DO NOTHING;

DO $$ BEGIN
    CREATE TYPE status_permintaan AS ENUM ('menunggu', 'disetujui', 'ditolak', 'kedaluwarsa', 'dibatalkan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS topup_tunai_permintaan (
    id            BIGSERIAL PRIMARY KEY,
    siswa_id      BIGINT NOT NULL REFERENCES siswa(id),
    nominal_rp    BIGINT NOT NULL CHECK (nominal_rp > 0),
    catatan       TEXT,
    diminta_oleh  TEXT NOT NULL,
    dibuat        TIMESTAMPTZ NOT NULL DEFAULT now(),
    kedaluwarsa   TIMESTAMPTZ NOT NULL,
    status        status_permintaan NOT NULL DEFAULT 'menunggu',
    diputus_oleh  TEXT,
    diputus_pada  TIMESTAMPTZ,
    alasan        TEXT,
    topup_id      BIGINT,
    transaksi_id  BIGINT
);
CREATE INDEX IF NOT EXISTS topup_tunai_permintaan_menunggu
    ON topup_tunai_permintaan (status, kedaluwarsa) WHERE status = 'menunggu';

COMMENT ON TABLE topup_tunai_permintaan IS
  'Permintaan top-up tunai menunggu persetujuan staf kedua (§2.5, F-23). Uang belum bergerak sampai disetujui.';

-- ---------------------------------------------------------------------
-- Penjaga peran yang sama dengan 011, dipakai kedua langkah.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION staf_berwenang_tunai(p_email TEXT) RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM staf
         WHERE email = lower(trim(p_email)) AND aktif
           AND peran && ARRAY['keuangan', 'tu']::peran[]
    );
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- Langkah 1 — buat permintaan. Tidak ada uang yang bergerak di sini.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION topup_tunai_minta(
    p_siswa_id BIGINT, p_nominal BIGINT, p_catatan TEXT, p_oleh TEXT
) RETURNS BIGINT AS $$
DECLARE
    pid       BIGINT;
    mx        BIGINT := kebijakan_int('topup_max_rp');
    mn        BIGINT := kebijakan_int('topup_min_rp');
    plafon    BIGINT := kebijakan_int('plafon_saldo_rp');
    menunggu  BIGINT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM siswa WHERE id = p_siswa_id AND status IN ('aktif', 'cuti')) THEN
        RAISE EXCEPTION 'siswa tidak aktif' USING HINT = 'SISWA_TIDAK_AKTIF';
    END IF;
    IF NOT staf_berwenang_tunai(p_oleh) THEN
        RAISE EXCEPTION 'peminta harus staf aktif berperan keuangan atau tu' USING HINT = 'PERAN_TIDAK_CUKUP';
    END IF;
    IF p_nominal < mn OR p_nominal > mx THEN
        RAISE EXCEPTION 'nominal top-up tunai antara Rp % dan Rp %', mn, mx USING HINT = 'NOMINAL_DI_LUAR_BATAS';
    END IF;

    -- Plafon dihitung dengan memasukkan permintaan yang masih menunggu.
    -- Pelajaran §2.3: plafon yang hanya melihat saldo saat ini bisa ditembus
    -- dengan membuat beberapa permintaan sekaligus lalu menyetujui semuanya.
    SELECT COALESCE(SUM(nominal_rp), 0) INTO menunggu
      FROM topup_tunai_permintaan
     WHERE siswa_id = p_siswa_id AND status = 'menunggu' AND kedaluwarsa > now();

    IF saldo_siswa(p_siswa_id) + menunggu + p_nominal > plafon THEN
        RAISE EXCEPTION 'saldo akan melebihi plafon Rp % (termasuk % permintaan yang menunggu)', plafon, menunggu
            USING HINT = 'MELEBIHI_PLAFON';
    END IF;

    INSERT INTO topup_tunai_permintaan (siswa_id, nominal_rp, catatan, diminta_oleh, kedaluwarsa)
    VALUES (p_siswa_id, p_nominal, NULLIF(trim(p_catatan), ''), lower(trim(p_oleh)),
            now() + make_interval(mins => kebijakan_int('topup_tunai_kedaluwarsa_menit')::int))
    RETURNING id INTO pid;

    PERFORM catat_audit(lower(trim(p_oleh)), NULL, 'minta_topup_tunai', 'siswa:' || p_siswa_id,
        jsonb_build_object('permintaan_id', pid, 'nominal_rp', p_nominal, 'catatan', p_catatan));
    RETURN pid;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Langkah 2 — putuskan. `p_oleh` WAJIB berasal dari sesi pemutus.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION topup_tunai_putus(
    p_permintaan_id BIGINT, p_setuju BOOLEAN, p_oleh TEXT, p_alasan TEXT DEFAULT NULL
) RETURNS TABLE (permintaan_id BIGINT, status TEXT, transaksi_id BIGINT, saldo_rp BIGINT) AS $$
DECLARE
    r    topup_tunai_permintaan;
    oleh TEXT := lower(trim(p_oleh));
    h    RECORD;
BEGIN
    SELECT * INTO r FROM topup_tunai_permintaan WHERE id = p_permintaan_id FOR UPDATE;
    IF r.id IS NULL THEN
        RAISE EXCEPTION 'permintaan tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN';
    END IF;
    IF r.status <> 'menunggu' THEN
        RAISE EXCEPTION 'permintaan sudah %', r.status USING HINT = 'STATUS_TIDAK_SESUAI';
    END IF;

    -- Kedaluwarsa MENGEMBALIKAN status, bukan melempar exception.
    --
    -- Kalau melempar, seluruh transaksi dibatalkan — termasuk UPDATE yang
    -- menandai barisnya kedaluwarsa. Barisnya akan tetap berstatus
    -- 'menunggu' selamanya dan muncul lagi di layar berikutnya. Pelajaran
    -- yang sama seperti pin_catat() di migrasi 010: kejadian yang perlu
    -- dicatat tidak boleh dilaporkan lewat exception.
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
    IF oleh = r.diminta_oleh THEN
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

    -- Eksekusi memakai fungsi lama; kedua email kini benar-benar berasal dari
    -- dua sesi yang berbeda.
    SELECT * INTO h FROM topup_tunai(r.siswa_id, r.nominal_rp, r.diminta_oleh, oleh, r.catatan);

    UPDATE topup_tunai_permintaan
       SET status = 'disetujui', diputus_oleh = oleh, diputus_pada = now(),
           topup_id = h.topup_id, transaksi_id = h.transaksi_id
     WHERE id = r.id;

    RETURN QUERY SELECT r.id, 'disetujui'::TEXT, h.transaksi_id, h.saldo_rp;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Peminta membatalkan permintaannya sendiri (salah ketik nominal, dsb.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION topup_tunai_batal(p_permintaan_id BIGINT, p_oleh TEXT)
RETURNS BIGINT AS $$
DECLARE r topup_tunai_permintaan; oleh TEXT := lower(trim(p_oleh));
BEGIN
    SELECT * INTO r FROM topup_tunai_permintaan WHERE id = p_permintaan_id FOR UPDATE;
    IF r.id IS NULL THEN
        RAISE EXCEPTION 'permintaan tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN';
    END IF;
    IF r.status <> 'menunggu' THEN
        RAISE EXCEPTION 'permintaan sudah %', r.status USING HINT = 'STATUS_TIDAK_SESUAI';
    END IF;
    IF oleh <> r.diminta_oleh THEN
        RAISE EXCEPTION 'hanya peminta yang bisa membatalkan permintaannya' USING HINT = 'BUKAN_PEMINTA';
    END IF;

    UPDATE topup_tunai_permintaan
       SET status = 'dibatalkan', diputus_oleh = oleh, diputus_pada = now()
     WHERE id = r.id;
    PERFORM catat_audit(oleh, NULL, 'batal_topup_tunai', 'siswa:' || r.siswa_id,
        jsonb_build_object('permintaan_id', r.id, 'nominal_rp', r.nominal_rp));
    RETURN r.id;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Tandai yang lewat waktu. Dipanggil rekonsiliasi malam; permintaan yang
-- kedaluwarsa juga ditolak saat diputus, jadi ini hanya kerapian daftar.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION topup_tunai_sapu_kedaluwarsa() RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
    UPDATE topup_tunai_permintaan
       SET status = 'kedaluwarsa', diputus_pada = now()
     WHERE status = 'menunggu' AND kedaluwarsa <= now();
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$ LANGUAGE plpgsql;

-- Daftar untuk layar keuangan: hanya yang masih hidup.
CREATE OR REPLACE VIEW v_topup_tunai_menunggu AS
SELECT p.id, p.siswa_id, s.nis, s.nama,
       (SELECT pk.kelas FROM penempatan_kelas pk
         WHERE pk.siswa_id = s.id AND pk.tahun_ajaran_id = (SELECT id FROM tahun_ajaran WHERE aktif LIMIT 1)) AS kelas,
       p.nominal_rp, p.catatan, p.diminta_oleh, p.dibuat, p.kedaluwarsa,
       saldo_siswa(p.siswa_id) AS saldo_sekarang_rp
  FROM topup_tunai_permintaan p JOIN siswa s ON s.id = p.siswa_id
 WHERE p.status = 'menunggu' AND p.kedaluwarsa > now();

-- Riwayat keputusan, untuk laporan keuangan (F-23: tampil terpisah).
CREATE OR REPLACE VIEW v_topup_tunai_riwayat AS
SELECT p.id, p.siswa_id, s.nis, s.nama, p.nominal_rp, p.catatan,
       p.diminta_oleh, p.diputus_oleh, p.status::text AS status,
       p.dibuat, p.diputus_pada, p.alasan, p.transaksi_id
  FROM topup_tunai_permintaan p JOIN siswa s ON s.id = p.siswa_id
 WHERE p.status <> 'menunggu';
