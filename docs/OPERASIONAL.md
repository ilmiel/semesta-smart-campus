# Panduan Operasional — Semesta Smart Campus (backend)

Untuk tim IT sekolah. Semua perintah dijalankan di VPS (Ubuntu) kecuali disebut lain.
Syarat PRD §8.5: **dua orang** di sekolah harus bisa menjalankan bagian 3, 6, dan 7 sebelum Fase 1 dinyatakan selesai.

## 1. Komponen

| Komponen | Apa | Di mana |
|---|---|---|
| PostgreSQL 16 | satu-satunya tempat uang & data siswa; semua aturan uang ada di fungsi DB | VPS, port lokal saja |
| Aplikasi Next.js | dashboard, portal, API terminal | VPS, `node server.js` (output standalone) di balik Nginx/Caddy (HTTPS) |
| Cron | memanggil `/api/jobs/menit` & `/api/jobs/malam` | VPS |
| Terminal | Chromebook / mini-PC + reader USB, membuka halaman `/terminal/*` | jaringan VLAN terminal |

Tidak ada komponen lain. Tidak ada Redis, tidak ada antrian pesan, tidak ada microservice.

## 2. Pasang pertama kali

```bash
# 2.1 PostgreSQL
sudo apt install postgresql-16
sudo -u postgres psql -c "CREATE ROLE smartcampus LOGIN PASSWORD '<password-kuat>' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE smartcampus OWNER smartcampus;"
sudo -u postgres psql -d smartcampus -c "ALTER DATABASE smartcampus SET timezone = 'Asia/Jakarta';"

# 2.2 Aplikasi
git clone <repo> /opt/smartcampus && cd /opt/smartcampus
cp .env.example .env            # isi semua nilai — lihat tabel di bawah
npm ci
npm run db:migrate              # membuat skema (db/001…009)
npm run auth:migrate            # tabel Better Auth (user, session, account, verification)
npm run build
node .next/standalone/server.js # atau lewat systemd (contoh unit di bawah)
```

Variabel `.env` yang wajib diisi: `DATABASE_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL` (URL publik, https), `GOOGLE_CLIENT_ID/SECRET`, `CRON_SECRET`, `SMTP_*` (untuk magic link ortu). `GATEWAY=mayar` hanya setelah modul mayar dilengkapi; sampai itu `simulasi` — dan aplikasi **menolak start** kalau produksi memakai simulasi tanpa `IZINKAN_SIMULASI_PRODUKSI=ya`.

Google OAuth: Google Cloud Console → OAuth client type Web → Authorized redirect URI `https://<domain>/api/auth/callback/google`. Login dibatasi domain `semesta.sch.id` (`hd`) dan email harus ada di tabel `staf`/`siswa`/`wali` — email lain ditolak saat pembuatan akun.

Contoh unit systemd `/etc/systemd/system/smartcampus.service`:

```
[Unit]
Description=Semesta Smart Campus
After=postgresql.service
[Service]
WorkingDirectory=/opt/smartcampus
EnvironmentFile=/opt/smartcampus/.env
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=always
User=smartcampus
[Install]
WantedBy=multi-user.target
```

Cron (`crontab -e` sebagai user aplikasi):

```
* * * * *  curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/jobs/menit >/dev/null
5 0 * * *  curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/jobs/malam >> /var/log/smartcampus-malam.log
```

## 3. Backup & restore (PRD §8.2 — WAJIB diuji sebelum go-live dan tiap kuartal)

```bash
# backup harian (cron 01:00), simpan 30 hari, salin ke luar VPS (Google Drive/rclone)
pg_dump -Fc -d smartcampus -f /backup/smartcampus-$(date +%F).dump
find /backup -name 'smartcampus-*.dump' -mtime +30 -delete
```

Untuk point-in-time recovery aktifkan WAL archiving di `postgresql.conf` (`wal_level=replica`, `archive_mode=on`, `archive_command`) — dokumentasi PostgreSQL bab "Continuous Archiving".

**Prosedur uji restore** (catat tanggal, siapa, hasil):

```bash
createdb smartcampus_restore
pg_restore -d smartcampus_restore /backup/smartcampus-<tgl>.dump
psql -d smartcampus_restore -c "SELECT * FROM cek_rekonsiliasi();"      # harus 0 baris
psql -d smartcampus_restore -c "SELECT COUNT(*) FROM transaksi; SELECT SUM(saldo_rp) FROM saldo_ledger WHERE jenis='siswa';"
# bandingkan dengan produksi; lalu:
dropdb smartcampus_restore
```

Restore dianggap **berhasil** hanya kalau rekonsiliasi 0 selisih dan jumlah transaksi/float sama dengan produksi pada waktu backup.

## 4. Menambah terminal

1. Dashboard → Perangkat → *Daftarkan* (atau `POST /api/admin/device`) → catat **kunci** yang tampil sekali.
2. Di terminal: buka `https://<domain>/terminal/<jenis>`, isi kunci di pengaturan terminal (disimpan di penyimpanan lokal terminal).
3. Uji: tap kartu → nama muncul. Cabut kabel → transaksi kecil tetap jalan → colok lagi → antrian tersinkron (`Perangkat` menunjukkan `antrian_tertunda` 0).
4. Terminal hilang/dicuri: Perangkat → *Nonaktifkan*. Kunci langsung ditolak.

## 5. Kartu

- **Impor awal** dari Smart Classroom: `POST /api/admin/kartu/impor` dengan `[{nis, uid}]`. Baris gagal dilaporkan satu per satu.
- **Kartu hilang**: siswa/ortu blokir sendiri dari portal (seketika). TU → *Terbitkan kartu baru* (kartu lama otomatis `diganti`). Kalau kartu lama ketemu **sebelum** kartu baru terbit: TU → *Aktifkan lagi*.
- **Siswa keluar/lulus**: Status → `keluar`/`lulus` (kartu ditarik otomatis) → Keuangan → *Penarikan saldo* dengan bukti transfer.

## 6. PIN

- PIN awal: TU → *Reset PIN* dengan siswa hadir. PIN sementara tampil sekali; siswa wajib menggantinya di portal.
- Terkunci (5× salah): otomatis 30 menit; kalau terkunci lagi → permanen sampai TU → *Buka kunci*.
- Tidak ada cara melihat PIN siapa pun. Tidak ada cara menonaktifkan PIN.

## 7. Tutup buku bulanan (Keuangan)

1. Pastikan job malam tanggal 1 sudah jalan (`/admin/keuangan` → rekonsiliasi terakhir, selisih 0).
2. `Settlement` per unit bulan lalu → dasar pembagian ke kantin/laundry.
3. `Ekspor transaksi` CSV bulan lalu → arsip.
4. Periksa `Antrian ditolak`, `Tagihan menunggu`, `Sengketa vending` — semua harus ditindak atau dibebaskan dengan alasan.
5. Catat `total float` (posisi terhadap ambang e-money, §8.4).

## 8. Kalau ada masalah

| Gejala | Lihat | Tindakan |
|---|---|---|
| Kasir: "server tidak terjangkau" | jaringan VLAN, `systemctl status smartcampus` | terminal tetap jalan ≤ Rp 25.000; setelah pulih cek `Perangkat` → antrian |
| Rekonsiliasi selisih ≠ 0 | `/admin/keuangan/rekonsiliasi` detail | JANGAN edit saldo. `SELECT bangun_ulang_saldo();` lalu rekonsiliasi lagi; kalau masih selisih → developer |
| Ortu sudah bayar, saldo belum masuk | `/admin/keuangan/webhook` | webhook valid & diproses? Kalau belum ada webhook → job malam mencocokkan ke gateway; darurat: top-up tunai dengan bukti |
| Login staf "tidak punya akses" | tabel `staf` | tambahkan email + peran lewat `/admin/staf` |

## 9. Pengembangan lokal

```bash
cp .env.example .env    # DATABASE_URL ke Postgres lokal, GATEWAY=simulasi
npm ci
npm run db:reset && psql "$DATABASE_URL" -f db/seed_dev.sql
npm run db:uji          # 336 uji SQL — harus "SEMUA UJI LOLOS"
npm run auth:migrate
npm run dev
```

Kunci terminal dev ada di komentar `db/seed_dev.sql`. Uji API end-to-end: `tests/uji_api.ts` (lihat komentar di atas file).
