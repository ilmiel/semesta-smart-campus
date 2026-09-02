-- =====================================================================
-- 009 — DASHBOARD & PELENGKAP: view operasional (F-93), KPI beranda,
--       notifikasi saldo rendah (F-25), pembuatan data master via fungsi
--       (audit otomatis), ekspor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Data master lewat fungsi (supaya selalu ter-audit)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION siswa_tambah(p_nis TEXT, p_nama TEXT, p_email TEXT, p_jenjang TEXT, p_boarding BOOLEAN, p_kelas TEXT, p_aktor TEXT)
RETURNS BIGINT AS $$
DECLARE sid BIGINT; ta SMALLINT;
BEGIN
    IF coalesce(trim(p_nis), '') = '' OR coalesce(trim(p_nama), '') = '' THEN
        RAISE EXCEPTION 'NIS dan nama wajib' USING HINT = 'NILAI_TIDAK_VALID';
    END IF;
    INSERT INTO siswa (nis, nama, email, jenjang, boarding)
    VALUES (trim(p_nis), trim(p_nama), lower(nullif(trim(p_email), '')), p_jenjang, COALESCE(p_boarding, TRUE))
    RETURNING id INTO sid;
    IF p_kelas IS NOT NULL THEN
        SELECT id INTO ta FROM tahun_ajaran WHERE aktif;
        IF ta IS NULL THEN RAISE EXCEPTION 'belum ada tahun ajaran aktif' USING HINT = 'TAHUN_AJARAN_KOSONG'; END IF;
        INSERT INTO penempatan_kelas (siswa_id, tahun_ajaran_id, kelas) VALUES (sid, ta, p_kelas);
    END IF;
    PERFORM catat_audit(p_aktor, NULL, 'tambah_siswa', 'siswa:' || sid, jsonb_build_object('nis', p_nis, 'nama', p_nama, 'kelas', p_kelas));
    RETURN sid;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION siswa_ubah(p_siswa_id BIGINT, p_nama TEXT, p_email TEXT, p_jenjang TEXT, p_boarding BOOLEAN, p_kelas TEXT, p_aktor TEXT)
RETURNS VOID AS $$
DECLARE lama siswa; ta SMALLINT;
BEGIN
    SELECT * INTO lama FROM siswa WHERE id = p_siswa_id FOR UPDATE;
    IF lama.id IS NULL THEN RAISE EXCEPTION 'siswa tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    UPDATE siswa SET nama = COALESCE(nullif(trim(p_nama), ''), nama), email = COALESCE(lower(nullif(trim(p_email), '')), email),
                     jenjang = COALESCE(p_jenjang, jenjang), boarding = COALESCE(p_boarding, boarding), diubah = now()
     WHERE id = p_siswa_id;
    IF p_kelas IS NOT NULL THEN
        SELECT id INTO ta FROM tahun_ajaran WHERE aktif;
        INSERT INTO penempatan_kelas (siswa_id, tahun_ajaran_id, kelas) VALUES (p_siswa_id, ta, p_kelas)
        ON CONFLICT (siswa_id, tahun_ajaran_id) DO UPDATE SET kelas = EXCLUDED.kelas;
    END IF;
    PERFORM catat_audit(p_aktor, NULL, 'ubah_siswa', 'siswa:' || p_siswa_id,
        jsonb_build_object('sebelum', jsonb_build_object('nama', lama.nama, 'email', lama.email, 'jenjang', lama.jenjang, 'boarding', lama.boarding),
                           'sesudah', jsonb_build_object('nama', p_nama, 'email', p_email, 'jenjang', p_jenjang, 'boarding', p_boarding, 'kelas', p_kelas)));
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION wali_simpan(p_id BIGINT, p_siswa_id BIGINT, p_nama TEXT, p_hubungan TEXT, p_whatsapp TEXT, p_email TEXT, p_utama BOOLEAN, p_aktor TEXT)
RETURNS BIGINT AS $$
DECLARE wid BIGINT;
BEGIN
    IF p_utama THEN UPDATE wali SET utama = FALSE WHERE siswa_id = p_siswa_id AND id IS DISTINCT FROM p_id; END IF;
    IF p_id IS NULL THEN
        INSERT INTO wali (siswa_id, nama, hubungan, whatsapp, email, utama)
        VALUES (p_siswa_id, p_nama, p_hubungan, p_whatsapp, lower(nullif(trim(p_email), '')), COALESCE(p_utama, FALSE)) RETURNING id INTO wid;
    ELSE
        UPDATE wali SET nama = p_nama, hubungan = p_hubungan, whatsapp = p_whatsapp, email = lower(nullif(trim(p_email), '')), utama = COALESCE(p_utama, utama)
         WHERE id = p_id AND siswa_id = p_siswa_id RETURNING id INTO wid;
        IF wid IS NULL THEN RAISE EXCEPTION 'wali tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    END IF;
    PERFORM catat_audit(p_aktor, NULL, 'simpan_wali', 'siswa:' || p_siswa_id, jsonb_build_object('wali_id', wid, 'email', p_email, 'utama', p_utama));
    RETURN wid;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION staf_simpan(p_email TEXT, p_nama TEXT, p_peran peran[], p_aktif BOOLEAN, p_aktor TEXT)
RETURNS BIGINT AS $$
DECLARE sid BIGINT; lama staf;
BEGIN
    SELECT * INTO lama FROM staf WHERE email = lower(p_email);
    INSERT INTO staf (email, nama, peran, aktif) VALUES (lower(trim(p_email)), p_nama, p_peran, COALESCE(p_aktif, TRUE))
    ON CONFLICT (email) DO UPDATE SET nama = EXCLUDED.nama, peran = EXCLUDED.peran, aktif = COALESCE(p_aktif, staf.aktif), diubah = now()
    RETURNING id INTO sid;
    PERFORM catat_audit(p_aktor, NULL, 'simpan_staf', 'staf:' || lower(p_email),
        jsonb_build_object('sebelum', CASE WHEN lama.id IS NULL THEN NULL ELSE jsonb_build_object('peran', lama.peran, 'aktif', lama.aktif) END,
                           'sesudah', jsonb_build_object('peran', p_peran, 'aktif', p_aktif)));
    RETURN sid;
END $$ LANGUAGE plpgsql;

-- Device: hash kunci dibuat aplikasi (SHA-256 dari kunci acak); fungsi ini hanya menyimpan.
CREATE OR REPLACE FUNCTION device_simpan(p_kode TEXT, p_nama TEXT, p_layanan jenis_layanan, p_lokasi TEXT, p_api_key_hash TEXT, p_limit_offline_rp INTEGER, p_aktor TEXT)
RETURNS BIGINT AS $$
DECLARE did BIGINT; lim INTEGER;
BEGIN
    lim := COALESCE(p_limit_offline_rp, CASE WHEN p_layanan = 'vending' THEN 0 ELSE kebijakan_int('limit_offline_rp')::int END);
    IF lim > kebijakan_int('limit_offline_rp') THEN
        RAISE EXCEPTION 'limit offline device tidak boleh melebihi kebijakan (Rp %)', kebijakan_int('limit_offline_rp') USING HINT = 'MELEBIHI_PLAFON';
    END IF;
    INSERT INTO device (kode, nama, layanan, lokasi, api_key_hash, limit_offline_rp)
    VALUES (upper(trim(p_kode)), p_nama, p_layanan, p_lokasi, p_api_key_hash, lim)
    ON CONFLICT (kode) DO UPDATE SET nama = EXCLUDED.nama, layanan = EXCLUDED.layanan, lokasi = EXCLUDED.lokasi,
        api_key_hash = COALESCE(p_api_key_hash, device.api_key_hash), limit_offline_rp = lim
    RETURNING id INTO did;
    PERFORM catat_audit(p_aktor, NULL, 'simpan_device', 'device:' || upper(p_kode),
        jsonb_build_object('layanan', p_layanan, 'limit_offline_rp', lim, 'kunci_diganti', p_api_key_hash IS NOT NULL));
    RETURN did;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION device_aktifkan(p_kode TEXT, p_aktif BOOLEAN, p_aktor TEXT, p_alasan TEXT DEFAULT NULL) RETURNS VOID AS $$
BEGIN
    UPDATE device SET aktif = p_aktif, dinonaktifkan = CASE WHEN p_aktif THEN NULL ELSE now() END WHERE kode = upper(p_kode);
    IF NOT FOUND THEN RAISE EXCEPTION 'device tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    PERFORM catat_audit(p_aktor, NULL, CASE WHEN p_aktif THEN 'aktifkan_device' ELSE 'nonaktifkan_device' END, 'device:' || upper(p_kode), jsonb_build_object('alasan', p_alasan));
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 2. Notifikasi saldo rendah (F-25) — sekali per hari per siswa
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notifikasi_saldo_rendah() RETURNS INTEGER AS $$
DECLARE r RECORD; n INTEGER := 0; ambang BIGINT := kebijakan_int('saldo_rendah_rp');
BEGIN
    FOR r IN
        SELECT s.id, s.nama, saldo_siswa(s.id) AS saldo
          FROM siswa s WHERE s.status = 'aktif' AND saldo_siswa(s.id) < ambang
           AND EXISTS (SELECT 1 FROM wali w WHERE w.siswa_id = s.id)
           AND NOT EXISTS (SELECT 1 FROM notifikasi x WHERE x.siswa_id = s.id AND x.jenis = 'saldo_rendah' AND x.dibuat > now() - interval '1 day')
    LOOP
        IF notifikasi_wali(r.id, 'saldo_rendah', 'Saldo hampir habis',
            format('Saldo %s tinggal Rp %s. Top-up lewat portal supaya tidak kehabisan di kantin.', r.nama, rp_teks(r.saldo))) > 0 THEN
            n := n + 1;
        END IF;
    END LOOP;
    RETURN n;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 3. View operasional (F-93) & keuangan (F-92)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_device_status AS
SELECT d.id, d.kode, d.nama, d.layanan, d.lokasi, d.aktif, d.limit_offline_rp, d.terakhir_online, d.terakhir_sinkron, d.versi_terminal,
       CASE WHEN NOT d.aktif THEN 'nonaktif'
            WHEN d.terakhir_online > now() - interval '2 minutes' THEN 'online'
            WHEN d.terakhir_online > now() - interval '30 minutes' THEN 'terputus'
            ELSE 'offline' END AS status,
       (SELECT COUNT(*) FROM antrian_offline a WHERE a.device_id = d.id AND a.status = 'menunggu') AS antrian_tertunda,
       (SELECT COUNT(*) FROM antrian_offline a WHERE a.device_id = d.id AND a.status = 'ditolak' AND a.diterima > now() - interval '7 days') AS ditolak_7hari,
       (SELECT COUNT(*) FROM transaksi t WHERE t.device_id = d.id AND tgl_sekolah(t.waktu_terminal) = hari_ini() AND t.jenis = 'belanja') AS transaksi_hari_ini
  FROM device d;

CREATE OR REPLACE VIEW v_antrian_ditolak AS
SELECT a.id, d.kode AS device, a.idempotency_key, a.kartu_uid, k.siswa_id, s.nama, a.nominal_rp, a.waktu_terminal, a.diterima, a.alasan_tolak
  FROM antrian_offline a JOIN device d ON d.id = a.device_id
  LEFT JOIN kartu k ON k.uid = a.kartu_uid LEFT JOIN siswa s ON s.id = k.siswa_id
 WHERE a.status = 'ditolak';

CREATE OR REPLACE VIEW v_pin_terkunci AS
SELECT p.siswa_id, s.nis, s.nama, p.terkunci_hingga, p.jumlah_kunci,
       p.terkunci_hingga = 'infinity' AS permanen
  FROM pin_siswa p JOIN siswa s ON s.id = p.siswa_id WHERE p.terkunci_hingga > now();

CREATE OR REPLACE VIEW v_kartu_dicabut_hari_ini AS
SELECT k.id, k.uid, k.status, k.dicabut, k.alasan, s.id AS siswa_id, s.nis, s.nama,
       EXISTS (SELECT 1 FROM kartu x WHERE x.siswa_id = s.id AND x.status = 'aktif') AS sudah_ada_pengganti
  FROM kartu k JOIN siswa s ON s.id = k.siswa_id
 WHERE k.status <> 'aktif' AND tgl_sekolah(k.dicabut) = hari_ini();

-- Daftar siswa untuk dashboard (status kartu, saldo, kelas)
CREATE OR REPLACE VIEW v_siswa AS
SELECT s.id, s.nis, s.nama, s.email, s.jenjang, s.boarding, s.status,
       (SELECT pk.kelas FROM penempatan_kelas pk WHERE pk.siswa_id = s.id AND pk.tahun_ajaran_id = (SELECT id FROM tahun_ajaran WHERE aktif LIMIT 1)) AS kelas,
       COALESCE((SELECT k.status::text FROM kartu k WHERE k.siswa_id = s.id AND k.status = 'aktif'),
                (SELECT k.status::text FROM kartu k WHERE k.siswa_id = s.id ORDER BY k.dicabut DESC NULLS LAST, k.id DESC LIMIT 1),
                'belum') AS kartu,
       (SELECT k.uid FROM kartu k WHERE k.siswa_id = s.id AND k.status = 'aktif') AS uid,
       saldo_siswa(s.id) AS saldo_rp,
       EXISTS (SELECT 1 FROM pin_siswa p WHERE p.siswa_id = s.id AND p.terkunci_hingga > now()) AS pin_terkunci,
       EXISTS (SELECT 1 FROM pin_siswa p WHERE p.siswa_id = s.id) AS pin_ada,
       limit_harian_efektif(s.id) AS limit_harian_rp,
       (SELECT COUNT(*) FROM tagihan t WHERE t.siswa_id = s.id AND t.status = 'menunggu') AS tagihan_menunggu
  FROM siswa s;

-- KPI beranda (F-90)
CREATE OR REPLACE FUNCTION kpi_beranda()
RETURNS TABLE (transaksi_hari_ini BIGINT, omzet_hari_ini_rp BIGINT, siswa_aktif BIGINT, kartu_aktif BIGINT,
               total_float_rp BIGINT, device_online BIGINT, device_total BIGINT, antrian_tertunda BIGINT,
               ditolak_hari_ini BIGINT, pin_terkunci BIGINT, kartu_dicabut_hari_ini BIGINT, topup_hari_ini_rp BIGINT,
               rekonsiliasi_terakhir TIMESTAMPTZ, selisih_terakhir INTEGER, kesejahteraan BIGINT, tagihan_menunggu BIGINT) AS $$
    SELECT
      (SELECT COUNT(*) FROM transaksi WHERE jenis = 'belanja' AND status = 'selesai' AND tgl_sekolah(waktu_terminal) = hari_ini()),
      (SELECT COALESCE(SUM(total_rp), 0) FROM transaksi WHERE jenis = 'belanja' AND status = 'selesai' AND tgl_sekolah(waktu_terminal) = hari_ini()),
      (SELECT COUNT(*) FROM siswa WHERE status = 'aktif'),
      (SELECT COUNT(*) FROM kartu WHERE status = 'aktif'),
      (SELECT COALESCE(SUM(saldo_rp), 0) FROM saldo_ledger WHERE jenis = 'siswa'),
      (SELECT COUNT(*) FROM v_device_status WHERE status = 'online'),
      (SELECT COUNT(*) FROM device WHERE aktif),
      (SELECT COUNT(*) FROM antrian_offline WHERE status = 'menunggu'),
      (SELECT COUNT(*) FROM antrian_offline WHERE status = 'ditolak' AND tgl_sekolah(diterima) = hari_ini()),
      (SELECT COUNT(*) FROM v_pin_terkunci),
      (SELECT COUNT(*) FROM v_kartu_dicabut_hari_ini),
      (SELECT COALESCE(SUM(nominal_rp), 0) FROM topup WHERE status = 'lunas' AND tgl_sekolah(dibayar) = hari_ini()),
      (SELECT waktu FROM rekonsiliasi_log ORDER BY id DESC LIMIT 1),
      (SELECT jumlah_selisih FROM rekonsiliasi_log ORDER BY id DESC LIMIT 1),
      (SELECT COUNT(*) FROM v_kesejahteraan),
      (SELECT COUNT(*) FROM tagihan WHERE status = 'menunggu');
$$ LANGUAGE sql STABLE;

-- Transaksi per jam hari ini (grafik beranda)
CREATE OR REPLACE VIEW v_transaksi_per_jam AS
SELECT extract(hour FROM (waktu_terminal AT TIME ZONE 'Asia/Jakarta'))::int AS jam, COUNT(*) AS jumlah, SUM(total_rp) AS nilai_rp
  FROM transaksi WHERE jenis = 'belanja' AND status = 'selesai' AND tgl_sekolah(waktu_terminal) = hari_ini()
 GROUP BY 1 ORDER BY 1;

-- Ekspor transaksi (F-92) — dipakai CSV/XLSX
CREATE OR REPLACE VIEW v_ekspor_transaksi AS
SELECT t.id, t.kode, (t.waktu_terminal AT TIME ZONE 'Asia/Jakarta') AS waktu, t.jenis, t.status, t.layanan,
       s.nis, s.nama AS siswa, d.kode AS device, t.total_rp, t.pakai_pin, t.offline, t.tanpa_kartu, t.keterangan, t.oleh,
       t.ref_transaksi_id, t.ref_eksternal,
       (SELECT string_agg(i.qty || '× ' || i.nama, ', ' ORDER BY i.id) FROM transaksi_item i WHERE i.transaksi_id = t.id) AS item
  FROM transaksi t LEFT JOIN siswa s ON s.id = t.siswa_id LEFT JOIN device d ON d.id = t.device_id;

-- Refund/koreksi dengan alasan & petugas (F-92)
CREATE OR REPLACE VIEW v_koreksi AS
SELECT t.id, (t.dibuat AT TIME ZONE 'Asia/Jakarta') AS waktu, t.jenis, t.total_rp, t.keterangan AS alasan, t.oleh AS petugas,
       s.nis, s.nama AS siswa, t.ref_transaksi_id, a.jenis AS jenis_asal, a.total_rp AS total_asal_rp, a.keterangan AS keterangan_asal
  FROM transaksi t JOIN siswa s ON s.id = t.siswa_id LEFT JOIN transaksi a ON a.id = t.ref_transaksi_id
 WHERE t.jenis IN ('refund', 'koreksi', 'penarikan');
