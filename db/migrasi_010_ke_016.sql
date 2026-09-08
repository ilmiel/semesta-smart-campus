-- =====================================================================
-- GABUNGAN MIGRASI 010 SAMPAI 016 (Semesta Smart Campus)
-- Siap dijalankan di SQL Editor Neon / Supabase / PostgreSQL GUI
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- BERKAS: 010_perbaikan_audit.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- 010 — Perbaikan hasil audit keamanan 3 September 2026
--
-- Rujukan: claude/smart-campus/audit-keamanan-2026-09-03.md (bagian 1)
--          claude/smart-campus/audit-keamanan-bagian-2.md
--
-- Setiap blok di bawah menyebut nomor temuannya. Jangan menghapus komentar
-- itu — kalau ada yang mempertanyakan "kenapa ribet begini", jawabannya ada
-- di dokumen audit dengan bukti SQL-nya.
-- =====================================================================
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- §1.1 KRITIS — kunci idempotensi diberi ruang nama per perangkat
--
-- Sebelumnya kunci idempotensi hidup di satu ruang global. Akibatnya:
--   a) terminal A memakai kunci yang sudah dipakai terminal B → penjualan
--      "berhasil" tanpa memotong siapa pun;
--   b) terminal bisa menebak kunci internal ('topup:<invoice>',
--      'tagihan:<id>', 'po:<kode>', ...) dan memakainya lebih dulu →
--      pembayaran orang tua ditelan: saldo tidak bertambah, invoice
--      tercatat lunas, notifikasi "Top-up berhasil" tetap terkirim.
--
-- Perbaikan: SEMUA kunci yang masuk lewat bayar() diberi awalan
-- 'dev<id>:'. Terminal karena itu secara struktural tidak bisa menyentuh
-- ruang nama internal, dan kunci yang sama dari dua terminal berbeda
-- adalah dua kunci berbeda.
--
-- Pemanggil internal (topup_lunas, tagihan_bayar, refund, po_*, ...)
-- memanggil posting() langsung, bukan bayar(), jadi tidak terpengaruh.
-- ---------------------------------------------------------------------

-- Satu sumber kebenaran untuk awalan kunci idempotensi terminal.
-- Dipakai bayar() dan vending_mulai() supaya keduanya tidak pernah berbeda.
CREATE OR REPLACE FUNCTION idem_perangkat(p_device_id BIGINT, p_idem TEXT) RETURNS TEXT AS $$
    SELECT CASE WHEN p_idem IS NULL THEN NULL ELSE 'dev' || p_device_id || ':' || p_idem END;
$$ LANGUAGE sql IMMUTABLE;

-- §2.2 sekalian: refund ditanggalkan menurut transaksi ASALNYA.
-- Sebelumnya refund transaksi kemarin mengurangi belanja HARI INI, sehingga
-- belanja_hari bisa negatif dan limit harian hari ini jebol.
CREATE OR REPLACE FUNCTION belanja_hari(p_siswa_id BIGINT, p_tanggal DATE) RETURNS BIGINT AS $$
    SELECT COALESCE(SUM(CASE WHEN t.jenis = 'belanja' THEN t.total_rp
                             WHEN t.jenis = 'refund'  THEN -t.total_rp END), 0)
      FROM transaksi t
     WHERE t.siswa_id = p_siswa_id
       AND t.layanan IN ('kantin', 'vending')
       AND t.status IN ('pending', 'selesai')
       AND tgl_sekolah(
             CASE WHEN t.jenis = 'refund'
                  THEN (SELECT a.waktu_terminal FROM transaksi a WHERE a.id = t.ref_transaksi_id)
                  ELSE t.waktu_terminal END) = p_tanggal
       AND (t.jenis = 'belanja'
            OR (t.jenis = 'refund' AND EXISTS (SELECT 1 FROM transaksi a WHERE a.id = t.ref_transaksi_id AND a.status = 'selesai')));
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- B2.7 — setiap pergerakan uang meninggalkan jejak audit
--
-- posting() tidak pernah menulis audit_log sama sekali. Dua puluh fungsi
-- ikut terdampak: bayar, denda, tagihan_bayar, topup_lunas, batal_kasir,
-- bayar_menu, po_*, laundry_*, perpus_kembali, vending_*.
-- Asimetri terparah: tagihan_bebaskan mencatat audit, tagihan_bayar tidak
-- — membebaskan denda terlacak, menagihnya tidak.
--
-- Satu catat_audit di sini menutup semuanya, karena semua bermuara ke sini.
-- Standar wajib proyek: "Audit log untuk semua transaksi keuangan."
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION posting(
    p_jenis          jenis_transaksi,
    p_dari_akun      BIGINT,
    p_ke_akun        BIGINT,
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
    boleh BOOLEAN; nm TEXT; s BIGINT; dkode TEXT;
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

    PERFORM 1 FROM akun WHERE id IN (p_dari_akun, p_ke_akun) ORDER BY id FOR UPDATE;

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

    -- Jejak audit (B2.7). Aktor: siapa pun yang tercatat di p_oleh; kalau
    -- kosong, perangkatnya. Objek: siswa kalau ada, kalau tidak transaksinya.
    IF p_device_id IS NOT NULL THEN
        SELECT kode INTO dkode FROM device WHERE id = p_device_id;
    END IF;
    PERFORM catat_audit(
        COALESCE(p_oleh, CASE WHEN dkode IS NOT NULL THEN 'device:' || dkode ELSE 'sistem' END),
        NULL,
        'posting_' || p_jenis::text,
        CASE WHEN p_siswa_id IS NOT NULL THEN 'siswa:' || p_siswa_id ELSE 'transaksi:' || transaksi_id END,
        jsonb_build_object('transaksi_id', transaksi_id, 'total_rp', p_total, 'jenis', p_jenis,
                           'status', p_status, 'layanan', p_layanan, 'idem', p_idem,
                           'offline', p_offline, 'pakai_pin', p_pakai_pin));
    baru := TRUE;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- §1.1 + §2.1 + §3.4 — bayar()
--
-- §1.1  kunci diberi awalan perangkat; saat kiriman ulang, perangkat dan
--       nominalnya diverifikasi, bukan langsung dianggap sama.
-- §2.1  p_waktu_terminal datang dari klien dan sebelumnya tidak divalidasi,
--       padahal limit harian dihitung untuk tanggal jam itu. Terminal
--       dengan jam salah (atau dioprek) bisa belanja tanpa batas.
-- §3.4  p_jenis/p_status terbuka untuk pemanggil: 'denda'/'penarikan'
--       melewati limit harian, dan status 'pending'/'batal' menciptakan
--       uang yang tidak bisa direfund lewat jalur mana pun.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bayar(
    p_device_kode    TEXT,
    p_idem           TEXT,
    p_uid            TEXT,
    p_total          BIGINT,
    p_keterangan     TEXT,
    p_pin_ok         BOOLEAN DEFAULT FALSE,
    p_offline        BOOLEAN DEFAULT FALSE,
    p_waktu_terminal TIMESTAMPTZ DEFAULT now(),
    p_nis            TEXT DEFAULT NULL,
    p_items          JSONB DEFAULT NULL,
    p_jenis          jenis_transaksi DEFAULT 'belanja',
    p_status         status_transaksi DEFAULT 'selesai',
    p_oleh           TEXT DEFAULT NULL
) RETURNS TABLE (transaksi_id BIGINT, kode TEXT, baru BOOLEAN, siswa_id BIGINT, nama TEXT, saldo_rp BIGINT, total_rp BIGINT) AS $$
DECLARE
    d device; sid BIGINT; kid BIGINT; snama TEXT;
    ambang BIGINT := kebijakan_int('ambang_pin_rp');
    r RECORD; lim BIGINT; sudah BIGINT; total_item BIGINT; tid BIGINT; brand BOOLEAN;
    wt TIMESTAMPTZ; ada RECORD;
BEGIN
    IF p_idem IS NULL OR length(p_idem) < 8 THEN
        RAISE EXCEPTION 'idempotency key wajib (min 8 karakter)' USING HINT = 'IDEM_WAJIB';
    END IF;
    d := device_aktif(p_device_kode);

    -- §3.4 bayar() hanya untuk belanja. Denda lewat denda(), penarikan
    -- lewat penarikan() — keduanya punya aturan sendiri.
    IF p_jenis <> 'belanja' THEN
        RAISE EXCEPTION 'bayar() hanya untuk belanja (diminta: %)', p_jenis USING HINT = 'JENIS_TIDAK_VALID';
    END IF;
    -- Status selain 'selesai' hanya untuk vending (dua fase: pending → selesai/batal).
    IF p_status <> 'selesai' AND d.layanan <> 'vending' THEN
        RAISE EXCEPTION 'status % hanya untuk vending', p_status USING HINT = 'STATUS_TIDAK_SESUAI';
    END IF;

    -- §2.1 Jam terminal harus masuk akal.
    --   online : maksimal meleset 5 menit dari jam server;
    --   offline: boleh mundur sampai 48 jam (durasi padam wajar), tidak
    --            boleh ke depan.
    wt := COALESCE(p_waktu_terminal, now());
    IF p_offline THEN
        IF wt > now() + interval '5 minutes' OR wt < now() - interval '48 hours' THEN
            RAISE EXCEPTION 'waktu transaksi offline di luar jendela yang wajar (%)', wt
                USING HINT = 'WAKTU_TIDAK_VALID';
        END IF;
    ELSE
        IF abs(extract(epoch FROM (now() - wt))) > 300 THEN
            RAISE EXCEPTION 'jam terminal meleset lebih dari 5 menit dari server (%) — setel ulang jam terminal', wt
                USING HINT = 'WAKTU_TIDAK_VALID';
        END IF;
    END IF;

    -- Total dihitung server dari item lebih dulu, supaya pemeriksaan
    -- kiriman ulang di bawah bisa membandingkan nominal.
    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        SELECT COALESCE(SUM((x->>'harga_rp')::BIGINT * COALESCE((x->>'qty')::INTEGER, 1)), 0)
          INTO total_item FROM jsonb_array_elements(p_items) x;
        IF p_total IS NOT NULL AND p_total <> total_item THEN
            RAISE EXCEPTION 'total (Rp %) tidak sama dengan jumlah item (Rp %)', p_total, total_item USING HINT = 'TOTAL_BEDA';
        END IF;
        p_total := total_item;
    END IF;

    -- §1.1 Ruang nama per perangkat. Setelah baris ini, kunci dari terminal
    -- tidak mungkin bertabrakan dengan kunci terminal lain maupun dengan
    -- ruang nama internal ('topup:', 'tagihan:', 'po:', ...).
    p_idem := idem_perangkat(d.id, p_idem);

    -- Kiriman ulang: verifikasi, jangan asal kembalikan.
    SELECT t.id, t.device_id, t.total_rp INTO ada FROM transaksi t WHERE t.idempotency_key = p_idem;
    IF ada.id IS NOT NULL THEN
        IF ada.device_id IS DISTINCT FROM d.id THEN
            RAISE EXCEPTION 'idempotency key dipakai terminal lain' USING HINT = 'IDEMPOTENSI_BEDA';
        END IF;
        IF p_total IS NOT NULL AND ada.total_rp <> p_total THEN
            RAISE EXCEPTION 'idempotency key % sudah dipakai untuk nominal berbeda (Rp %)', p_idem, ada.total_rp
                USING HINT = 'IDEMPOTENSI_BEDA';
        END IF;
        RETURN QUERY SELECT t.id, t.kode, FALSE, t.siswa_id, s.nama, saldo_siswa(t.siswa_id), t.total_rp
                       FROM transaksi t JOIN siswa s ON s.id = t.siswa_id WHERE t.id = ada.id;
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

    -- Offline (F-43)
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

    -- Limit harian (F-17)
    IF d.layanan IN ('kantin', 'vending') THEN
        lim := limit_harian_efektif(sid);
        sudah := belanja_hari(sid, tgl_sekolah(wt));
        IF sudah + p_total > lim THEN
            RAISE EXCEPTION 'melebihi limit harian Rp % (sudah terpakai Rp %)', lim, sudah USING HINT = 'LIMIT_HARIAN';
        END IF;
    END IF;

    SELECT p.transaksi_id, p.baru INTO tid, brand
      FROM posting(p_jenis, akun_siswa(sid), akun_pendapatan(d.layanan), p_total, sid,
                   p_idem, d.id, kid, d.layanan, p_keterangan, p_pin_ok, p_offline,
                   wt, NULL, NULL, p_status, p_uid IS NULL, p_oleh) p;
    IF brand THEN
        PERFORM catat_item(tid, p_items);
    END IF;

    RETURN QUERY SELECT t.id, t.kode, brand, sid, snama, saldo_siswa(sid), t.total_rp FROM transaksi t WHERE t.id = tid;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- §2.4 — batal_kasir: perbandingan NULL membuat penjaga tidak menyala
--
-- 'asal.device_id <> d.id' bernilai NULL (bukan TRUE) ketika transaksinya
-- tidak punya perangkat — yaitu PO dan tagihan yang dibayar lewat portal.
-- Akibatnya terminal mana pun bisa membatalkannya. Terbukti: controller
-- loker membatalkan transaksi PO; uang kembali, status PO tetap 'dibayar',
-- makanannya tetap bisa diambil.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION batal_kasir(p_device_kode TEXT, p_transaksi_id BIGINT)
RETURNS BIGINT AS $$
DECLARE d device; asal transaksi; terakhir BIGINT; menit INTEGER := kebijakan_int('batal_kasir_menit'); tid BIGINT;
BEGIN
    d := device_aktif(p_device_kode);
    SELECT * INTO asal FROM transaksi WHERE id = p_transaksi_id;
    -- IS DISTINCT FROM: NULL diperlakukan sebagai "berbeda", bukan "tidak tahu".
    IF asal.id IS NULL OR asal.device_id IS DISTINCT FROM d.id THEN
        RAISE EXCEPTION 'transaksi bukan milik terminal ini' USING HINT = 'TIDAK_DITEMUKAN';
    END IF;
    IF asal.jenis <> 'belanja' THEN
        RAISE EXCEPTION 'hanya transaksi belanja yang bisa dibatalkan kasir' USING HINT = 'TIDAK_BISA_REFUND';
    END IF;
    SELECT id INTO terakhir FROM transaksi WHERE device_id = d.id AND jenis = 'belanja' ORDER BY id DESC LIMIT 1;
    IF terakhir IS DISTINCT FROM asal.id THEN
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
-- §2.3 — plafon saldo dihitung termasuk invoice yang masih berjalan
--
-- Sebelumnya plafon hanya dicek per invoice atas saldo saat itu. Tiga
-- invoice Rp 500.000 dibuat berurutan (masing-masing lolos), ketiganya
-- dibayar → saldo Rp 1.711.000 dengan plafon Rp 1.000.000.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION topup_buat(p_siswa_id BIGINT, p_nominal BIGINT, p_gateway TEXT, p_oleh TEXT)
RETURNS BIGINT AS $$
DECLARE mn BIGINT := kebijakan_int('topup_min_rp'); mx BIGINT := kebijakan_int('topup_max_rp');
        plafon BIGINT := kebijakan_int('plafon_saldo_rp'); s BIGINT; menunggu BIGINT; tid BIGINT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM siswa WHERE id = p_siswa_id AND status IN ('aktif', 'cuti')) THEN
        RAISE EXCEPTION 'siswa tidak aktif' USING HINT = 'SISWA_NONAKTIF';
    END IF;
    IF p_nominal < mn OR p_nominal > mx THEN
        RAISE EXCEPTION 'nominal top-up harus antara Rp % dan Rp %', mn, mx USING HINT = 'NOMINAL_DI_LUAR_BATAS';
    END IF;
    s := saldo_siswa(p_siswa_id);
    -- Invoice yang belum dibayar tetap dihitung: kalau semuanya dibayar,
    -- plafon tidak boleh terlampaui.
    SELECT COALESCE(SUM(nominal_rp), 0) INTO menunggu
      FROM topup WHERE siswa_id = p_siswa_id AND status = 'menunggu';
    IF s + menunggu + p_nominal > plafon THEN
        RAISE EXCEPTION 'saldo akan melebihi plafon Rp % (saldo Rp %, top-up berjalan Rp %)',
            plafon, s, menunggu USING HINT = 'MELEBIHI_PLAFON';
    END IF;
    INSERT INTO topup (siswa_id, nominal_rp, gateway) VALUES (p_siswa_id, p_nominal, p_gateway) RETURNING id INTO tid;
    PERFORM catat_audit(p_oleh, NULL, 'buat_topup', 'topup:' || tid, jsonb_build_object('nominal_rp', p_nominal, 'gateway', p_gateway));
    RETURN tid;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- §3.7 — topup_lunas memeriksa gateway pemanggil
--
-- Sebelumnya webhook yang sah dari gateway A bisa melunasi invoice milik
-- gateway B. Belum bisa dieksploitasi hari ini (mayar masih menolak semua),
-- tapi harus benar sebelum modul mayar diisi.
--
-- Signature berubah → fungsi lama harus dibuang dulu agar tidak ambigu.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS topup_lunas(TEXT, TIMESTAMPTZ, BIGINT);
CREATE FUNCTION topup_lunas(p_invoice_id TEXT, p_dibayar TIMESTAMPTZ DEFAULT now(),
                            p_nominal_dibayar BIGINT DEFAULT NULL, p_gateway TEXT DEFAULT NULL)
RETURNS TABLE (topup_id BIGINT, transaksi_id BIGINT, baru BOOLEAN, siswa_id BIGINT, saldo_rp BIGINT) AS $$
DECLARE t topup; tid BIGINT; brand BOOLEAN; plafon BIGINT := kebijakan_int('plafon_saldo_rp');
BEGIN
    SELECT * INTO t FROM topup WHERE invoice_id = p_invoice_id FOR UPDATE;
    IF t.id IS NULL THEN RAISE EXCEPTION 'invoice % tidak dikenal', p_invoice_id USING HINT = 'INVOICE_TIDAK_DIKENAL'; END IF;
    IF t.status = 'lunas' THEN
        RETURN QUERY SELECT t.id, t.transaksi_id, FALSE, t.siswa_id, saldo_siswa(t.siswa_id);
        RETURN;
    END IF;
    IF p_gateway IS NOT NULL AND t.gateway IS DISTINCT FROM p_gateway THEN
        RAISE EXCEPTION 'invoice % milik gateway %, bukan %', p_invoice_id, t.gateway, p_gateway
            USING HINT = 'GATEWAY_BEDA';
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

    -- §2.3 Uang sudah diterima gateway, jadi TETAP dikreditkan walau
    -- melewati plafon — tapi ditandai supaya keuangan menindaklanjuti.
    IF saldo_siswa(t.siswa_id) > plafon THEN
        PERFORM catat_audit('sistem', NULL, 'plafon_terlampaui', 'siswa:' || t.siswa_id,
            jsonb_build_object('saldo_rp', saldo_siswa(t.siswa_id), 'plafon_rp', plafon, 'invoice', p_invoice_id));
    END IF;

    PERFORM notifikasi_wali(t.siswa_id, 'topup_berhasil', 'Top-up berhasil',
        format('Top-up Rp %s masuk ke saldo. Saldo sekarang Rp %s.', rp_teks(t.nominal_rp), rp_teks(saldo_siswa(t.siswa_id))));
    RETURN QUERY SELECT t.id, tid, brand, t.siswa_id, saldo_siswa(t.siswa_id);
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- §3.1 — kunci PIN tidak boleh dihapus oleh satu PIN benar
--
-- pin_catat(TRUE) mengosongkan terkunci_hingga tanpa memeriksa apakah
-- sedang terkunci. Kunci permanen ('infinity', kunci kedua) pun hilang.
-- Terbukti: setelah dua ronde 5x salah, satu pin_catat(TRUE) → bebas.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pin_catat(p_siswa_id BIGINT, p_berhasil BOOLEAN, p_device_id BIGINT DEFAULT NULL, p_ip INET DEFAULT NULL)
RETURNS TABLE (terkunci BOOLEAN, terkunci_hingga TIMESTAMPTZ, sisa_percobaan INTEGER) AS $$
DECLARE p pin_siswa; maks INTEGER := kebijakan_int('pin_maks_gagal'); menit INTEGER := kebijakan_int('pin_kunci_menit');
BEGIN
    INSERT INTO percobaan_pin (siswa_id, device_id, berhasil, ip) VALUES (p_siswa_id, p_device_id, p_berhasil, p_ip);
    SELECT * INTO p FROM pin_siswa WHERE siswa_id = p_siswa_id FOR UPDATE;
    IF p.siswa_id IS NULL THEN
        RAISE EXCEPTION 'siswa belum punya PIN' USING HINT = 'PIN_BELUM_ADA';
    END IF;

    -- Sedang terkunci: percobaannya TETAP tercatat (INSERT di atas tidak
    -- di-rollback karena kita tidak melempar error), tapi PIN benar pun
    -- tidak membuka kunci — hanya TU yang bisa lewat reset PIN.
    -- Ini menutup dua hal sekaligus: kunci permanen yang terhapus oleh satu
    -- PIN benar (§3.1), dan percobaan saat terkunci yang tidak tercatat.
    IF p.terkunci_hingga IS NOT NULL AND p.terkunci_hingga > now() THEN
        RETURN QUERY SELECT TRUE, p.terkunci_hingga, 0;
        RETURN;
    END IF;

    IF p_berhasil THEN
        -- jumlah_kunci sengaja TIDAK direset: "terkunci lagi → permanen"
        -- (docs/OPERASIONAL.md §6) berlaku seumur akun, bukan per sesi.
        UPDATE pin_siswa SET gagal = 0, terkunci_hingga = NULL WHERE siswa_id = p_siswa_id;
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
    RETURN QUERY SELECT p.terkunci_hingga IS NOT NULL AND p.terkunci_hingga > now(),
                        p.terkunci_hingga, GREATEST(maks - p.gagal, 0);
END $$ LANGUAGE plpgsql;

-- §3.1 lanjutan — denda() juga harus menghormati kunci PIN.
CREATE OR REPLACE FUNCTION denda(
    p_siswa_id BIGINT, p_total BIGINT, p_layanan jenis_layanan, p_keterangan TEXT,
    p_oleh TEXT, p_pin_ok BOOLEAN DEFAULT FALSE, p_idem TEXT DEFAULT NULL, p_device_id BIGINT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE tid BIGINT; ambang BIGINT := kebijakan_int('ambang_pin_rp');
BEGIN
    IF p_total IS NULL OR p_total <= 0 THEN
        RAISE EXCEPTION 'nominal denda harus lebih dari 0' USING HINT = 'NOMINAL_TIDAK_VALID';
    END IF;
    IF p_total > ambang AND NOT p_pin_ok THEN
        RAISE EXCEPTION 'denda di atas Rp % wajib PIN', ambang USING HINT = 'BUTUH_PIN';
    END IF;
    IF p_pin_ok AND EXISTS (SELECT 1 FROM pin_siswa WHERE pin_siswa.siswa_id = p_siswa_id AND terkunci_hingga > now()) THEN
        RAISE EXCEPTION 'PIN sedang terkunci' USING HINT = 'PIN_TERKUNCI';
    END IF;
    SELECT p.transaksi_id INTO tid
      FROM posting('denda', akun_siswa(p_siswa_id), akun_pendapatan(p_layanan), p_total, p_siswa_id,
                   p_idem, p_device_id, NULL, p_layanan, p_keterangan, p_pin_ok, FALSE,
                   now(), NULL, NULL, 'selesai', FALSE, p_oleh) p;
    RETURN tid;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- §2.1 lanjutan + §3.5 — antrian offline
--
-- §3.5 antrian_terima all-or-nothing: satu item rusak (nominal 0, waktu
--      kosong) menggagalkan SELURUH sinkron terminal, permanen — terminal
--      itu tidak akan pernah bisa menyetor antriannya.
-- §2.1 kumulatif offline per kartu tidak pernah ditegakkan di server;
--      komentar kebijakan bilang "dihitung terminal", dan terminal yang
--      dioprek tentu tidak menghitungnya.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION antrian_terima(p_device_kode TEXT, p_items JSONB)
RETURNS TABLE (diterima INTEGER, duplikat INTEGER) AS $$
DECLARE d device; x JSONB; n INTEGER := 0; dup INTEGER := 0;
BEGIN
    d := device_aktif(p_device_kode);
    FOR x IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
    LOOP
        BEGIN
            INSERT INTO antrian_offline (device_id, idempotency_key, kartu_uid, nominal_rp, waktu_terminal, payload)
            VALUES (d.id, x->>'idempotency_key', upper(x->>'kartu_uid'), (x->>'nominal_rp')::BIGINT,
                    (x->>'waktu_terminal')::TIMESTAMPTZ, x);
            n := n + 1;
        EXCEPTION WHEN OTHERS THEN
            -- Item cacat tidak menghentikan yang lain. Duplikat memang
            -- diharapkan (terminal mengirim ulang) — dihitung, tidak dicatat.
            dup := dup + 1;
            IF SQLSTATE <> '23505' THEN
                PERFORM catat_audit('device:' || d.kode, 'terminal', 'antrian_item_cacat',
                    'device:' || d.kode, jsonb_build_object('item', x, 'alasan', SQLERRM));
            END IF;
        END;
    END LOOP;
    UPDATE device SET terakhir_online = now(), terakhir_sinkron = now() WHERE id = d.id;
    RETURN QUERY SELECT n, dup;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION antrian_proses(p_device_kode TEXT DEFAULT NULL)
RETURNS TABLE (diproses INTEGER, ditolak INTEGER) AS $$
DECLARE q RECORD; r RECORD; ok INTEGER := 0; gagal INTEGER := 0; pesan TEXT; kode_err TEXT;
        kum BIGINT := kebijakan_int('kumulatif_offline_rp'); sudah_kum BIGINT;
BEGIN
    FOR q IN
        SELECT a.*, d.kode AS device_kode FROM antrian_offline a JOIN device d ON d.id = a.device_id
         WHERE a.status = 'menunggu' AND (p_device_kode IS NULL OR d.kode = p_device_kode)
         ORDER BY a.waktu_terminal, a.id
         FOR UPDATE OF a SKIP LOCKED
    LOOP
        BEGIN
            -- §2.1 Kumulatif offline per kartu, dihitung dari yang SUDAH
            -- diproses dalam 24 jam terakhir. Ditegakkan di server, bukan
            -- dititipkan ke terminal.
            SELECT COALESCE(SUM(a2.nominal_rp), 0) INTO sudah_kum
              FROM antrian_offline a2
             WHERE a2.kartu_uid = q.kartu_uid AND a2.status = 'diproses'
               AND a2.diterima > now() - interval '24 hours';
            IF sudah_kum + q.nominal_rp > kum THEN
                RAISE EXCEPTION 'melebihi kumulatif offline Rp % (sudah Rp %)', kum, sudah_kum
                    USING HINT = 'MELEBIHI_KUMULATIF_OFFLINE';
            END IF;

            SELECT * INTO r FROM bayar(q.device_kode, q.idempotency_key, q.kartu_uid, q.nominal_rp,
                                       COALESCE(q.payload->>'keterangan', 'Belanja kantin (offline)'),
                                       FALSE, TRUE, q.waktu_terminal, NULL, q.payload->'items');
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

-- ---------------------------------------------------------------------
-- B2.8 — kebijakan_set memvalidasi tipe dan rentang
--
-- Sebelumnya hanya empat kunci jam yang divalidasi. Satu salah ketik
-- ('"dua"' untuk laundry_min_kg) mematikan seluruh modul laundry sampai
-- ada yang menyunting tabel dengan tangan. Angka absurd juga diterima:
-- pin_maks_gagal=0 mengunci anak pada digit salah pertama,
-- batal_kasir_menit=-5 menolak semua pembatalan kasir.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION kebijakan_set(p_kunci TEXT, p_nilai JSONB, p_aktor TEXT)
RETURNS VOID AS $$
DECLARE lama JSONB; angka NUMERIC;
BEGIN
    SELECT nilai INTO lama FROM kebijakan WHERE kunci = p_kunci FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'kebijakan % tidak dikenal', p_kunci USING HINT = 'KEBIJAKAN_TIDAK_ADA';
    END IF;
    IF p_kunci IN ('ambang_pin_rp', 'limit_offline_rp') THEN
        RAISE EXCEPTION 'ambang PIN dan limit offline harus diubah bersama (F-33) — pakai kebijakan_set_ambang_pin()'
            USING HINT = 'F33';
    END IF;
    IF p_kunci = 'po_tidak_diambil' AND (p_nilai #>> '{}') NOT IN ('tetap_ditagih', 'refund') THEN
        RAISE EXCEPTION 'po_tidak_diambil harus tetap_ditagih atau refund' USING HINT = 'NILAI_TIDAK_VALID';
    END IF;
    IF p_kunci IN ('po_buka','po_tutup','po_ambil_mulai','po_ambil_selesai') THEN
        PERFORM (p_nilai #>> '{}')::TIME;
    END IF;

    -- Kunci boolean
    IF p_kunci IN ('transfer_aktif', 'po_aktif') AND jsonb_typeof(p_nilai) <> 'boolean' THEN
        RAISE EXCEPTION 'kebijakan % harus true/false', p_kunci USING HINT = 'NILAI_TIDAK_VALID';
    END IF;

    -- Kunci numerik: wajib angka, tidak negatif, plus batas masuk akal
    -- per kunci supaya satu salah ketik tidak mematikan modul.
    IF p_kunci ~ '_rp$' OR p_kunci ~ '_menit$' OR p_kunci ~ '_hari$' OR p_kunci ~ '_detik$'
       OR p_kunci ~ '_kg$' OR p_kunci ~ '_persen$' OR p_kunci IN ('pin_maks_gagal', 'vending_maks_transaksi') THEN
        IF jsonb_typeof(p_nilai) <> 'number' THEN
            RAISE EXCEPTION 'kebijakan % harus berupa angka', p_kunci USING HINT = 'NILAI_TIDAK_VALID';
        END IF;
        angka := (p_nilai #>> '{}')::NUMERIC;
        IF angka < 0 THEN
            RAISE EXCEPTION 'kebijakan % tidak boleh negatif', p_kunci USING HINT = 'NILAI_TIDAK_VALID';
        END IF;
        IF p_kunci = 'pin_maks_gagal' AND angka < 3 THEN
            RAISE EXCEPTION 'pin_maks_gagal minimal 3 — di bawah itu anak terkunci karena salah ketik biasa'
                USING HINT = 'NILAI_TIDAK_VALID';
        END IF;
        IF p_kunci = 'batal_kasir_menit' AND angka < 1 THEN
            RAISE EXCEPTION 'batal_kasir_menit minimal 1' USING HINT = 'NILAI_TIDAK_VALID';
        END IF;
        IF p_kunci = 'saldo_rendah_rp' AND angka > kebijakan_int('plafon_saldo_rp') THEN
            RAISE EXCEPTION 'ambang saldo rendah tidak boleh di atas plafon saldo' USING HINT = 'NILAI_TIDAK_VALID';
        END IF;
        IF p_kunci = 'laundry_min_kg' AND angka > kebijakan_int('laundry_maks_kg') THEN
            RAISE EXCEPTION 'minimal kg tidak boleh di atas maksimal kg' USING HINT = 'NILAI_TIDAK_VALID';
        END IF;
    END IF;

    UPDATE kebijakan SET nilai = p_nilai, diubah = now(), diubah_oleh = p_aktor WHERE kunci = p_kunci;
    PERFORM catat_audit(p_aktor, NULL, 'ubah_kebijakan', 'kebijakan:' || p_kunci,
                        jsonb_build_object('sebelum', lama, 'sesudah', p_nilai));
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- B2.9 — bangun_ulang_saldo aman dijalankan saat transaksi berjalan
--
-- Komentar lama berbunyi "Aman dijalankan kapan saja", tapi isinya
-- DELETE + INSERT tanpa ON CONFLICT: dengan satu transaksi berjalan di
-- sesi lain, rebuild gagal duplicate key. Dan DELETE-nya mengunci seluruh
-- baris cache, sehingga setiap penjualan di sekolah tertahan.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bangun_ulang_saldo() RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
    -- Tahan penulis sebentar, pembaca tetap jalan. Tanpa ini hasilnya
    -- bisa mencampur ledger yang berubah di tengah penghitungan.
    LOCK TABLE entri_ledger IN SHARE MODE;
    INSERT INTO saldo_cache (akun_id, saldo_rp, entri_terakhir, diubah)
    SELECT a.id, COALESCE(SUM(e.nominal_rp), 0), COALESCE(MAX(e.id), 0), now()
      FROM akun a LEFT JOIN entri_ledger e ON e.akun_id = a.id
     GROUP BY a.id
    ON CONFLICT (akun_id) DO UPDATE
       SET saldo_rp = EXCLUDED.saldo_rp, entri_terakhir = EXCLUDED.entri_terakhir, diubah = now();
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- B2.11 — email siswa unik tanpa memandang huruf besar/kecil
--
-- 'BUDI@x' dan 'budi@x' keduanya bisa masuk lewat impor langsung. sesi.ts
-- mencari dengan lower(email) dan mengambil baris pertama — akun Google
-- itu bisa mendapat saldo dan riwayat ANAK YANG LAIN.
-- staf sudah punya CHECK serupa sejak awal; siswa terlewat.
-- ---------------------------------------------------------------------
UPDATE siswa SET email = lower(trim(email)) WHERE email IS DISTINCT FROM lower(trim(email));
ALTER TABLE siswa DROP CONSTRAINT IF EXISTS siswa_email_key;
DROP INDEX IF EXISTS siswa_email_lower;
CREATE UNIQUE INDEX siswa_email_lower ON siswa (lower(email));
ALTER TABLE siswa DROP CONSTRAINT IF EXISTS siswa_email_lower_chk;
ALTER TABLE siswa ADD CONSTRAINT siswa_email_lower_chk
    CHECK (email IS NULL OR email = lower(email));

-- B2.19 — UID kartu wajib huruf besar heksadesimal. UID huruf kecil yang
-- masuk lewat impor langsung tidak akan pernah ditemukan reader.
UPDATE kartu SET uid = upper(uid) WHERE uid <> upper(uid);
ALTER TABLE kartu DROP CONSTRAINT IF EXISTS kartu_uid_upper;
ALTER TABLE kartu ADD CONSTRAINT kartu_uid_upper CHECK (uid = upper(uid));

-- ---------------------------------------------------------------------
-- B2.14 — rekonsiliasi_malam idempoten
--
-- Tanpa kunci unik, menjalankan ulang setelah selisih diperbaiki akan
-- menambah baris baru; kpi_beranda membaca yang terakhir, sehingga
-- pembacaan yang mengkhawatirkan tertimpa yang bersih.
-- ---------------------------------------------------------------------
DELETE FROM rekonsiliasi_log a USING rekonsiliasi_log b
 WHERE a.tanggal = b.tanggal AND a.id < b.id;
DROP INDEX IF EXISTS rekonsiliasi_log_tanggal;
CREATE UNIQUE INDEX rekonsiliasi_log_tanggal ON rekonsiliasi_log (tanggal);

CREATE OR REPLACE FUNCTION rekonsiliasi_malam() RETURNS rekonsiliasi_log AS $$
DECLARE r rekonsiliasi_log; d JSONB; n INTEGER; f BIGINT; na INTEGER;
BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb), COUNT(*) INTO d, n FROM cek_rekonsiliasi() x;
    SELECT COALESCE(SUM(saldo_rp), 0), COUNT(*) INTO f, na FROM saldo_ledger WHERE jenis = 'siswa';
    INSERT INTO rekonsiliasi_log (jumlah_selisih, detail, total_float_rp, jumlah_akun_siswa)
    VALUES (n, d, f, na)
    ON CONFLICT (tanggal) DO UPDATE
       SET waktu = now(), jumlah_selisih = EXCLUDED.jumlah_selisih, detail = EXCLUDED.detail,
           total_float_rp = EXCLUDED.total_float_rp, jumlah_akun_siswa = EXCLUDED.jumlah_akun_siswa
    RETURNING * INTO r;
    IF n > 0 THEN
        PERFORM catat_audit('sistem', NULL, 'rekonsiliasi_selisih', 'rekonsiliasi:' || r.id, d);
    END IF;
    RETURN r;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- §3.2 — po_tutup_hari(NULL) diam-diam tidak melakukan apa-apa
--
-- Memberikan parameter secara eksplisit membatalkan DEFAULT-nya. jobs.ts
-- memanggil fnSatu("po_tutup_hari", [null]) → p_tanggal NULL → penjaga
-- 'p_tanggal = hari_ini()' bernilai NULL (tidak menyala) dan
-- 'WHERE tanggal = NULL' tidak cocok dengan baris mana pun. Fungsi
-- mengembalikan (0,0) tanpa error, setiap malam.
--
-- Akibat: PO yang tidak diambil tidak pernah ditandai, refund tidak pernah
-- terjadi, notifikasi orang tua tidak pernah terkirim.
--
-- Diperbaiki di kedua sisi: COALESCE di sini (agar NULL berarti hari ini),
-- dan pemanggilan tanpa argumen di jobs.ts.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION po_tutup_hari(p_tanggal DATE DEFAULT hari_ini())
RETURNS TABLE (tidak_diambil INTEGER, direfund INTEGER) AS $$
DECLARE po RECORD; kebijakan_ TEXT := kebijakan_text('po_tidak_diambil'); n INTEGER := 0; r INTEGER := 0; rid BIGINT;
BEGIN
    p_tanggal := COALESCE(p_tanggal, hari_ini());
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

-- ---------------------------------------------------------------------
-- §1.1 lanjutan — vending_mulai ikut memakai kunci berawalan perangkat
--
-- vending_mulai punya penjaga kiriman-ulang sendiri (controller retry)
-- yang mencari kunci MENTAH di tabel transaksi. Setelah bayar() memberi
-- awalan perangkat, penjaga itu tidak lagi menemukan transaksinya, jatuh
-- ke bawah, lalu mencoba INSERT transaksi_vending kedua kali untuk
-- transaksi yang sama → duplicate key.
--
-- Penjaganya sekarang memakai idem_perangkat(), dan INSERT-nya dijaga
-- dengan b.baru sebagai jaring pengaman kedua.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION vending_mulai(p_device_kode TEXT, p_idem TEXT, p_uid TEXT, p_slot TEXT)
RETURNS TABLE (transaksi_id BIGINT, baru BOOLEAN, produk TEXT, harga_rp BIGINT, siswa_id BIGINT, nama TEXT, saldo_rp BIGINT) AS $$
DECLARE d device; m mesin_vending; s slot_vending; pr produk_vending; r RECORD; b RECORD;
        maks_n INTEGER := kebijakan_int('vending_maks_transaksi'); maks_rp BIGINT := kebijakan_int('vending_maks_rp');
        n_hari INTEGER; rp_hari BIGINT; skrg TIME := waktu_sekolah()::time; ada BIGINT;
BEGIN
    d := device_aktif(p_device_kode);
    IF d.layanan <> 'vending' THEN RAISE EXCEPTION 'bukan mesin vending' USING HINT = 'LAYANAN_TIDAK_VALID'; END IF;

    -- kiriman ulang (controller retry) → kembalikan yang ada
    SELECT t.id INTO ada FROM transaksi t WHERE t.idempotency_key = idem_perangkat(d.id, p_idem);
    IF ada IS NOT NULL THEN
        RETURN QUERY SELECT t.id, FALSE, pv.nama, t.total_rp, t.siswa_id, sw.nama, saldo_siswa(t.siswa_id)
                       FROM transaksi t JOIN transaksi_vending tv ON tv.transaksi_id = t.id
                       LEFT JOIN produk_vending pv ON pv.id = tv.produk_id JOIN siswa sw ON sw.id = t.siswa_id WHERE t.id = ada;
        RETURN;
    END IF;

    SELECT * INTO m FROM mesin_vending WHERE device_id = d.id;
    IF m.device_id IS NULL THEN RAISE EXCEPTION 'mesin belum didaftarkan (jam aktif)' USING HINT = 'MESIN_BELUM_DIATUR'; END IF;
    IF NOT m.selalu_aktif AND NOT (
         (m.jam_mulai <= m.jam_selesai AND skrg BETWEEN m.jam_mulai AND m.jam_selesai) OR
         (m.jam_mulai >  m.jam_selesai AND (skrg >= m.jam_mulai OR skrg <= m.jam_selesai))) THEN
        RAISE EXCEPTION 'mesin nonaktif di luar jam %–%', to_char(m.jam_mulai, 'HH24.MI'), to_char(m.jam_selesai, 'HH24.MI') USING HINT = 'DI_LUAR_JAM';
    END IF;

    SELECT * INTO s FROM slot_vending WHERE device_id = d.id AND slot = upper(p_slot) FOR UPDATE;
    IF s.id IS NULL THEN RAISE EXCEPTION 'slot % tidak ada', p_slot USING HINT = 'SLOT_TIDAK_ADA'; END IF;
    IF NOT s.aktif OR s.bermasalah THEN RAISE EXCEPTION 'slot % sedang dinonaktifkan', s.slot USING HINT = 'SLOT_NONAKTIF'; END IF;
    SELECT * INTO pr FROM produk_vending WHERE id = s.produk_id;
    IF pr.id IS NULL OR NOT pr.aktif OR NOT pr.disetujui_kesiswaan THEN
        RAISE EXCEPTION 'produk tidak tersedia / belum disetujui kesiswaan' USING HINT = 'PRODUK_TIDAK_VALID';
    END IF;
    IF s.stok <= 0 THEN RAISE EXCEPTION 'produk habis' USING HINT = 'STOK_HABIS'; END IF;

    SELECT * INTO r FROM identifikasi_kartu(p_uid);

    -- F-112: batas vending per kartu per hari (pending ikut dihitung)
    SELECT COUNT(*), COALESCE(SUM(t.total_rp), 0) INTO n_hari, rp_hari
      FROM transaksi t WHERE t.siswa_id = r.siswa_id AND t.layanan = 'vending' AND t.jenis = 'belanja'
       AND t.status IN ('pending', 'selesai') AND tgl_sekolah(t.waktu_terminal) = hari_ini();
    IF n_hari >= maks_n OR rp_hari + pr.harga_rp > maks_rp THEN
        RAISE EXCEPTION 'batas vending harian: % transaksi / Rp % per kartu', maks_n, maks_rp USING HINT = 'VENDING_BATAS';
    END IF;

    -- tahan saldo: transaksi berstatus pending (F-111)
    SELECT * INTO b FROM bayar(p_device_kode, p_idem, p_uid, pr.harga_rp, 'Vending — ' || pr.nama, FALSE, FALSE, now(), NULL,
                               jsonb_build_array(jsonb_build_object('nama', pr.nama, 'harga_rp', pr.harga_rp, 'qty', 1, 'ref_id', pr.id)),
                               'belanja', 'pending');
    IF b.baru THEN
        INSERT INTO transaksi_vending (transaksi_id, device_id, slot_id, produk_id, siswa_id)
        VALUES (b.transaksi_id, d.id, s.id, pr.id, r.siswa_id);
    END IF;
    RETURN QUERY SELECT b.transaksi_id, b.baru, pr.nama, pr.harga_rp, r.siswa_id, r.nama, b.saldo_rp;
END $$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------
-- BERKAS: 011_perbaikan_audit_lanjutan.sql
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- BERKAS: 012_rak_laundry.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- 012 — Daftar rak laundry
--
-- Sebelumnya `order_laundry.rak` hanya teks bebas: petugas mengetik "B14",
-- "B-14", "b 14" dan ketiganya jadi rak berbeda saat dicari. Sekarang ada
-- daftar rak yang dikelola admin; terminal menampilkannya sebagai pilihan,
-- tapi mengetik manual TETAP boleh — asrama sering pakai rak sementara dan
-- sistem tidak boleh menghalangi pekerjaan yang sedang berjalan.
--
-- Petugas TIDAK dibuatkan tabel: orangnya sudah ada di `staf`. Terminal
-- mengambil nama staf berperan laundry/asrama dari snapshot.
-- =====================================================================
\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS rak_laundry (
    kode    TEXT PRIMARY KEY,
    lokasi  TEXT,
    aktif   BOOLEAN NOT NULL DEFAULT TRUE,
    urutan  SMALLINT NOT NULL DEFAULT 0,
    dibuat  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rak_laundry IS
  'Rak tempat cucian selesai disimpan. Terminal menampilkannya sebagai saran; teks bebas tetap diterima.';

CREATE OR REPLACE FUNCTION rak_laundry_simpan(
    p_kode TEXT, p_lokasi TEXT, p_aktif BOOLEAN, p_urutan SMALLINT, p_aktor TEXT
) RETURNS TEXT AS $$
DECLARE k TEXT := upper(trim(p_kode)); lama rak_laundry;
BEGIN
    IF k = '' OR k IS NULL THEN
        RAISE EXCEPTION 'kode rak wajib' USING HINT = 'NILAI_TIDAK_VALID';
    END IF;
    SELECT * INTO lama FROM rak_laundry WHERE kode = k;
    INSERT INTO rak_laundry (kode, lokasi, aktif, urutan)
    VALUES (k, p_lokasi, COALESCE(p_aktif, TRUE), COALESCE(p_urutan, 0))
    ON CONFLICT (kode) DO UPDATE
       SET lokasi = EXCLUDED.lokasi, aktif = EXCLUDED.aktif, urutan = EXCLUDED.urutan;
    PERFORM catat_audit(p_aktor, NULL, 'simpan_rak_laundry', 'rak:' || k,
        jsonb_build_object('sebelum', to_jsonb(lama), 'sesudah',
                           jsonb_build_object('lokasi', p_lokasi, 'aktif', COALESCE(p_aktif, TRUE))));
    RETURN k;
END $$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------
-- BERKAS: 013_admin_terakhir.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- 013 — Lindungi admin IT terakhir
--
-- Fase 1.4a membuka pengelolaan peran staf lewat halaman admin. Sebelum
-- ini RBAC hanya bisa diubah lewat SQL, jadi kesalahannya terbatas pada
-- orang yang memang bisa membuka psql.
--
-- Begitu tombolnya ada di layar, satu kesalahan klik jadi mungkin: admin
-- IT terakhir mencabut peran admin_it-nya sendiri (atau menonaktifkan
-- akunnya sendiri). Setelah itu TIDAK ADA satu pun akun yang bisa
-- mengangkat admin baru — /api/admin/staf POST butuh peran admin_it —
-- dan pemulihannya hanya lewat akses langsung ke database produksi.
--
-- Larangan ini ditaruh di fungsi SQL, bukan di layar. Tombol yang
-- disembunyikan tidak menghalangi siapa pun yang memanggil API-nya
-- langsung, dan aturan ini terlalu mahal untuk dilanggar.
--
-- Yang TIDAK dilarang: mencabut peran admin_it selama masih ada admin IT
-- aktif lain. Ini bukan kunci permanen, hanya penghalang langkah terakhir.
-- =====================================================================
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION staf_simpan(p_email TEXT, p_nama TEXT, p_peran peran[], p_aktif BOOLEAN, p_aktor TEXT)
RETURNS BIGINT AS $$
DECLARE
    sid        BIGINT;
    lama       staf;
    email_l    TEXT := lower(trim(p_email));
    aktif_baru BOOLEAN;
BEGIN
    SELECT * INTO lama FROM staf WHERE email = email_l FOR UPDATE;
    aktif_baru := COALESCE(p_aktif, lama.aktif, TRUE);

    -- Baris ini sedang melepas admin_it (lewat pencabutan peran ATAU
    -- penonaktifan akun) dan tidak ada admin IT aktif lain yang tersisa.
    IF lama.id IS NOT NULL
       AND lama.aktif
       AND 'admin_it' = ANY(lama.peran)
       AND NOT (aktif_baru AND 'admin_it' = ANY(COALESCE(p_peran, '{}')))
       AND NOT EXISTS (
           SELECT 1 FROM staf
            WHERE aktif AND 'admin_it' = ANY(peran) AND id <> lama.id
       )
    THEN
        RAISE EXCEPTION
            'ini admin IT aktif terakhir — angkat admin IT lain dulu sebelum mencabut peran atau menonaktifkan akun ini'
            USING HINT = 'ADMIN_TERAKHIR';
    END IF;

    INSERT INTO staf (email, nama, peran, aktif)
    VALUES (email_l, p_nama, p_peran, COALESCE(p_aktif, TRUE))
    ON CONFLICT (email) DO UPDATE
       SET nama = EXCLUDED.nama, peran = EXCLUDED.peran,
           aktif = COALESCE(p_aktif, staf.aktif), diubah = now()
    RETURNING id INTO sid;

    PERFORM catat_audit(p_aktor, NULL, 'simpan_staf', 'staf:' || email_l,
        jsonb_build_object(
            'sebelum', CASE WHEN lama.id IS NULL THEN NULL
                            ELSE jsonb_build_object('peran', lama.peran, 'aktif', lama.aktif) END,
            'sesudah', jsonb_build_object('peran', p_peran, 'aktif', aktif_baru)));
    RETURN sid;
END $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION staf_simpan(TEXT, TEXT, peran[], BOOLEAN, TEXT) IS
  'Simpan/ubah akun staf. Menolak mencabut peran admin_it terakhir yang masih aktif (013).';


-- ---------------------------------------------------------------------
-- BERKAS: 014_menu_status.sql
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- BERKAS: 015_staf_status.sql
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- BERKAS: 016_topup_tunai_persetujuan.sql
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- PENCATATAN TABEL skema_migrasi
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skema_migrasi (
    berkas TEXT PRIMARY KEY,
    dijalankan TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO skema_migrasi (berkas) VALUES
,
,
,
,
,
,

ON CONFLICT (berkas) DO NOTHING;

COMMIT;
