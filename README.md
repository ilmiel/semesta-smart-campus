# Semesta Smart Campus — Next.js + PostgreSQL

Satu aplikasi: dashboard admin, portal ortu/siswa, API terminal, dan skema
database dengan seluruh aturan uang di fungsi PostgreSQL (SQL-first).

- `db/` — migrasi `.sql` bernomor (001–009), uji (`db/uji`, 336 uji), seed dev.
- `src/server/` — lapisan server: db, auth, peran, device key, PIN, gateway, jobs.
- `src/app/api/` — 76 route handler (kontrak: `docs/API.md`).
- `src/app/*` — halaman (masih memakai data contoh `src/lib/data.ts`; penyambungan ke API = langkah berikutnya).
- `docs/` — `API.md`, `OPERASIONAL.md` (pasang, backup/restore, cron, kartu, PIN, tutup buku), `ARSITEKTUR.md`.

## Menjalankan (dev)

```bash
cp .env.example .env                  # DATABASE_URL, GATEWAY=simulasi
npm install
npm run db:reset && psql "$DATABASE_URL" -f db/seed_dev.sql
npm run db:uji                        # harus: SEMUA UJI LOLOS
npm run auth:migrate                  # tabel Better Auth
npm run dev                           # http://localhost:3000
npm run build                         # produksi (output: standalone, untuk VPS)
```

Gateway pembayaran: `GATEWAY=simulasi` sampai KYC mayar.id selesai dan
`src/server/gateway/mayar.ts` dilengkapi (TODO bernomor di dalamnya).

## Route

| Route | Isi |
|---|---|
| `/login` | Google (staf/siswa) + magic link ortu — mock |
| `/admin` | Beranda dashboard (KPI, grafik per jam, perlu perhatian) |
| `/admin/siswa` · `/admin/siswa/[nis]` | Daftar siswa + detail 360° |
| `/admin/kantin` | Menu, pengaturan PO (F-49), rekap |
| `/admin/keuangan` | Rekonsiliasi, settlement, butuh tindakan |
| `/admin/perangkat` | Terminal, antrian offline, kesehatan sistem |
| `/admin/laporan` | PDF bulanan ortu + ekspor manajemen |
| `/admin/laundry` · `/admin/loker` · `/admin/perpus` · `/admin/vending` | Modul layanan |
| `/ortu` · `/siswa` | Portal orang tua & siswa (top-up, PO, PIN, lapor kartu) |
| `/terminal/kasir` | Kasir: mode nominal (default), menu, PO; offline sim |
| `/terminal/laundry` · `/terminal/perpus` · `/terminal/vending` | Simulasi terminal layanan |

## Struktur & aturan

- `src/app` — route per halaman; grup `(admin)` punya layout sidebar sendiri.
- `src/components` — UI bersama. **Server Component secara default**; `"use client"`
  hanya di komponen interaktif (chart, peta loker, terminal, portal, toast).
- `src/lib/data.ts` — tipe + data contoh, bentuknya mengikuti skema `01_core.sql`.
- `src/app/globals.css` — design system (token warna terang/gelap + komponen).
  Tailwind v4 ter-set (`@import "tailwindcss"`) untuk pemakaian berikutnya.
- Uang selalu integer rupiah; format hanya lewat `src/lib/format.ts` (`rp()`).
- Tidak ada logika uang di frontend — tombol transaksi memanggil toast
  "aksi contoh" sampai API Fase 1a ada.

## Deploy

Dua jalur, tidak saling meniadakan:

- **Produksi jangka panjang → VPS**, per keputusan PRD §10 (latency rendah untuk
  tap-kartu kantin, cron per-menit untuk sinkron antrian offline — bukan cuma
  cron harian). `next.config.ts` memakai `output: "standalone"` untuk ini;
  langkah lengkap di `docs/OPERASIONAL.md`.
- **Uji coba/preview → Vercel**, boleh dan sudah disiapkan (`vercel.json`,
  route job pakai `GET` supaya kena Vercel Cron). `output: "standalone"` tidak
  menghalangi ini — Vercel punya build system sendiri dan mengabaikan opsi itu.
  Yang wajib diperhatikan di Vercel: Postgres harus eksternal (Neon/Supabase,
  region Singapore — bukan Postgres di VPS), cron Hobby-tier cuma harian
  (job menit tidak akan jalan sesering di VPS), dan `GATEWAY=simulasi` perlu
  `IZINKAN_SIMULASI_PRODUKSI=ya` karena mayar.id belum aktif. Detail lengkap:
  `docs/DEPLOY_VERCEL.md`.

## Catatan

- Font: IBM Plex Sans/Mono via `next/font` (self-hosted otomatis, tanpa CDN).
