-- =====================================================================
-- 004 — KANTIN: menu, pembayaran per item, pra-pesan (PO), rekap
-- PRD §7.5 (F-40–F-49), §7.10 (F-92, F-94)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MENU (F-41) — harga hanya diubah dari dashboard; kasir tidak bisa.
-- ---------------------------------------------------------------------
CREATE TABLE kategori_menu (
    id      SERIAL PRIMARY KEY,
    nama    TEXT NOT NULL UNIQUE,
    urutan  INTEGER NOT NULL DEFAULT 0
);
INSERT INTO kategori_menu (nama, urutan) VALUES ('Makanan', 1), ('Minuman', 2), ('Camilan', 3);

CREATE TABLE menu (
    id           BIGSERIAL PRIMARY KEY,
    nama         TEXT NOT NULL,
    kategori_id  INTEGER REFERENCES kategori_menu(id),
    harga_rp     BIGINT NOT NULL CHECK (harga_rp > 0),
    aktif        BOOLEAN NOT NULL DEFAULT TRUE,
    po_bisa      BOOLEAN NOT NULL DEFAULT TRUE,       -- boleh dipesan lewat PO
    foto_url     TEXT,
    dibuat       TIMESTAMPTZ NOT NULL DEFAULT now(),
    diubah       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON menu (aktif, kategori_id);

CREATE OR REPLACE FUNCTION menu_simpan(
    p_id BIGINT, p_nama TEXT, p_kategori_id INTEGER, p_harga_rp BIGINT,
    p_aktif BOOLEAN, p_po_bisa BOOLEAN, p_foto_url TEXT, p_aktor TEXT
) RETURNS BIGINT AS $$
DECLARE lama menu; mid BIGINT;
BEGIN
    IF coalesce(trim(p_nama), '') = '' THEN RAISE EXCEPTION 'nama menu wajib' USING HINT = 'NILAI_TIDAK_VALID'; END IF;
    IF p_harga_rp IS NULL OR p_harga_rp <= 0 OR p_harga_rp % 100 <> 0 THEN
        RAISE EXCEPTION 'harga harus kelipatan Rp 100 dan lebih dari 0' USING HINT = 'NILAI_TIDAK_VALID';
    END IF;
    IF p_id IS NULL THEN
        INSERT INTO menu (nama, kategori_id, harga_rp, aktif, po_bisa, foto_url)
        VALUES (trim(p_nama), p_kategori_id, p_harga_rp, COALESCE(p_aktif, TRUE), COALESCE(p_po_bisa, TRUE), p_foto_url)
        RETURNING id INTO mid;
        PERFORM catat_audit(p_aktor, NULL, 'tambah_menu', 'menu:' || mid, jsonb_build_object('nama', p_nama, 'harga_rp', p_harga_rp));
    ELSE
        SELECT * INTO lama FROM menu WHERE id = p_id FOR UPDATE;
        IF lama.id IS NULL THEN RAISE EXCEPTION 'menu tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
        UPDATE menu SET nama = trim(p_nama), kategori_id = p_kategori_id, harga_rp = p_harga_rp,
                        aktif = COALESCE(p_aktif, aktif), po_bisa = COALESCE(p_po_bisa, po_bisa),
                        foto_url = COALESCE(p_foto_url, foto_url), diubah = now()
         WHERE id = p_id;
        mid := p_id;
        PERFORM catat_audit(p_aktor, NULL, 'ubah_menu', 'menu:' || mid,
            jsonb_build_object('sebelum', jsonb_build_object('nama', lama.nama, 'harga_rp', lama.harga_rp, 'aktif', lama.aktif, 'po_bisa', lama.po_bisa),
                               'sesudah', jsonb_build_object('nama', p_nama, 'harga_rp', p_harga_rp, 'aktif', p_aktif, 'po_bisa', p_po_bisa)));
    END IF;
    RETURN mid;
END $$ LANGUAGE plpgsql;

-- Menu aktif untuk terminal / portal (cache terminal untuk mode offline).
CREATE OR REPLACE VIEW v_menu_aktif AS
SELECT m.id, m.nama, m.harga_rp, m.po_bisa, m.foto_url, k.nama AS kategori, k.urutan
  FROM menu m LEFT JOIN kategori_menu k ON k.id = m.kategori_id
 WHERE m.aktif
 ORDER BY k.urutan, m.nama;

-- Ubah [{"menu_id":1,"qty":2}] menjadi item ber-harga dari tabel menu (harga server).
CREATE OR REPLACE FUNCTION kantin_susun_item(p_items JSONB, p_untuk_po BOOLEAN DEFAULT FALSE) RETURNS JSONB AS $$
DECLARE hasil JSONB; n INTEGER; n_valid INTEGER;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'daftar item kosong' USING HINT = 'ITEM_KOSONG';
    END IF;
    n := jsonb_array_length(p_items);
    SELECT COUNT(*), COALESCE(jsonb_agg(jsonb_build_object(
               'ref_id', m.id, 'nama', m.nama, 'harga_rp', m.harga_rp, 'qty', (x->>'qty')::int)), '[]'::jsonb)
      INTO n_valid, hasil
      FROM jsonb_array_elements(p_items) x
      JOIN menu m ON m.id = (x->>'menu_id')::BIGINT AND m.aktif AND (NOT p_untuk_po OR m.po_bisa)
     WHERE COALESCE((x->>'qty')::int, 0) BETWEEN 1 AND 20;
    IF n_valid <> n THEN
        RAISE EXCEPTION 'ada item yang tidak aktif / tidak bisa dipesan / qty tidak valid' USING HINT = 'ITEM_TIDAK_VALID';
    END IF;
    RETURN hasil;
END $$ LANGUAGE plpgsql STABLE;

-- Mode menu di kasir (F-40): terminal kirim menu_id+qty, server yang menghitung harga.
CREATE OR REPLACE FUNCTION bayar_menu(
    p_device_kode TEXT, p_idem TEXT, p_uid TEXT, p_items JSONB,
    p_pin_ok BOOLEAN DEFAULT FALSE, p_waktu_terminal TIMESTAMPTZ DEFAULT now(), p_nis TEXT DEFAULT NULL
) RETURNS TABLE (transaksi_id BIGINT, kode TEXT, baru BOOLEAN, siswa_id BIGINT, nama TEXT, saldo_rp BIGINT, total_rp BIGINT) AS $$
DECLARE items JSONB := kantin_susun_item(p_items, FALSE);
BEGIN
    RETURN QUERY SELECT * FROM bayar(p_device_kode, p_idem, p_uid, NULL, 'Belanja kantin', p_pin_ok, FALSE, p_waktu_terminal, p_nis, items);
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 2. PRA-PESAN / PO (F-48, F-49)
-- ---------------------------------------------------------------------
CREATE TYPE status_po AS ENUM ('dibayar', 'diambil', 'dibatalkan', 'tidak_diambil');

CREATE TABLE po_pesanan (
    id             BIGSERIAL PRIMARY KEY,
    kode           TEXT NOT NULL UNIQUE,            -- 'PO-7K3M9' — ditunjukkan kalau kartu diblokir
    siswa_id       BIGINT NOT NULL REFERENCES siswa(id),
    dipesan_oleh   TEXT NOT NULL,                   -- 'siswa' | 'wali:12'
    tanggal        DATE NOT NULL,                   -- hari pengambilan
    status         status_po NOT NULL DEFAULT 'dibayar',
    total_rp       BIGINT NOT NULL CHECK (total_rp > 0),
    transaksi_id   BIGINT NOT NULL REFERENCES transaksi(id),
    refund_transaksi_id BIGINT REFERENCES transaksi(id),
    catatan        TEXT,
    dibuat         TIMESTAMPTZ NOT NULL DEFAULT now(),
    diambil_pada   TIMESTAMPTZ,
    device_ambil_id BIGINT REFERENCES device(id),
    ditutup_pada   TIMESTAMPTZ
);
CREATE INDEX ON po_pesanan (siswa_id, tanggal DESC);
CREATE INDEX ON po_pesanan (tanggal, status);

CREATE TABLE po_item (
    id        BIGSERIAL PRIMARY KEY,
    po_id     BIGINT NOT NULL REFERENCES po_pesanan(id) ON DELETE CASCADE,
    menu_id   BIGINT REFERENCES menu(id),
    nama      TEXT NOT NULL,
    harga_rp  BIGINT NOT NULL,
    qty       INTEGER NOT NULL CHECK (qty > 0)
);
CREATE INDEX ON po_item (po_id);

-- Kode PO pendek yang mudah dibaca kasir (tanpa 0/O/1/I).
CREATE OR REPLACE FUNCTION po_kode_baru() RETURNS TEXT AS $$
DECLARE huruf TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; k TEXT; i INTEGER;
BEGIN
    LOOP
        k := 'PO-';
        FOR i IN 1..5 LOOP
            k := k || substr(huruf, 1 + floor(random() * length(huruf))::int, 1);
        END LOOP;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM po_pesanan WHERE kode = k);
    END LOOP;
    RETURN k;
END $$ LANGUAGE plpgsql VOLATILE;

-- Apakah PO sedang buka untuk tanggal tertentu? (hari ini, dalam jam buka–tutup)
CREATE OR REPLACE FUNCTION po_jendela(p_tanggal DATE DEFAULT hari_ini())
RETURNS TABLE (buka BOOLEAN, alasan TEXT, jam_buka TIME, jam_tutup TIME, ambil_mulai TIME, ambil_selesai TIME) AS $$
DECLARE jb TIME := kebijakan_jam('po_buka'); jt TIME := kebijakan_jam('po_tutup'); skrg TIME := waktu_sekolah()::time;
BEGIN
    jam_buka := jb; jam_tutup := jt;
    ambil_mulai := kebijakan_jam('po_ambil_mulai'); ambil_selesai := kebijakan_jam('po_ambil_selesai');
    IF NOT kebijakan_bool('po_aktif') THEN
        buka := FALSE; alasan := 'Pra-pesan sedang dinonaktifkan sekolah';
    ELSIF p_tanggal <> hari_ini() THEN
        buka := FALSE; alasan := 'Pra-pesan hanya untuk hari ini';
    ELSIF skrg < jb THEN
        buka := FALSE; alasan := format('PO dibuka pukul %s', to_char(jb, 'HH24.MI'));
    ELSIF skrg > jt THEN
        buka := FALSE; alasan := format('PO sudah ditutup pukul %s', to_char(jt, 'HH24.MI'));
    ELSE
        buka := TRUE; alasan := NULL;
    END IF;
    RETURN NEXT;
END $$ LANGUAGE plpgsql STABLE;

-- Buat PO: dibayar dari saldo saat memesan. p_items: [{"menu_id":1,"qty":2}]
CREATE OR REPLACE FUNCTION po_buat(p_siswa_id BIGINT, p_oleh TEXT, p_items JSONB, p_catatan TEXT DEFAULT NULL, p_tanggal DATE DEFAULT hari_ini())
RETURNS TABLE (po_id BIGINT, kode TEXT, total_rp BIGINT, saldo_rp BIGINT) AS $$
DECLARE j RECORD; items JSONB; total BIGINT; k TEXT; tid BIGINT; pid BIGINT; lim BIGINT; sudah BIGINT;
BEGIN
    SELECT * INTO j FROM po_jendela(p_tanggal);
    IF NOT j.buka THEN RAISE EXCEPTION '%', j.alasan USING HINT = 'PO_TUTUP'; END IF;
    IF NOT EXISTS (SELECT 1 FROM siswa WHERE id = p_siswa_id AND status = 'aktif') THEN
        RAISE EXCEPTION 'siswa tidak aktif' USING HINT = 'SISWA_NONAKTIF';
    END IF;
    items := kantin_susun_item(p_items, TRUE);
    SELECT SUM((x->>'harga_rp')::BIGINT * (x->>'qty')::INT) INTO total FROM jsonb_array_elements(items) x;

    -- limit harian berlaku juga untuk PO (uang kantin hari itu)
    lim := limit_harian_efektif(p_siswa_id);
    sudah := belanja_hari(p_siswa_id, p_tanggal);
    IF sudah + total > lim THEN
        RAISE EXCEPTION 'melebihi limit harian Rp % (sudah terpakai Rp %)', lim, sudah USING HINT = 'LIMIT_HARIAN';
    END IF;

    k := po_kode_baru();
    SELECT p.transaksi_id INTO tid
      FROM posting('belanja', akun_siswa(p_siswa_id), akun_kode('KANTIN'), total, p_siswa_id,
                   'po:' || k, NULL, NULL, 'kantin', 'PO kantin ' || k, FALSE, FALSE, now(),
                   NULL, NULL, 'selesai', FALSE, p_oleh) p;
    PERFORM catat_item(tid, items);
    INSERT INTO po_pesanan (kode, siswa_id, dipesan_oleh, tanggal, total_rp, transaksi_id, catatan)
    VALUES (k, p_siswa_id, p_oleh, p_tanggal, total, tid, p_catatan) RETURNING id INTO pid;
    INSERT INTO po_item (po_id, menu_id, nama, harga_rp, qty)
    SELECT pid, (x->>'ref_id')::BIGINT, x->>'nama', (x->>'harga_rp')::BIGINT, (x->>'qty')::INT FROM jsonb_array_elements(items) x;
    RETURN QUERY SELECT pid, k, total, saldo_siswa(p_siswa_id);
END $$ LANGUAGE plpgsql;

-- Batal sebelum jam tutup → refund penuh otomatis (F-48).
CREATE OR REPLACE FUNCTION po_batal(p_po_id BIGINT, p_oleh TEXT)
RETURNS BIGINT AS $$
DECLARE po po_pesanan; batas TIMESTAMPTZ; rid BIGINT;
BEGIN
    SELECT * INTO po FROM po_pesanan WHERE id = p_po_id FOR UPDATE;
    IF po.id IS NULL THEN RAISE EXCEPTION 'PO tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    IF po.status <> 'dibayar' THEN RAISE EXCEPTION 'PO sudah %', po.status USING HINT = 'STATUS_TIDAK_SESUAI'; END IF;
    batas := (po.tanggal::timestamp + kebijakan_jam('po_tutup')) AT TIME ZONE 'Asia/Jakarta';
    IF now() > batas THEN
        RAISE EXCEPTION 'PO sudah ditutup pukul % — tidak bisa dibatalkan, makanan sudah disiapkan', to_char(kebijakan_jam('po_tutup'), 'HH24.MI')
            USING HINT = 'PO_SUDAH_TUTUP';
    END IF;
    rid := refund(po.transaksi_id, NULL, 'Pembatalan PO ' || po.kode, p_oleh, 'po-batal:' || po.kode);
    UPDATE po_pesanan SET status = 'dibatalkan', refund_transaksi_id = rid WHERE id = po.id;
    RETURN rid;
END $$ LANGUAGE plpgsql;

-- Kasir tab PO: cari pesanan hari ini lewat tap kartu ATAU kode (kartu diblokir).
CREATE OR REPLACE FUNCTION po_cari(p_device_kode TEXT, p_uid TEXT DEFAULT NULL, p_kode TEXT DEFAULT NULL)
RETURNS TABLE (po_id BIGINT, kode TEXT, siswa_id BIGINT, nama TEXT, kelas TEXT, total_rp BIGINT, status status_po,
               item TEXT, lewat_kartu BOOLEAN) AS $$
DECLARE d device; sid BIGINT; kid BIGINT;
BEGIN
    d := device_aktif(p_device_kode);
    IF d.layanan <> 'kantin' THEN RAISE EXCEPTION 'bukan terminal kantin' USING HINT = 'LAYANAN_TIDAK_VALID'; END IF;
    IF p_uid IS NOT NULL THEN
        -- kartu harus aktif; kartu diblokir → kasir pakai kode PO
        SELECT k.siswa_id, k.id INTO sid, kid FROM kartu k WHERE k.uid = upper(regexp_replace(p_uid, '[^0-9A-Fa-f]', '', 'g'));
        IF sid IS NULL THEN RAISE EXCEPTION 'kartu tidak dikenal' USING HINT = 'KARTU_TIDAK_DIKENAL'; END IF;
        IF NOT EXISTS (SELECT 1 FROM kartu WHERE id = kid AND kartu.status = 'aktif') THEN
            RAISE EXCEPTION 'kartu diblokir — minta siswa menunjukkan kode PO' USING HINT = 'KARTU_DIBLOKIR';
        END IF;
        RETURN QUERY
        SELECT p.id, p.kode, p.siswa_id, s.nama,
               (SELECT pk.kelas FROM penempatan_kelas pk WHERE pk.siswa_id = s.id AND pk.tahun_ajaran_id = (SELECT id FROM tahun_ajaran WHERE aktif LIMIT 1)),
               p.total_rp, p.status,
               (SELECT string_agg(i.qty || '× ' || i.nama, ', ' ORDER BY i.id) FROM po_item i WHERE i.po_id = p.id),
               TRUE
          FROM po_pesanan p JOIN siswa s ON s.id = p.siswa_id
         WHERE p.siswa_id = sid AND p.tanggal = hari_ini() AND p.status = 'dibayar'
         ORDER BY p.id;
    ELSIF p_kode IS NOT NULL THEN
        RETURN QUERY
        SELECT p.id, p.kode, p.siswa_id, s.nama,
               (SELECT pk.kelas FROM penempatan_kelas pk WHERE pk.siswa_id = s.id AND pk.tahun_ajaran_id = (SELECT id FROM tahun_ajaran WHERE aktif LIMIT 1)),
               p.total_rp, p.status,
               (SELECT string_agg(i.qty || '× ' || i.nama, ', ' ORDER BY i.id) FROM po_item i WHERE i.po_id = p.id),
               FALSE
          FROM po_pesanan p JOIN siswa s ON s.id = p.siswa_id
         WHERE upper(p.kode) = upper(trim(p_kode)) AND p.tanggal = hari_ini();
    ELSE
        RAISE EXCEPTION 'uid atau kode PO wajib' USING HINT = 'IDENTITAS_WAJIB';
    END IF;
END $$ LANGUAGE plpgsql;

-- Tandai diambil (setelah kasir verifikasi nama). Tanpa pembayaran ulang.
CREATE OR REPLACE FUNCTION po_ambil(p_device_kode TEXT, p_po_ids BIGINT[])
RETURNS INTEGER AS $$
DECLARE d device; n INTEGER;
BEGIN
    d := device_aktif(p_device_kode);
    UPDATE po_pesanan SET status = 'diambil', diambil_pada = now(), device_ambil_id = d.id
     WHERE id = ANY(p_po_ids) AND status = 'dibayar' AND tanggal = hari_ini();
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN RAISE EXCEPTION 'tidak ada PO yang bisa diambil (sudah diambil / bukan hari ini)' USING HINT = 'STATUS_TIDAK_SESUAI'; END IF;
    RETURN n;
END $$ LANGUAGE plpgsql;

-- Job penutupan hari (setelah jendela ambil): pesanan tidak diambil → kebijakan (F-49).
CREATE OR REPLACE FUNCTION po_tutup_hari(p_tanggal DATE DEFAULT hari_ini())
RETURNS TABLE (tidak_diambil INTEGER, direfund INTEGER) AS $$
DECLARE po RECORD; kebijakan_ TEXT := kebijakan_text('po_tidak_diambil'); n INTEGER := 0; r INTEGER := 0; rid BIGINT;
BEGIN
    IF p_tanggal = hari_ini() AND waktu_sekolah()::time < kebijakan_jam('po_ambil_selesai') THEN
        RAISE EXCEPTION 'jendela pengambilan belum selesai' USING HINT = 'BELUM_WAKTUNYA';
    END IF;
    FOR po IN SELECT * FROM po_pesanan WHERE tanggal = p_tanggal AND status = 'dibayar' FOR UPDATE LOOP
        IF kebijakan_ = 'refund' THEN
            rid := refund(po.transaksi_id, NULL, 'PO ' || po.kode || ' tidak diambil — refund sesuai kebijakan', 'sistem', 'po-tutup:' || po.kode);
            UPDATE po_pesanan SET status = 'tidak_diambil', refund_transaksi_id = rid, ditutup_pada = now() WHERE id = po.id;
            r := r + 1;
        ELSE
            UPDATE po_pesanan SET status = 'tidak_diambil', ditutup_pada = now() WHERE id = po.id;
            PERFORM notifikasi_wali(po.siswa_id, 'po_tidak_diambil', 'Pesanan kantin tidak diambil',
                format('PO %s (Rp %s) tidak diambil dan tetap ditagih sesuai kebijakan sekolah.', po.kode, rp_teks(po.total_rp)));
        END IF;
        n := n + 1;
    END LOOP;
    RETURN QUERY SELECT n, r;
END $$ LANGUAGE plpgsql;

-- Dapur: rekap item PO per tanggal (untuk belanja bahan).
CREATE OR REPLACE VIEW v_po_dapur AS
SELECT p.tanggal, i.nama, SUM(i.qty) AS qty, SUM(i.qty * i.harga_rp) AS nilai_rp,
       COUNT(DISTINCT p.id) AS jumlah_pesanan
  FROM po_pesanan p JOIN po_item i ON i.po_id = p.id
 WHERE p.status IN ('dibayar', 'diambil', 'tidak_diambil')
 GROUP BY p.tanggal, i.nama;

-- ---------------------------------------------------------------------
-- 3. REKAP & LAPORAN (F-46, F-92, F-94)
-- ---------------------------------------------------------------------
-- Rekap harian per terminal
CREATE OR REPLACE VIEW v_rekap_terminal_harian AS
SELECT d.kode AS device, d.layanan, tgl_sekolah(t.waktu_terminal) AS tanggal,
       COUNT(*) FILTER (WHERE t.jenis = 'belanja')                       AS jumlah_transaksi,
       COALESCE(SUM(t.total_rp) FILTER (WHERE t.jenis = 'belanja'), 0)  AS omzet_rp,
       COUNT(*) FILTER (WHERE t.jenis = 'belanja' AND t.offline)         AS transaksi_offline,
       COUNT(*) FILTER (WHERE t.jenis = 'refund' AND t.oleh LIKE 'device:%') AS pembatalan,
       COALESCE(SUM(t.total_rp) FILTER (WHERE t.jenis = 'refund' AND t.oleh LIKE 'device:%'), 0) AS nilai_pembatalan_rp,
       COUNT(*) FILTER (WHERE t.jenis = 'belanja' AND t.pakai_pin)       AS pakai_pin,
       COUNT(*) FILTER (WHERE t.jenis = 'belanja' AND NOT EXISTS (SELECT 1 FROM transaksi_item i WHERE i.transaksi_id = t.id)) AS mode_nominal
  FROM transaksi t JOIN device d ON d.id = t.device_id
 WHERE t.status = 'selesai'
 GROUP BY d.kode, d.layanan, tgl_sekolah(t.waktu_terminal);

-- Settlement per unit layanan per tanggal (uang yang menjadi hak unit)
CREATE OR REPLACE VIEW v_settlement_unit AS
SELECT t.layanan, tgl_sekolah(t.waktu_terminal) AS tanggal,
       COALESCE(SUM(t.total_rp) FILTER (WHERE t.jenis IN ('belanja', 'denda')), 0) AS kotor_rp,
       COALESCE(SUM(t.total_rp) FILTER (WHERE t.jenis = 'refund'), 0)              AS refund_rp,
       COALESCE(SUM(t.total_rp) FILTER (WHERE t.jenis IN ('belanja', 'denda')), 0)
         - COALESCE(SUM(t.total_rp) FILTER (WHERE t.jenis = 'refund'), 0)          AS bersih_rp,
       COUNT(*) FILTER (WHERE t.jenis IN ('belanja', 'denda'))                     AS jumlah_transaksi
  FROM transaksi t
 WHERE t.status = 'selesai' AND t.layanan IS NOT NULL AND t.layanan <> 'topup'
 GROUP BY t.layanan, tgl_sekolah(t.waktu_terminal);

-- Menu terlaris (hanya dari mode menu + PO — F-47 trade-off)
CREATE OR REPLACE VIEW v_menu_terlaris AS
SELECT tgl_sekolah(t.waktu_terminal) AS tanggal, i.ref_id AS menu_id, i.nama,
       SUM(i.qty) AS qty, SUM(i.qty * i.harga_rp) AS nilai_rp
  FROM transaksi_item i JOIN transaksi t ON t.id = i.transaksi_id
 WHERE t.layanan = 'kantin' AND t.jenis = 'belanja' AND t.status = 'selesai'
 GROUP BY tgl_sekolah(t.waktu_terminal), i.ref_id, i.nama;

-- Indikator kesejahteraan (F-94): boarding aktif tanpa transaksi kantin ≥ 2 hari. TANPA rupiah.
CREATE OR REPLACE VIEW v_kesejahteraan AS
SELECT s.id AS siswa_id, s.nis, s.nama,
       (SELECT pk.kelas FROM penempatan_kelas pk WHERE pk.siswa_id = s.id
          AND pk.tahun_ajaran_id = (SELECT id FROM tahun_ajaran WHERE aktif LIMIT 1)) AS kelas,
       MAX(tgl_sekolah(t.waktu_terminal)) AS transaksi_terakhir,
       hari_ini() - MAX(tgl_sekolah(t.waktu_terminal)) AS hari_tanpa_transaksi,
       saldo_siswa(s.id) = 0 AS saldo_kosong          -- boolean saja, bukan nominal
  FROM siswa s
  LEFT JOIN transaksi t ON t.siswa_id = s.id AND t.layanan = 'kantin' AND t.jenis = 'belanja' AND t.status = 'selesai'
 WHERE s.boarding AND s.status = 'aktif'
 GROUP BY s.id
HAVING MAX(tgl_sekolah(t.waktu_terminal)) IS NULL OR MAX(tgl_sekolah(t.waktu_terminal)) <= hari_ini() - 2;

-- Riwayat untuk portal (dengan nama item, F-101) — dipakai lewat WHERE siswa_id = …
CREATE OR REPLACE VIEW v_riwayat_siswa AS
SELECT t.id, t.kode, t.siswa_id, t.jenis, t.status, t.layanan, t.total_rp, t.keterangan,
       t.waktu_terminal AS waktu, t.offline, t.pakai_pin, t.ref_transaksi_id,
       d.kode AS device, d.nama AS device_nama,
       (SELECT string_agg(i.qty || '× ' || i.nama, ', ' ORDER BY i.id) FROM transaksi_item i WHERE i.transaksi_id = t.id) AS item,
       CASE WHEN t.jenis IN ('belanja', 'denda', 'penarikan') THEN -t.total_rp ELSE t.total_rp END AS arah_rp,
       sudah_direfund(t.id) AS direfund_rp
  FROM transaksi t LEFT JOIN device d ON d.id = t.device_id;
