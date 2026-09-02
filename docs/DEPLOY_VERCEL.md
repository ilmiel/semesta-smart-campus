# Deploy ke Vercel (untuk preview / uji coba)

Produksi tetap direncanakan di VPS sekolah (PRD §10, `docs/OPERASIONAL.md`).
Vercel cocok untuk preview dashboard/portal dan uji alur API dari mana saja.

## Yang dibutuhkan di luar Vercel
1. **PostgreSQL terkelola** — Neon atau Supabase, pilih region **Singapore** (terdekat ke Semarang).
   Pakai connection string **pooler** kalau tersedia. Jalankan dari laptop (butuh `psql`):
   ```bash
   export DATABASE_URL='postgres://…'      # dari Neon/Supabase
   npm run db:migrate                       # skema 001–009
   psql "$DATABASE_URL" -f db/seed_dev.sql  # opsional: data contoh
   npx @better-auth/cli migrate             # tabel Better Auth
   ```
2. **Google OAuth client** dengan redirect URI `https://<proyek>.vercel.app/api/auth/callback/google`.

## Environment Variables di Vercel (Settings → Environment Variables)
| Nama | Nilai |
|---|---|
| `DATABASE_URL` | connection string Neon/Supabase (pooler) |
| `DB_POOL_MAX` | `3` (serverless: banyak instance kecil) |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `https://<proyek>.vercel.app` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | dari Google Cloud Console |
| `DOMAIN_SEKOLAH` | `semesta.sch.id` |
| `GATEWAY` | `simulasi` |
| `IZINKAN_SIMULASI_PRODUKSI` | `ya` — Vercel menjalankan `NODE_ENV=production`; tanpa ini aplikasi menolak gateway simulasi |
| `SIMULASI_SECRET` | teks acak |
| `CRON_SECRET` | teks acak — Vercel Cron otomatis mengirim `Authorization: Bearer <CRON_SECRET>` |
| `SMTP_*`, `EMAIL_DARI` | opsional; kosong = magic link ortu hanya tercetak di log Vercel |

## Catatan
- `vercel.json` mendaftarkan dua cron. Paket **Hobby** hanya mengizinkan cron harian — jadwal `*/5` akan ditolak; ubah ke harian atau pakai paket Pro. Job menit hanya penting untuk vending & antrian offline.
- `FOTO_SISWA_DIR` tidak berlaku (tidak ada filesystem) — endpoint foto menjawab 204, terminal menampilkan inisial.
- Jangan pakai Vercel untuk produksi terminal kantin: latensi ke DB luar negeri, cron tidak per menit, dan biaya per request saat 200 transaksi/20 menit. Itu alasan PRD memilih VPS.
