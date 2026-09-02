-- =====================================================================
-- 003 — FUNGSI WALLET
--
-- Semua uang bergerak lewat SATU fungsi: posting(). Fungsi lain (bayar,
-- topup, refund, koreksi, penarikan, batal_kasir, antrian offline) hanya
-- memutuskan akun mana → akun mana, lalu memanggil posting().
--
-- Kesalahan dilempar sebagai EXCEPTION dengan HINT berisi kode mesin
-- (mis. SALDO_KURANG) — aplikasi memetakan HINT ke respons HTTP, dan
-- MESSAGE bisa langsung ditampilkan ke kasir/ortu dalam bahasa Indonesia.
--
-- Konkurensi: posting() mengunci baris akun (FOR UPDATE, urut id) sebelum
-- memeriksa saldo dan idempotency key. Dua request bersamaan untuk siswa
-- yang sama dieksekusi berurutan, sehingga cek "saldo cukup" tidak bisa
-- dilewati oleh dua transaksi yang sama-sama membaca saldo lama.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. BANTU
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION akun_kode(p_kode TEXT) RETURNS BIGINT AS $$
DECLARE a BIGINT;
BEGIN
    SELECT id INTO a FROM akun WHERE kode = p_kode;
    IF a IS NULL THEN RAISE EXCEPTION 'akun sistem % tidak ada', p_kode USING HINT = 'AKUN_TIDAK_ADA'; END IF;
    RETURN a;
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION akun_siswa(p_siswa_id BIGINT) RETURNS BIGINT AS $$
DECLARE a BIGINT;
BEGIN
    SELECT id INTO a FROM akun WHERE siswa_id = p_siswa_id;
    IF a IS NULL THEN RAISE EXCEPTION 'siswa % tidak punya akun wallet', p_siswa_id USING HINT = 'AKUN_TIDAK_ADA'; END IF;
    RETURN a;
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION saldo_siswa(p_siswa_id BIGINT) RETURNS BIGINT AS $$
    SELECT COALESCE((SELECT sc.saldo_rp FROM saldo_cache sc JOIN akun a ON a.id = sc.akun_id WHERE a.siswa_id = p_siswa_id), 0);
$$ LANGUAGE sql STABLE;

-- Akun pendapatan untuk tiap layanan.
CREATE OR REPLACE FUNCTION akun_pendapatan(p_layanan jenis_layanan) RETURNS BIGINT AS $$
BEGIN
    RETURN akun_kode(CASE p_layanan
        WHEN 'kantin'       THEN 'KANTIN'
        WHEN 'laundry'      THEN 'LAUNDRY'
        WHEN 'vending'      THEN 'VENDING'
        WHEN 'perpustakaan' THEN 'DENDA_PERPUS'
        WHEN 'locker'       THEN 'DENDA_ASRAMA'
        ELSE NULL END);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'layanan % tidak menerima pembayaran', p_layanan USING HINT = 'LAYANAN_TIDAK_VALID';
END $$ LANGUAGE plpgsql STABLE;

-- Belanja kantin+vending pada satu tanggal sekolah, dikurangi refund-nya
-- (dipakai limit harian F-17).
CREATE OR REPLACE FUNCTION belanja_hari(p_siswa_id BIGINT, p_tanggal DATE) RETURNS BIGINT AS $$
    SELECT COALESCE(SUM(CASE WHEN t.jenis = 'belanja' THEN t.total_rp
                             WHEN t.jenis = 'refund'  THEN -t.total_rp END), 0)
      FROM transaksi t
     WHERE t.siswa_id = p_siswa_id
       AND t.layanan IN ('kantin', 'vending')
       AND t.status IN ('pending', 'selesai')
       AND tgl_sekolah(t.waktu_terminal) = p_tanggal
       AND (t.jenis = 'belanja'
            -- refund hanya mengurangi kalau transaksi asalnya masih dihitung
            -- (belanja 'batal' — vending gagal — sudah tidak dihitung di atas)
            OR (t.jenis = 'refund' AND EXISTS (SELECT 1 FROM transaksi a WHERE a.id = t.ref_transaksi_id AND a.status = 'selesai')));
$$ LANGUAGE sql STABLE;

-- Item per transaksi (mode menu, PO, laundry, vending). Mode nominal
-- kasir tidak punya item (F-47) — itu trade-off yang disengaja.
CREATE TABLE transaksi_item (
    id            BIGSERIAL PRIMARY KEY,
    transaksi_id  BIGINT NOT NULL REFERENCES transaksi(id) ON DELETE RESTRICT,
    nama          TEXT NOT NULL,
    harga_rp      BIGINT NOT NULL CHECK (harga_rp >= 0),    -- harga SAAT transaksi (harga menu boleh berubah nanti)
    qty           INTEGER NOT NULL CHECK (qty > 0),
    ref_id        BIGINT                                     -- menu_id / produk_id / tarif_id
);
CREATE INDEX ON transaksi_item (transaksi_id);
CREATE INDEX ON transaksi_item (ref_id);

-- p_items: [{"nama":"Nasi ayam","harga_rp":12000,"qty":1,"ref_id":3}, ...]
CREATE OR REPLACE FUNCTION catat_item(p_transaksi_id BIGINT, p_items JSONB) RETURNS BIGINT AS $$
DECLARE total BIGINT;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RETURN 0; END IF;
    INSERT INTO transaksi_item (transaksi_id, nama, harga_rp, qty, ref_id)
    SELECT p_transaksi_id, x->>'nama', (x->>'harga_rp')::BIGINT, COALESCE((x->>'qty')::INTEGER, 1), (x->>'ref_id')::BIGINT
      FROM jsonb_array_elements(p_items) x;
    SELECT COALESCE(SUM(harga_rp * qty), 0) INTO total FROM transaksi_item WHERE transaksi_id = p_transaksi_id;
    RETURN total;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 2. POSTING — satu-satunya jalan uang bergerak
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION posting(
    p_jenis          jenis_transaksi,
    p_dari_akun      BIGINT,          -- akun yang berkurang
    p_ke_akun        BIGINT,          -- akun yang bertambah
    p_total          BIGINT,
    p_siswa_id       BIGINT,
    p_idem           TEXT     DEFAULT NULL,
    p_device_id      BIGINT   DEFAULT NULL,
    p_kartu_id       BIGINT   DEFAULT NULL,
    p_layanan        jenis_layanan DEFAULT NULL,
    p_keterangan     TEXT     DEFAULT NULL,
    p_pakai_pin      BOOLEAN  DEFAULT FALSE,
    p_offline        BOOLEAN  DEFAULT FALSE,
    p_waktu_terminal TIMESTAMPTZ DEFAULT now(),
    p_ref_transaksi  BIGINT   DEFAULT NULL,
    p_ref_eksternal  TEXT     DEFAULT NULL,
    p_status         status_transaksi DEFAULT 'selesai',
    p_tanpa_kartu    BOOLEAN  DEFAULT FALSE,
    p_oleh           TEXT     DEFAULT NULL,
    OUT transaksi_id BIGINT,
    OUT baru         BOOLEAN
) AS $$
DECLARE
    ada_id BIGINT; ada_total BIGINT;
    boleh BOOLEAN; nm TEXT; s BIGINT;
BEGIN
    IF p_total IS NULL OR p_total <= 0 THEN
        RAISE EXCEPTION 'nominal harus lebih dari 0' USING HINT = 'NOMINAL_TIDAK_VALID';
    END IF;
    IF p_dari_akun = p_ke_akun THEN
        RAISE EXCEPTION 'akun asal dan tujuan sama' USING HINT = 'AKUN_SAMA';
    END IF;
    IF p_jenis = 'transfer' AND NOT kebijakan_bool('transfer_aktif') THEN
        RAISE EXCEPTION 'transfer antar-siswa dinonaktifkan (menunggu tinjauan hukum, PRD §8.4)' USING HINT = 'TRANSFER_NONAKTIF';
    END IF;

    -- Kunci kedua akun (urut id → tidak deadlock). Semua cek di bawah
    -- berjalan setelah kunci didapat, jadi melihat transaksi yang sudah commit.
    PERFORM 1 FROM akun WHERE id IN (p_dari_akun, p_ke_akun) ORDER BY id FOR UPDATE;

    -- Idempotensi (F-14): key sama → kembalikan transaksi lama, jangan posting lagi.
    IF p_idem IS NOT NULL THEN
        SELECT id, total_rp INTO ada_id, ada_total FROM transaksi WHERE idempotency_key = p_idem;
        IF ada_id IS NOT NULL THEN
            IF ada_total <> p_total THEN
                RAISE EXCEPTION 'idempotency key % sudah dipakai untuk nominal berbeda (Rp %)', p_idem, ada_total
                    USING HINT = 'IDEMPOTENSI_BEDA';
            END IF;
            transaksi_id := ada_id; baru := FALSE;
            RETURN;
        END IF;
    END IF;

    -- Saldo asal cukup? (F-12) Dicek dari ledger, bukan cache, di bawah kunci.
    SELECT a.boleh_minus, a.nama INTO boleh, nm FROM akun a WHERE a.id = p_dari_akun;
    IF nm IS NULL THEN RAISE EXCEPTION 'akun asal tidak ada' USING HINT = 'AKUN_TIDAK_ADA'; END IF;
    IF NOT boleh THEN
        SELECT COALESCE(SUM(nominal_rp), 0) INTO s FROM entri_ledger WHERE akun_id = p_dari_akun;
        IF s < p_total THEN
            RAISE EXCEPTION 'saldo tidak mencukupi (saldo Rp %, dibutuhkan Rp %)', s, p_total
                USING HINT = 'SALDO_KURANG';
        END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM akun WHERE id = p_ke_akun) THEN
        RAISE EXCEPTION 'akun tujuan tidak ada' USING HINT = 'AKUN_TIDAK_ADA';
    END IF;

    INSERT INTO transaksi (jenis, status, idempotency_key, device_id, siswa_id, kartu_id, total_rp,
                           pakai_pin, offline, keterangan, ref_eksternal, ref_transaksi_id,
                           waktu_terminal, layanan, tanpa_kartu, oleh)
    VALUES (p_jenis, p_status, p_idem, p_device_id, p_siswa_id, p_kartu_id, p_total,
            p_pakai_pin, p_offline, p_keterangan, p_ref_eksternal, p_ref_transaksi,
            COALESCE(p_waktu_terminal, now()), p_layanan, p_tanpa_kartu, p_oleh)
    RETURNING id INTO transaksi_id;

    INSERT INTO entri_ledger (transaksi_id, akun_id, nominal_rp) VALUES
        (transaksi_id, p_dari_akun, -p_total),
        (transaksi_id, p_ke_akun,    p_total);
    baru := TRUE;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 3. IDENTIFIKASI DI TERMINAL
-- ---------------------------------------------------------------------
-- Device dari kode; menolak yang nonaktif.
CREATE OR REPLACE FUNCTION device_aktif(p_kode TEXT) RETURNS device AS $$
DECLARE d device;
BEGIN
    SELECT * INTO d FROM device WHERE kode = p_kode;
    IF d.id IS NULL THEN RAISE EXCEPTION 'terminal % tidak terdaftar', p_kode USING HINT = 'DEVICE_TIDAK_DIKENAL'; END IF;
    IF NOT d.aktif THEN RAISE EXCEPTION 'terminal % dinonaktifkan', p_kode USING HINT = 'DEVICE_NONAKTIF'; END IF;
    RETURN d;
END $$ LANGUAGE plpgsql STABLE;

-- Siapa pemegang kartu ini? Melempar error yang jelas untuk tiap kasus
-- (kartu asing / diblokir / siswa nonaktif) — kasir butuh pesan, bukan NULL.
CREATE OR REPLACE FUNCTION identifikasi_kartu(p_uid TEXT)
RETURNS TABLE (siswa_id BIGINT, kartu_id BIGINT, nama TEXT, nis TEXT, kelas TEXT, boarding BOOLEAN, saldo_rp BIGINT, jenjang TEXT) AS $$
DECLARE k kartu; s siswa;
BEGIN
    SELECT * INTO k FROM kartu WHERE uid = upper(regexp_replace(p_uid, '[^0-9A-Fa-f]', '', 'g'));
    IF k.id IS NULL THEN
        RAISE EXCEPTION 'kartu tidak dikenal' USING HINT = 'KARTU_TIDAK_DIKENAL';
    END IF;
    IF k.status <> 'aktif' THEN
        RAISE EXCEPTION 'kartu diblokir (status: %)', k.status USING HINT = 'KARTU_DIBLOKIR';
    END IF;
    SELECT * INTO s FROM siswa WHERE id = k.siswa_id;
    IF s.status <> 'aktif' THEN
        RAISE EXCEPTION 'siswa berstatus % — kartu tidak bisa dipakai', s.status USING HINT = 'SISWA_NONAKTIF';
    END IF;
    RETURN QUERY
    SELECT s.id, k.id, s.nama, s.nis,
           (SELECT pk.kelas FROM penempatan_kelas pk WHERE pk.siswa_id = s.id
              AND pk.tahun_ajaran_id = (SELECT id FROM tahun_ajaran WHERE aktif LIMIT 1)),
           s.boarding, saldo_siswa(s.id), s.jenjang;
END $$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------
-- 4. PIN (F-30–F-34) — hash dibuat & dicocokkan di server aplikasi
--    (scrypt). Database hanya menyimpan hash dan mengelola kunci.
-- ---------------------------------------------------------------------
ALTER TABLE pin_siswa ADD COLUMN jumlah_kunci SMALLINT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION pin_info(p_siswa_id BIGINT)
RETURNS TABLE (ada BOOLEAN, hash TEXT, terkunci BOOLEAN, terkunci_hingga TIMESTAMPTZ, harus_ganti BOOLEAN, gagal SMALLINT) AS $$
    SELECT p.siswa_id IS NOT NULL,
           p.hash,
           COALESCE(p.terkunci_hingga > now(), FALSE),
           p.terkunci_hingga,
           COALESCE(p.harus_ganti, TRUE),
           COALESCE(p.gagal, 0::smallint)
      FROM (SELECT 1) x LEFT JOIN pin_siswa p ON p.siswa_id = p_siswa_id;
$$ LANGUAGE sql STABLE;

-- Catat hasil percobaan PIN. Salah N kali → kunci 30 menit; kalau setelah
-- kunci pertama masih salah N kali lagi → kunci permanen sampai TU membuka.
CREATE OR REPLACE FUNCTION pin_catat(p_siswa_id BIGINT, p_berhasil BOOLEAN, p_device_id BIGINT DEFAULT NULL, p_ip INET DEFAULT NULL)
RETURNS TABLE (terkunci BOOLEAN, terkunci_hingga TIMESTAMPTZ, sisa_percobaan INTEGER) AS $$
DECLARE p pin_siswa; maks INTEGER := kebijakan_int('pin_maks_gagal'); menit INTEGER := kebijakan_int('pin_kunci_menit');
BEGIN
    INSERT INTO percobaan_pin (siswa_id, device_id, berhasil, ip) VALUES (p_siswa_id, p_device_id, p_berhasil, p_ip);
    SELECT * INTO p FROM pin_siswa WHERE siswa_id = p_siswa_id FOR UPDATE;
    IF p.siswa_id IS NULL THEN
        RAISE EXCEPTION 'siswa belum punya PIN' USING HINT = 'PIN_BELUM_ADA';
    END IF;
    IF p_berhasil THEN
        UPDATE pin_siswa SET gagal = 0, terkunci_hingga = NULL, jumlah_kunci = 0 WHERE siswa_id = p_siswa_id;
        RETURN QUERY SELECT FALSE, NULL::timestamptz, maks;
        RETURN;
    END IF;
    p.gagal := p.gagal + 1;
    IF p.gagal >= maks THEN
        p.jumlah_kunci := p.jumlah_kunci + 1;
        p.terkunci_hingga := CASE WHEN p.jumlah_kunci >= 2 THEN 'infinity'::timestamptz
                                  ELSE now() + make_interval(mins => menit) END;
        p.gagal := 0;
        PERFORM catat_audit('sistem', NULL, 'pin_terkunci', 'siswa:' || p_siswa_id,
                            jsonb_build_object('hingga', p.terkunci_hingga, 'kunci_ke', p.jumlah_kunci, 'device_id', p_device_id));
    END IF;
    UPDATE pin_siswa SET gagal = p.gagal, terkunci_hingga = p.terkunci_hingga, jumlah_kunci = p.jumlah_kunci
     WHERE siswa_id = p_siswa_id;
    RETURN QUERY SELECT COALESCE(p.terkunci_hingga > now(), FALSE), p.terkunci_hingga, GREATEST(maks - p.gagal, 0);
END $$ LANGUAGE plpgsql;

-- Set / ganti / reset PIN. p_oleh = 'siswa' (ganti sendiri) atau email TU (reset, F-34).
CREATE OR REPLACE FUNCTION pin_set(p_siswa_id BIGINT, p_hash TEXT, p_oleh TEXT, p_harus_ganti BOOLEAN DEFAULT FALSE)
RETURNS VOID AS $$
BEGIN
    IF p_hash IS NULL OR length(p_hash) < 32 THEN
        RAISE EXCEPTION 'hash PIN tidak valid' USING HINT = 'HASH_TIDAK_VALID';
    END IF;
    INSERT INTO pin_siswa (siswa_id, hash, harus_ganti, gagal, terkunci_hingga, jumlah_kunci, diubah)
    VALUES (p_siswa_id, p_hash, p_harus_ganti, 0, NULL, 0, now())
    ON CONFLICT (siswa_id) DO UPDATE
       SET hash = EXCLUDED.hash, harus_ganti = EXCLUDED.harus_ganti, gagal = 0,
           terkunci_hingga = NULL, jumlah_kunci = 0, diubah = now();
    PERFORM catat_audit(p_oleh, NULL, CASE WHEN p_harus_ganti THEN 'reset_pin' ELSE 'ubah_pin' END,
                        'siswa:' || p_siswa_id);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pin_buka_kunci(p_siswa_id BIGINT, p_oleh TEXT) RETURNS VOID AS $$
BEGIN
    UPDATE pin_siswa SET gagal = 0, terkunci_hingga = NULL, jumlah_kunci = 0 WHERE siswa_id = p_siswa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'siswa belum punya PIN' USING HINT = 'PIN_BELUM_ADA'; END IF;
    PERFORM catat_audit(p_oleh, NULL, 'buka_kunci_pin', 'siswa:' || p_siswa_id);
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 5. BAYAR — dipakai kasir, laundry, vending, PO
-- ---------------------------------------------------------------------
-- Alur aplikasi: terminal kirim {uid, total, idem, pin?}. Aplikasi:
--   1. identifikasi_kartu(uid) → tampilkan nama+foto (F-42)
--   2. kalau total > ambang: cocokkan PIN (scrypt) → pin_catat()
--   3. bayar(..., p_pin_ok := hasil langkah 2)
-- p_pin_ok TRUE berarti aplikasi SUDAH memverifikasi PIN. Database tetap
-- menolak kalau PIN sedang terkunci (pertahanan lapis dua).
CREATE OR REPLACE FUNCTION bayar(
    p_device_kode    TEXT,
    p_idem           TEXT,
    p_uid            TEXT,
    p_total          BIGINT,
    p_keterangan     TEXT,
    p_pin_ok         BOOLEAN DEFAULT FALSE,
    p_offline        BOOLEAN DEFAULT FALSE,
    p_waktu_terminal TIMESTAMPTZ DEFAULT now(),
    p_nis            TEXT DEFAULT NULL,           -- mode darurat tanpa kartu (§9), wajib PIN
    p_items          JSONB DEFAULT NULL,
    p_jenis          jenis_transaksi DEFAULT 'belanja',
    p_status         status_transaksi DEFAULT 'selesai',
    p_oleh           TEXT DEFAULT NULL
) RETURNS TABLE (transaksi_id BIGINT, kode TEXT, baru BOOLEAN, siswa_id BIGINT, nama TEXT, saldo_rp BIGINT, total_rp BIGINT) AS $$
DECLARE
    d device; sid BIGINT; kid BIGINT; snama TEXT;
    ambang BIGINT := kebijakan_int('ambang_pin_rp');
    r RECORD; lim BIGINT; sudah BIGINT; total_item BIGINT; tid BIGINT; brand BOOLEAN;
BEGIN
    IF p_idem IS NULL OR length(p_idem) < 8 THEN
        RAISE EXCEPTION 'idempotency key wajib (min 8 karakter)' USING HINT = 'IDEM_WAJIB';
    END IF;
    d := device_aktif(p_device_kode);

    -- Kiriman ulang? Kembalikan hasil lama tanpa mengulang cek apa pun.
    SELECT t.id, t.siswa_id INTO tid, sid FROM transaksi t WHERE t.idempotency_key = p_idem;
    IF tid IS NOT NULL THEN
        RETURN QUERY SELECT t.id, t.kode, FALSE, t.siswa_id, s.nama, saldo_siswa(t.siswa_id), t.total_rp
                       FROM transaksi t JOIN siswa s ON s.id = t.siswa_id WHERE t.id = tid;
        RETURN;
    END IF;

    -- Siapa yang bayar
    IF p_uid IS NOT NULL THEN
        SELECT * INTO r FROM identifikasi_kartu(p_uid);
        sid := r.siswa_id; kid := r.kartu_id; snama := r.nama;
    ELSIF p_nis IS NOT NULL THEN
        IF NOT p_pin_ok THEN
            RAISE EXCEPTION 'transaksi tanpa kartu wajib PIN' USING HINT = 'BUTUH_PIN';
        END IF;
        SELECT s.id, s.nama INTO sid, snama FROM siswa s WHERE s.nis = p_nis AND s.status = 'aktif';
        IF sid IS NULL THEN RAISE EXCEPTION 'NIS tidak ditemukan / siswa nonaktif' USING HINT = 'SISWA_NONAKTIF'; END IF;
    ELSE
        RAISE EXCEPTION 'uid kartu atau NIS wajib' USING HINT = 'IDENTITAS_WAJIB';
    END IF;

    -- Total: kalau ada item, total dihitung server dari item (kasir tidak bisa mengubah harga)
    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        SELECT COALESCE(SUM((x->>'harga_rp')::BIGINT * COALESCE((x->>'qty')::INTEGER, 1)), 0)
          INTO total_item FROM jsonb_array_elements(p_items) x;
        IF p_total IS NOT NULL AND p_total <> total_item THEN
            RAISE EXCEPTION 'total (Rp %) tidak sama dengan jumlah item (Rp %)', p_total, total_item USING HINT = 'TOTAL_BEDA';
        END IF;
        p_total := total_item;
    END IF;

    -- Offline (F-43): hanya di bawah limit device, tidak pernah dengan PIN
    IF p_offline THEN
        IF p_total > d.limit_offline_rp THEN
            RAISE EXCEPTION 'transaksi offline maksimal Rp %', d.limit_offline_rp USING HINT = 'MELEBIHI_LIMIT_OFFLINE';
        END IF;
        IF p_pin_ok THEN
            RAISE EXCEPTION 'transaksi offline tidak bisa memverifikasi PIN (F-33)' USING HINT = 'OFFLINE_TANPA_PIN';
        END IF;
    END IF;

    -- PIN (F-31, F-33)
    IF p_total > ambang AND NOT p_pin_ok THEN
        RAISE EXCEPTION 'transaksi di atas Rp % wajib PIN', ambang USING HINT = 'BUTUH_PIN';
    END IF;
    IF d.layanan = 'laundry' AND NOT p_pin_ok THEN
        RAISE EXCEPTION 'semua pembayaran laundry wajib PIN' USING HINT = 'BUTUH_PIN';
    END IF;
    IF p_pin_ok AND EXISTS (SELECT 1 FROM pin_siswa WHERE pin_siswa.siswa_id = sid AND terkunci_hingga > now()) THEN
        RAISE EXCEPTION 'PIN sedang terkunci' USING HINT = 'PIN_TERKUNCI';
    END IF;

    -- Limit harian (F-17) — kantin & vending saja
    IF d.layanan IN ('kantin', 'vending') AND p_jenis = 'belanja' THEN
        lim := limit_harian_efektif(sid);
        sudah := belanja_hari(sid, tgl_sekolah(COALESCE(p_waktu_terminal, now())));
        IF sudah + p_total > lim THEN
            RAISE EXCEPTION 'melebihi limit harian Rp % (sudah terpakai Rp %)', lim, sudah USING HINT = 'LIMIT_HARIAN';
        END IF;
    END IF;

    SELECT p.transaksi_id, p.baru INTO tid, brand
      FROM posting(p_jenis, akun_siswa(sid), akun_pendapatan(d.layanan), p_total, sid,
                   p_idem, d.id, kid, d.layanan, p_keterangan, p_pin_ok, p_offline,
                   p_waktu_terminal, NULL, NULL, p_status, p_uid IS NULL, p_oleh) p;
    IF brand THEN
        PERFORM catat_item(tid, p_items);
    END IF;

    RETURN QUERY SELECT t.id, t.kode, brand, sid, snama, saldo_siswa(sid), t.total_rp FROM transaksi t WHERE t.id = tid;
END $$ LANGUAGE plpgsql;

-- Denda (perpus, asrama) — tanpa limit harian, tanpa device wajib.
CREATE OR REPLACE FUNCTION denda(
    p_siswa_id BIGINT, p_total BIGINT, p_layanan jenis_layanan, p_keterangan TEXT,
    p_oleh TEXT, p_pin_ok BOOLEAN DEFAULT FALSE, p_idem TEXT DEFAULT NULL, p_device_id BIGINT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE tid BIGINT; ambang BIGINT := kebijakan_int('ambang_pin_rp');
BEGIN
    IF p_total > ambang AND NOT p_pin_ok THEN
        RAISE EXCEPTION 'denda di atas Rp % wajib PIN', ambang USING HINT = 'BUTUH_PIN';
    END IF;
    SELECT p.transaksi_id INTO tid
      FROM posting('denda', akun_siswa(p_siswa_id), akun_pendapatan(p_layanan), p_total, p_siswa_id,
                   p_idem, p_device_id, NULL, p_layanan, p_keterangan, p_pin_ok, FALSE, now(),
                   NULL, NULL, 'selesai', FALSE, p_oleh) p;
    RETURN tid;
END $$ LANGUAGE plpgsql;

-- Tagihan menunggu → bayar dari wallet (portal ortu / TU).
CREATE OR REPLACE FUNCTION tagihan_bayar(p_tagihan_id BIGINT, p_oleh TEXT) RETURNS BIGINT AS $$
DECLARE t tagihan; tid BIGINT;
BEGIN
    SELECT * INTO t FROM tagihan WHERE id = p_tagihan_id FOR UPDATE;
    IF t.id IS NULL THEN RAISE EXCEPTION 'tagihan tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    IF t.status <> 'menunggu' THEN RAISE EXCEPTION 'tagihan sudah %', t.status USING HINT = 'STATUS_TIDAK_SESUAI'; END IF;
    -- pembayaran tagihan dari portal: ortu sudah login → dianggap terverifikasi (bukan tap kartu)
    tid := denda(t.siswa_id, t.nominal_rp, t.sumber, t.keterangan, p_oleh, TRUE, 'tagihan:' || t.id, NULL);
    UPDATE tagihan SET status = 'lunas', transaksi_id = tid, diselesaikan = now(), oleh = p_oleh WHERE id = t.id;
    RETURN tid;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tagihan_bebaskan(p_tagihan_id BIGINT, p_oleh TEXT, p_alasan TEXT) RETURNS VOID AS $$
BEGIN
    IF coalesce(p_alasan, '') = '' THEN RAISE EXCEPTION 'alasan wajib' USING HINT = 'ALASAN_WAJIB'; END IF;
    UPDATE tagihan SET status = 'dibebaskan', diselesaikan = now(), oleh = p_oleh
     WHERE id = p_tagihan_id AND status = 'menunggu';
    IF NOT FOUND THEN RAISE EXCEPTION 'tagihan tidak ditemukan / sudah selesai' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    PERFORM catat_audit(p_oleh, NULL, 'bebaskan_tagihan', 'tagihan:' || p_tagihan_id, jsonb_build_object('alasan', p_alasan));
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 6. TOP-UP (F-20–F-24)
-- ---------------------------------------------------------------------
-- Langkah 1 (portal): buat tagihan lokal, status menunggu. Aplikasi lalu
-- membuat invoice di gateway dan menyimpan id/url-nya dengan topup_set_invoice().
CREATE OR REPLACE FUNCTION topup_buat(p_siswa_id BIGINT, p_nominal BIGINT, p_gateway TEXT, p_oleh TEXT)
RETURNS BIGINT AS $$
DECLARE mn BIGINT := kebijakan_int('topup_min_rp'); mx BIGINT := kebijakan_int('topup_max_rp');
        plafon BIGINT := kebijakan_int('plafon_saldo_rp'); s BIGINT; tid BIGINT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM siswa WHERE id = p_siswa_id AND status IN ('aktif', 'cuti')) THEN
        RAISE EXCEPTION 'siswa tidak aktif' USING HINT = 'SISWA_NONAKTIF';
    END IF;
    IF p_nominal < mn OR p_nominal > mx THEN
        RAISE EXCEPTION 'nominal top-up harus antara Rp % dan Rp %', mn, mx USING HINT = 'NOMINAL_DI_LUAR_BATAS';
    END IF;
    s := saldo_siswa(p_siswa_id);
    IF s + p_nominal > plafon THEN
        RAISE EXCEPTION 'saldo akan melebihi plafon Rp % (saldo sekarang Rp %)', plafon, s USING HINT = 'MELEBIHI_PLAFON';
    END IF;
    INSERT INTO topup (siswa_id, nominal_rp, gateway) VALUES (p_siswa_id, p_nominal, p_gateway) RETURNING id INTO tid;
    PERFORM catat_audit(p_oleh, NULL, 'buat_topup', 'topup:' || tid, jsonb_build_object('nominal_rp', p_nominal, 'gateway', p_gateway));
    RETURN tid;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION topup_set_invoice(p_topup_id BIGINT, p_invoice_id TEXT, p_url TEXT, p_kedaluwarsa TIMESTAMPTZ)
RETURNS VOID AS $$
BEGIN
    UPDATE topup SET invoice_id = p_invoice_id, invoice_url = p_url, kedaluwarsa = p_kedaluwarsa
     WHERE id = p_topup_id AND status = 'menunggu';
    IF NOT FOUND THEN RAISE EXCEPTION 'topup tidak ditemukan / bukan menunggu' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
END $$ LANGUAGE plpgsql;

-- Langkah 2 (webhook terverifikasi): saldo bertambah. Idempoten pada invoice_id (F-22).
CREATE OR REPLACE FUNCTION topup_lunas(p_invoice_id TEXT, p_dibayar TIMESTAMPTZ DEFAULT now(), p_nominal_dibayar BIGINT DEFAULT NULL)
RETURNS TABLE (topup_id BIGINT, transaksi_id BIGINT, baru BOOLEAN, siswa_id BIGINT, saldo_rp BIGINT) AS $$
DECLARE t topup; tid BIGINT; brand BOOLEAN;
BEGIN
    SELECT * INTO t FROM topup WHERE invoice_id = p_invoice_id FOR UPDATE;
    IF t.id IS NULL THEN RAISE EXCEPTION 'invoice % tidak dikenal', p_invoice_id USING HINT = 'INVOICE_TIDAK_DIKENAL'; END IF;
    IF t.status = 'lunas' THEN
        RETURN QUERY SELECT t.id, t.transaksi_id, FALSE, t.siswa_id, saldo_siswa(t.siswa_id);
        RETURN;
    END IF;
    IF p_nominal_dibayar IS NOT NULL AND p_nominal_dibayar <> t.nominal_rp THEN
        RAISE EXCEPTION 'nominal dibayar (Rp %) tidak sama dengan tagihan (Rp %)', p_nominal_dibayar, t.nominal_rp
            USING HINT = 'NOMINAL_BEDA';
    END IF;
    SELECT p.transaksi_id, p.baru INTO tid, brand
      FROM posting('topup', akun_kode('GATEWAY'), akun_siswa(t.siswa_id), t.nominal_rp, t.siswa_id,
                   'topup:' || p_invoice_id, NULL, NULL, 'topup', 'Top-up via ' || t.gateway, FALSE, FALSE,
                   p_dibayar, NULL, p_invoice_id, 'selesai', FALSE, 'gateway:' || t.gateway) p;
    UPDATE topup SET status = 'lunas', transaksi_id = tid, dibayar = p_dibayar WHERE id = t.id;
    PERFORM notifikasi_wali(t.siswa_id, 'topup_berhasil', 'Top-up berhasil',
        format('Top-up Rp %s masuk ke saldo. Saldo sekarang Rp %s.', rp_teks(t.nominal_rp), rp_teks(saldo_siswa(t.siswa_id))));
    RETURN QUERY SELECT t.id, tid, brand, t.siswa_id, saldo_siswa(t.siswa_id);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION topup_gagal(p_invoice_id TEXT, p_status status_topup DEFAULT 'kedaluwarsa') RETURNS VOID AS $$
BEGIN
    IF p_status NOT IN ('kedaluwarsa', 'gagal') THEN RAISE EXCEPTION 'status harus kedaluwarsa/gagal' USING HINT = 'NILAI_TIDAK_VALID'; END IF;
    UPDATE topup SET status = p_status WHERE invoice_id = p_invoice_id AND status = 'menunggu';
END $$ LANGUAGE plpgsql;

-- Top-up tunai di TU (F-23): dua staf berbeda, akun kas terpisah, tampil terpisah.
CREATE OR REPLACE FUNCTION topup_tunai(p_siswa_id BIGINT, p_nominal BIGINT, p_input_oleh TEXT, p_disetujui_oleh TEXT, p_catatan TEXT DEFAULT NULL)
RETURNS TABLE (topup_id BIGINT, transaksi_id BIGINT, saldo_rp BIGINT) AS $$
DECLARE tid BIGINT; tpid BIGINT; mx BIGINT := kebijakan_int('topup_max_rp'); plafon BIGINT := kebijakan_int('plafon_saldo_rp');
BEGIN
    IF lower(p_input_oleh) = lower(p_disetujui_oleh) THEN
        RAISE EXCEPTION 'top-up tunai butuh dua staf berbeda (yang input ≠ yang menyetujui)' USING HINT = 'DUA_TANDA_TANGAN';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM staf WHERE email = lower(p_input_oleh) AND aktif)
       OR NOT EXISTS (SELECT 1 FROM staf WHERE email = lower(p_disetujui_oleh) AND aktif) THEN
        RAISE EXCEPTION 'kedua penanda tangan harus staf aktif' USING HINT = 'STAF_TIDAK_DIKENAL';
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
    PERFORM catat_audit(lower(p_input_oleh), 'tu', 'topup_tunai', 'siswa:' || p_siswa_id,
        jsonb_build_object('nominal_rp', p_nominal, 'disetujui_oleh', lower(p_disetujui_oleh), 'transaksi_id', tid, 'catatan', p_catatan));
    PERFORM notifikasi_wali(p_siswa_id, 'topup_berhasil', 'Top-up tunai diterima',
        format('Top-up tunai Rp %s dicatat oleh TU. Saldo sekarang Rp %s.', rp_teks(p_nominal), rp_teks(saldo_siswa(p_siswa_id))));
    RETURN QUERY SELECT tpid, tid, saldo_siswa(p_siswa_id);
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 7. REFUND / KOREKSI / PENARIKAN / BATAL KASIR (F-13, F-16, F-45)
-- ---------------------------------------------------------------------
-- Akun asal & tujuan sebuah transaksi (dari ledger-nya sendiri).
CREATE OR REPLACE FUNCTION akun_transaksi(p_transaksi_id BIGINT, OUT dari BIGINT, OUT ke BIGINT) AS $$
    SELECT (SELECT akun_id FROM entri_ledger WHERE transaksi_id = p_transaksi_id AND nominal_rp < 0 LIMIT 1),
           (SELECT akun_id FROM entri_ledger WHERE transaksi_id = p_transaksi_id AND nominal_rp > 0 LIMIT 1);
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION sudah_direfund(p_transaksi_id BIGINT) RETURNS BIGINT AS $$
    SELECT COALESCE(SUM(total_rp), 0) FROM transaksi
     WHERE ref_transaksi_id = p_transaksi_id AND jenis = 'refund' AND status = 'selesai';
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION refund(p_transaksi_id BIGINT, p_nominal BIGINT, p_alasan TEXT, p_oleh TEXT, p_idem TEXT DEFAULT NULL)
RETURNS BIGINT AS $$
DECLARE asal transaksi; ak RECORD; sisa BIGINT; tid BIGINT;
BEGIN
    IF coalesce(p_alasan, '') = '' THEN RAISE EXCEPTION 'alasan refund wajib' USING HINT = 'ALASAN_WAJIB'; END IF;
    SELECT * INTO asal FROM transaksi WHERE id = p_transaksi_id FOR UPDATE;
    IF asal.id IS NULL THEN RAISE EXCEPTION 'transaksi asal tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    IF asal.jenis NOT IN ('belanja', 'denda') OR asal.status <> 'selesai' THEN
        RAISE EXCEPTION 'hanya belanja/denda berstatus selesai yang bisa direfund (ini: % %)', asal.jenis, asal.status
            USING HINT = 'TIDAK_BISA_REFUND';
    END IF;
    sisa := asal.total_rp - sudah_direfund(asal.id);
    IF p_nominal IS NULL THEN p_nominal := sisa; END IF;
    IF p_nominal <= 0 OR p_nominal > sisa THEN
        RAISE EXCEPTION 'nominal refund maksimal Rp % (sisa yang belum direfund)', sisa USING HINT = 'MELEBIHI_ASAL';
    END IF;
    ak := akun_transaksi(asal.id);
    SELECT p.transaksi_id INTO tid
      FROM posting('refund', ak.ke, ak.dari, p_nominal, asal.siswa_id,
                   COALESCE(p_idem, 'refund:' || asal.id || ':' || sudah_direfund(asal.id)),
                   asal.device_id, asal.kartu_id, asal.layanan, 'Refund: ' || p_alasan, FALSE, FALSE, now(),
                   asal.id, NULL, 'selesai', FALSE, p_oleh) p;
    PERFORM catat_audit(p_oleh, NULL, 'refund', 'transaksi:' || asal.id,
        jsonb_build_object('nominal_rp', p_nominal, 'alasan', p_alasan, 'refund_id', tid));
    RETURN tid;
END $$ LANGUAGE plpgsql;

-- Koreksi: nominal positif = saldo siswa bertambah, negatif = berkurang.
CREATE OR REPLACE FUNCTION koreksi(p_siswa_id BIGINT, p_nominal BIGINT, p_alasan TEXT, p_oleh TEXT, p_ref_transaksi_id BIGINT)
RETURNS BIGINT AS $$
DECLARE tid BIGINT; kor BIGINT := akun_kode('KOREKSI'); sis BIGINT := akun_siswa(p_siswa_id);
BEGIN
    IF coalesce(p_alasan, '') = '' THEN RAISE EXCEPTION 'alasan koreksi wajib' USING HINT = 'ALASAN_WAJIB'; END IF;
    IF p_ref_transaksi_id IS NULL THEN RAISE EXCEPTION 'koreksi wajib menunjuk transaksi asal (F-16)' USING HINT = 'REF_WAJIB'; END IF;
    IF p_nominal = 0 THEN RAISE EXCEPTION 'nominal koreksi 0' USING HINT = 'NOMINAL_TIDAK_VALID'; END IF;
    SELECT p.transaksi_id INTO tid
      FROM posting('koreksi',
                   CASE WHEN p_nominal > 0 THEN kor ELSE sis END,
                   CASE WHEN p_nominal > 0 THEN sis ELSE kor END,
                   abs(p_nominal), p_siswa_id, NULL, NULL, NULL,
                   (SELECT layanan FROM transaksi WHERE id = p_ref_transaksi_id),
                   'Koreksi: ' || p_alasan, FALSE, FALSE, now(), p_ref_transaksi_id, NULL, 'selesai', FALSE, p_oleh) p;
    PERFORM catat_audit(p_oleh, NULL, 'koreksi', 'siswa:' || p_siswa_id,
        jsonb_build_object('nominal_rp', p_nominal, 'alasan', p_alasan, 'ref', p_ref_transaksi_id, 'koreksi_id', tid));
    RETURN tid;
END $$ LANGUAGE plpgsql;

-- Penarikan sisa saldo saat siswa lulus/pindah/keluar (§9). Uang keluar
-- lewat kas TU; bukti transfer wajib ditulis.
CREATE OR REPLACE FUNCTION penarikan(p_siswa_id BIGINT, p_bukti TEXT, p_oleh TEXT, p_nominal BIGINT DEFAULT NULL)
RETURNS BIGINT AS $$
DECLARE st status_siswa; s BIGINT; tid BIGINT;
BEGIN
    IF coalesce(p_bukti, '') = '' THEN RAISE EXCEPTION 'bukti transfer/pengembalian wajib' USING HINT = 'BUKTI_WAJIB'; END IF;
    SELECT status INTO st FROM siswa WHERE id = p_siswa_id;
    IF st IS NULL THEN RAISE EXCEPTION 'siswa tidak ditemukan' USING HINT = 'TIDAK_DITEMUKAN'; END IF;
    IF st NOT IN ('lulus', 'pindah', 'keluar') THEN
        RAISE EXCEPTION 'penarikan hanya untuk siswa lulus/pindah/keluar (status: %)', st USING HINT = 'SISWA_MASIH_AKTIF';
    END IF;
    s := saldo_siswa(p_siswa_id);
    IF p_nominal IS NULL THEN p_nominal := s; END IF;
    IF p_nominal <= 0 THEN RAISE EXCEPTION 'tidak ada saldo untuk ditarik' USING HINT = 'SALDO_KOSONG'; END IF;
    SELECT p.transaksi_id INTO tid
      FROM posting('penarikan', akun_siswa(p_siswa_id), akun_kode('KAS_TU'), p_nominal, p_siswa_id,
                   NULL, NULL, NULL, NULL, 'Pengembalian saldo — bukti: ' || p_bukti, FALSE, FALSE, now(),
                   NULL, p_bukti, 'selesai', FALSE, p_oleh) p;
    PERFORM catat_audit(p_oleh, NULL, 'penarikan', 'siswa:' || p_siswa_id,
        jsonb_build_object('nominal_rp', p_nominal, 'bukti', p_bukti, 'transaksi_id', tid));
    RETURN tid;
END $$ LANGUAGE plpgsql;

-- Pembatalan oleh kasir (F-45): hanya transaksi TERAKHIR terminal itu,
-- hanya dalam N menit, refund penuh, tercatat.
CREATE OR REPLACE FUNCTION batal_kasir(p_device_kode TEXT, p_transaksi_id BIGINT)
RETURNS BIGINT AS $$
DECLARE d device; asal transaksi; terakhir BIGINT; menit INTEGER := kebijakan_int('batal_kasir_menit'); tid BIGINT;
BEGIN
    d := device_aktif(p_device_kode);
    SELECT * INTO asal FROM transaksi WHERE id = p_transaksi_id;
    IF asal.id IS NULL OR asal.device_id <> d.id THEN
        RAISE EXCEPTION 'transaksi bukan milik terminal ini' USING HINT = 'TIDAK_DITEMUKAN';
    END IF;
    SELECT id INTO terakhir FROM transaksi WHERE device_id = d.id AND jenis = 'belanja' ORDER BY id DESC LIMIT 1;
    IF terakhir <> asal.id THEN
        RAISE EXCEPTION 'kasir hanya bisa membatalkan transaksi terakhir — selebihnya lewat refund keuangan' USING HINT = 'BUKAN_TERAKHIR';
    END IF;
    IF asal.dibuat < now() - make_interval(mins => menit) THEN
        RAISE EXCEPTION 'jendela pembatalan % menit sudah lewat — ajukan refund ke keuangan', menit USING HINT = 'LEWAT_WAKTU';
    END IF;
    IF sudah_direfund(asal.id) > 0 THEN
        RAISE EXCEPTION 'transaksi sudah dibatalkan/direfund' USING HINT = 'SUDAH_REFUND';
    END IF;
    tid := refund(asal.id, NULL, 'Pembatalan kasir', 'device:' || d.kode, 'batal:' || asal.id);
    RETURN tid;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 8. ANTRIAN OFFLINE (F-43, F-44)
-- ---------------------------------------------------------------------
-- Terima kiriman terminal: [{idempotency_key, kartu_uid, nominal_rp, waktu_terminal, keterangan, items}]
CREATE OR REPLACE FUNCTION antrian_terima(p_device_kode TEXT, p_items JSONB)
RETURNS TABLE (diterima INTEGER, duplikat INTEGER) AS $$
DECLARE d device; n INTEGER; total INTEGER;
BEGIN
    d := device_aktif(p_device_kode);
    total := COALESCE(jsonb_array_length(p_items), 0);
    INSERT INTO antrian_offline (device_id, idempotency_key, kartu_uid, nominal_rp, waktu_terminal, payload)
    SELECT d.id, x->>'idempotency_key', upper(x->>'kartu_uid'), (x->>'nominal_rp')::BIGINT,
           (x->>'waktu_terminal')::TIMESTAMPTZ, x
      FROM jsonb_array_elements(p_items) x
    ON CONFLICT (idempotency_key) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    UPDATE device SET terakhir_online = now(), terakhir_sinkron = now() WHERE id = d.id;
    RETURN QUERY SELECT n, total - n;
END $$ LANGUAGE plpgsql;

-- Proses antrian: tiap item dalam sub-transaksi sendiri. Gagal (saldo
-- habis dipakai di terminal lain, kartu diblokir, dsb.) → 'ditolak' dengan
-- alasan, tidak menghentikan item lain, tidak hilang diam-diam.
CREATE OR REPLACE FUNCTION antrian_proses(p_device_kode TEXT DEFAULT NULL)
RETURNS TABLE (diproses INTEGER, ditolak INTEGER) AS $$
DECLARE q RECORD; r RECORD; ok INTEGER := 0; gagal INTEGER := 0; pesan TEXT; kode_err TEXT;
BEGIN
    FOR q IN
        SELECT a.*, d.kode AS device_kode FROM antrian_offline a JOIN device d ON d.id = a.device_id
         WHERE a.status = 'menunggu' AND (p_device_kode IS NULL OR d.kode = p_device_kode)
         ORDER BY a.waktu_terminal, a.id
         FOR UPDATE OF a SKIP LOCKED
    LOOP
        BEGIN
            SELECT * INTO r FROM bayar(q.device_kode, q.idempotency_key, q.kartu_uid, q.nominal_rp,
                                       COALESCE(q.payload->>'keterangan', 'Belanja kantin (offline)'),
                                       FALSE, TRUE, q.waktu_terminal, NULL, q.payload->'items');
            -- paksa constraint trigger (seimbang, saldo ≥ 0) dievaluasi SEKARANG,
            -- di dalam sub-transaksi ini, supaya kegagalan tertangkap di bawah.
            SET CONSTRAINTS ALL IMMEDIATE;
            SET CONSTRAINTS ALL DEFERRED;
            UPDATE antrian_offline SET status = 'diproses', transaksi_id = r.transaksi_id WHERE id = q.id;
            ok := ok + 1;
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS pesan = MESSAGE_TEXT, kode_err = PG_EXCEPTION_HINT;
            SET CONSTRAINTS ALL DEFERRED;
            UPDATE antrian_offline SET status = 'ditolak', alasan_tolak = pesan WHERE id = q.id;
            PERFORM catat_audit('device:' || q.device_kode, 'terminal', 'offline_ditolak', 'antrian_offline:' || q.id,
                jsonb_build_object('uid', q.kartu_uid, 'nominal_rp', q.nominal_rp, 'alasan', pesan, 'kode', kode_err));
            gagal := gagal + 1;
        END;
    END LOOP;
    RETURN QUERY SELECT ok, gagal;
END $$ LANGUAGE plpgsql;
