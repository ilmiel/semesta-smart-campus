# Arsitektur backend — keputusan & alasan

## SQL-first: uang diatur database, aplikasi hanya memanggil

Semua aturan uang (saldo tidak minus, ledger seimbang & append-only, idempotensi,
limit harian, PIN terkunci, PO, dua fase vending) ada di **fungsi PostgreSQL**
(`db/003_wallet_fn.sql` dst.). Lapisan Next.js (`src/server/*`, `src/app/api/*`)
melakukan tiga hal saja: autentikasi & peran, validasi bentuk input, memanggil
fungsi DB dan meneruskan jawabannya.

Alasan (dibanding logika di TypeScript + ORM):

1. PRD prinsip 3 & 5: "database yang menolak, bukan aplikasi". Aturan yang ada di
   trigger/fungsi berlaku untuk **semua** jalur — API, skrip migrasi, psql darurat.
2. Bisa diuji langsung: `npm run db:uji` menjalankan 336 uji di DB sementara,
   tanpa server aplikasi, tanpa mock.
3. Satu bahasa untuk aturan bisnis. Developer pengganti cukup membaca SQL yang
   berkomentar; tidak perlu memahami ORM tertentu. Tidak ada Drizzle/Prisma —
   migrasi = file `.sql` bernomor yang dijalankan `db/migrate.sh` dalam transaksi.
4. Konkurensi ditangani di satu tempat: `posting()` mengunci baris akun
   (`FOR UPDATE`, urut id) sebelum memeriksa saldo & idempotency key. Dua tap
   bersamaan pada satu kartu dieksekusi berurutan — sudah dibuktikan dengan dua
   sesi paralel (yang kedua menunggu lalu ditolak `SALDO_KURANG`).

Konsekuensi yang diterima: perubahan aturan = migrasi SQL baru (bukan hot-fix di
TypeScript), dan fungsi DB harus dijaga tetap kecil dan berkomentar.

## Kontrak kesalahan

Fungsi DB melempar `RAISE EXCEPTION 'pesan Indonesia' USING HINT = 'KODE_MESIN'`.
`src/server/db.ts` memetakan HINT → `DbError{kode, status}` → respons JSON
`{ok:false, kode, pesan}`. Menambah aturan baru = satu `RAISE` di SQL + (opsional)
satu baris di tabel `STATUS_KODE`.

## Lapisan `src/server`

| Modul | Tanggung jawab |
|---|---|
| `db.ts` | pool `pg`, `q/satu/fn/fnSatu/skalar/tx`, pemetaan error |
| `validasi.ts` | validator kecil tanpa dependensi; `bacaBody/bacaQuery` |
| `http.ts` | bentuk respons, `tangani()` pembungkus route, CSV |
| `auth.ts` | Better Auth: Google (domain sekolah) + magic link wali; akun hanya untuk email yang dikenal |
| `sesi.ts` | sesi → *principal* (peran staf, siswa, anak-anak wali); `wajibPeran`, `wajibSiswa`, `wajibWaliDari` |
| `device.ts` | `X-Device-Key` → device (hash SHA-256, banding waktu-konstan), batas jenis layanan |
| `pin.ts` | scrypt hash/verifikasi, aturan PIN lemah, alur verifikasi + `pin_catat` |
| `terminal.ts` | identifikasi kartu, pola "BUTUH_PIN → kirim ulang + pin", audit penolakan |
| `topup.ts` | buat invoice, proses webhook (simpan mentah → verifikasi → `topup_lunas`), pencocokan |
| `gateway/` | antarmuka gateway: `simulasi` (dev) & `mayar` (kerangka, menunggu KYC) |
| `notifikasi.ts` | outbox → email (kanal WhatsApp tinggal menambah fungsi kirim) |
| `jobs.ts` | job menit & malam, dilindungi `CRON_SECRET` |
| `portal.ts` | logika bersama portal ortu & siswa |
| `audit.ts` | `catat_audit` dari lapisan API (akses data, penolakan terminal) |

Aturan: **tidak ada perhitungan rupiah di TypeScript**. Kalau ada kebutuhan
hitung, buat/ubah fungsi DB dan uji di `db/uji/`.

## Data pribadi anak (§8.1)

- Hash PIN tidak pernah keluar dari `pin.ts`; endpoint 360° menghapusnya eksplisit.
- Setiap `GET /api/admin/siswa/[nis]` dicatat di `audit_log` (`lihat_siswa`).
- Peran tanpa hak uang (kesiswaan, wali kelas) menerima respons tanpa kolom rupiah — dihapus di server, bukan disembunyikan di UI.
- Portal ortu memeriksa `wali.siswa_id` pada setiap request (`wajibWaliDari`); id anak lain → 403/404 tanpa bocor data.

## Yang sengaja belum ada

- Modul mayar.id (KYC): kerangka dengan TODO bernomor; aplikasi menolak start di produksi dengan gateway simulasi.
- PDF laporan bulanan berkop (memakai `laporan_ortu.py` yang sudah ada) — endpoint CSV sudah ada.
- Kanal WhatsApp — menunggu keputusan §12-9; outbox sudah menampung pesannya.
- Halaman frontend masih memakai data contoh (`src/lib/data.ts`) — penyambungan ke API adalah langkah berikutnya.
