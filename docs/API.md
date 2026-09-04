# Kontrak API — Semesta Smart Campus

Semua respons JSON:

```
sukses : 200  { "ok": true,  "data": { … } }
gagal  : 4xx  { "ok": false, "kode": "SALDO_KURANG", "pesan": "saldo tidak mencukupi (saldo Rp 2000, dibutuhkan Rp 8000)", "data"?: {…} }
```

`pesan` berbahasa Indonesia dan aman ditampilkan langsung ke kasir / orang tua. `kode` untuk logika klien.

## Autentikasi

| Pemanggil | Cara | Ditegakkan oleh |
|---|---|---|
| Terminal (kasir, laundry, perpus, loker, vending) | header `X-Device-Key: <kunci>` — kunci dibuat admin IT sekali, server simpan hash-nya | `wajibDevice()` + jenis layanan |
| Staf / siswa | sesi Better Auth via Google Workspace (`/api/auth/*`) | `wajibPeran()` — peran dari tabel `staf` |
| Orang tua | sesi Better Auth via magic link ke email di tabel `wali` | `wajibWaliDari(siswaId)` — hanya anak sendiri (F-103) |
| Cron | `Authorization: Bearer <CRON_SECRET>` | `wajibCron()` |
| Webhook gateway | tanda tangan diverifikasi modul gateway; semua disimpan mentah (F-21) | `prosesWebhook()` |

Status HTTP untuk kode umum: `401` belum login / kunci salah · `403` peran/pemilik tidak sesuai, kartu diblokir, siswa nonaktif · `402` saldo/limit (`SALDO_KURANG`, `LIMIT_HARIAN`, `VENDING_BATAS`, `MELEBIHI_PLAFON`) · `409` konflik status/idempotensi · `423` `PIN_TERKUNCI`, `PO_TUTUP`, `DI_LUAR_JAM`, `SLOT_NONAKTIF` · `428` `BUTUH_PIN` / `PIN_BELUM_ADA` · `400` validasi / aturan lain.

## Pola PIN di terminal

1. Terminal kirim transaksi **tanpa** `pin`.
2. Server menjawab `428 BUTUH_PIN` bila DB memutuskan PIN wajib (di atas ambang, laundry, mode NIS).
3. Terminal tampilkan keypad, kirim ulang request yang **sama** (`idem` sama) + `pin`.
4. Server verifikasi (scrypt), catat percobaan (`PIN_SALAH` sisa N / `PIN_TERKUNCI`), lalu eksekusi.

Terminal tidak pernah menerima hash. Transaksi offline tidak pernah membawa PIN (F-33).

## Terminal — `X-Device-Key`

| Method & path | Layanan | Body | Catatan |
|---|---|---|---|
| `POST /api/terminal/tap` | semua | `{uid}` | nama, kelas, saldo, `pin.{ada,terkunci,harus_ganti}` (F-42). Tidak memotong. |
| `POST /api/terminal/bayar` | kantin | `{idem, uid? \| nis?, total? \| items?[{menu_id,qty}], keterangan?, pin?, waktu_terminal?}` | mode nominal (`total`), mode menu (`items`, harga server), mode darurat (`nis`+`pin`). Idempoten pada `idem`. |
| `POST /api/terminal/batal` | kantin, laundry | `{transaksi_id}` | hanya transaksi terakhir terminal itu, ≤ 5 menit (F-45) |
| `POST /api/terminal/sinkron` | kantin | `{items:[{idempotency_key, kartu_uid, nominal_rp, waktu_terminal, keterangan?, items?}]}` | antrian offline; balasan memuat `hasil[]` per key: diproses/ditolak + alasan (F-44) |
| `GET /api/terminal/snapshot?sejak=` | semua | — | kartu dicabut sejak `sejak` (F-03), menu aktif, kebijakan; tanpa `sejak` → juga daftar kartu aktif untuk cache offline |
| `GET /api/terminal/foto/[nis]` | semua | — | JPEG dari `FOTO_SISWA_DIR`, 204 bila tidak ada |
| `POST /api/terminal/po/cari` | kantin | `{uid? \| kode?}` | PO hari ini; kartu diblokir → `403 KARTU_DIBLOKIR`, pakai kode |
| `POST /api/terminal/po/ambil` | kantin | `{po_ids:[…]}` | tandai diambil, tanpa bayar ulang |
| `POST /api/terminal/laundry/hitung` | laundry | `{berat_kg?, items?[{kode,qty}], express?}` | estimasi |
| `POST /api/terminal/laundry/terima` | laundry | `{uid, berat_kg?, items?, express?, petugas?, catatan?, rak?}` | F-50, tanpa uang |
| `GET /api/terminal/laundry/order?status=siap&cari=` | laundry | — | daftar untuk tab ambil |
| `POST /api/terminal/laundry/bayar` | laundry | `{order_id, uid, pin?, idem?}` | kartu harus pemilik (`BUKAN_PEMILIK`), PIN wajib |
| `POST /api/terminal/perpus/scan` | perpus | `{barcode}` | info eksemplar, `bisa_dipinjam`, `alasan` |
| `POST /api/terminal/perpus/pinjam` | perpus | `{barcode, uid, petugas?}` | batas per jenjang (`BATAS_PINJAM`), telat (`ADA_TERLAMBAT`) |
| `POST /api/terminal/perpus/kembali` | perpus | `{barcode, pin?, petugas?}` | denda dipotong bila `pin` benar & saldo cukup; selain itu tagihan menunggu (F-71) |
| `POST /api/terminal/loker/buka` | locker | `{loker, uid}` | selalu 200 `{buka, alasan, nama}` (F-60) |
| `POST /api/terminal/vending/mulai` | vending | `{idem, uid, slot}` | fase 1: `pending`, saldo ditahan (F-111) |
| `POST /api/terminal/vending/konfirmasi` | vending | `{transaksi_id, sensor_ok, alasan?}` | fase 2: selesai / batal+refund+slot ditandai |
| `GET /api/terminal/vending/planogram` | vending | — | slot mesin ini |

## Portal orang tua — sesi wali

| Method & path | Body | Catatan |
|---|---|---|
| `GET /api/ortu/anak` | — | semua anak + ringkasan (saldo, limit, tagihan, PO, pinjaman, laundry, loker) |
| `GET /api/ortu/anak/[siswaId]/riwayat?bulan=YYYY-MM&limit=` | — | dengan nama item (F-101) |
| `POST /api/ortu/anak/[siswaId]/topup` | `{nominal_rp}` | → `{url, invoice_id}` halaman bayar gateway (F-20) |
| `GET /api/ortu/topup/[id]` | — | status top-up |
| `PUT /api/ortu/anak/[siswaId]/limit` | `{limit_harian_rp}` | hanya menurunkan (F-17); yang terendah dari dua ortu berlaku |
| `GET /api/ortu/po/jendela` | — | buka/tutup + menu PO |
| `POST /api/ortu/anak/[siswaId]/po` | `{items:[{menu_id,qty}], catatan?}` | dibayar dari saldo |
| `DELETE /api/ortu/anak/[siswaId]/po/[poId]` | — | sebelum jam tutup → refund |
| `POST /api/ortu/anak/[siswaId]/kartu/blokir` | — | lapor hilang (F-102) |
| `POST /api/ortu/tagihan/[id]/bayar` | — | denda perpus/loker dari saldo |
| `GET /api/ortu/anak/[siswaId]/laporan?bulan=` | — | CSV bulanan (PDF berkop menyusul, F-18) |
| `GET /api/ortu/anak/[siswaId]/bacaan` | — | riwayat bacaan (F-72) |
| `POST /api/ortu/anak/[siswaId]/vending/sengketa` | `{transaksi_id, catatan}` | F-116 |

## Portal siswa — sesi Google siswa

`GET /api/siswa/saya` · `GET /api/siswa/riwayat` · `POST /api/siswa/pin {pin_lama, pin_baru}` · `POST /api/siswa/kartu/hilang` · `GET /api/siswa/po/jendela` · `POST /api/siswa/po` · `DELETE /api/siswa/po/[poId]` · `POST /api/siswa/pinjaman/[id]/perpanjang` · `POST /api/siswa/vending/sengketa`

## Dashboard admin — sesi staf, peran per endpoint

| Path | GET | POST / PUT / PATCH | Peran tulis |
|---|---|---|---|
| `/api/admin/beranda` | KPI, per jam, perlu perhatian | — | semua staf (rupiah disembunyikan untuk peran non-uang) |
| `/api/admin/siswa` | daftar `?q=&status=&kelas=&kartu=` | POST tambah | tu, admin_it |
| `/api/admin/siswa/[nis]` | 360° (F-91) — kesiswaan tanpa rupiah, akses tercatat | PATCH ubah | tu, admin_it |
| `/api/admin/siswa/[nis]/kartu` | — | `{aksi: terbit\|cabut\|aktifkan, …}` | tu, admin_it |
| `/api/admin/siswa/[nis]/pin` | — | `{aksi: reset\|buka_kunci}` → PIN sementara sekali tampil | tu, admin_it |
| `/api/admin/siswa/[nis]/status` | — | `{status, alasan?}` | tu, admin_it |
| `/api/admin/siswa/[nis]/wali` | — | tambah/ubah wali | tu, admin_it |
| `/api/admin/kartu/impor` | — | `{daftar:[{nis,uid}]}` (F-05/F-80) | admin_it, tu |
| `/api/admin/device` | status terminal (F-93) | POST daftarkan → **kunci sekali tampil** | admin_it |
| `/api/admin/device/[kode]` | — | `{aksi: nonaktif\|aktif\|ganti_kunci\|ubah}` | admin_it |
| `/api/admin/kebijakan` | semua | PUT `{kunci,nilai}` atau `{ambang_pin_rp}` (F-33) | admin_it, manajemen, keuangan |
| `/api/admin/staf` | daftar (admin_it, manajemen) | POST simpan peran · PATCH `{email, aktif}` aktifkan/nonaktifkan saja | admin_it |
| `/api/admin/audit?objek=&aktor=&aksi=` | jejak (F-95) | — | admin_it, keuangan, manajemen |
| `/api/admin/kesiswaan?kelas=` | kesejahteraan (F-94) + bacaan, tanpa rupiah | — | kesiswaan, wali_kelas, manajemen |
| `/api/admin/kantin/menu` | menu | POST simpan (F-41) · PATCH `{id, aktif?, po_bisa?}` ubah status saja | tu, admin_it, manajemen |
| `/api/admin/kantin/po?tanggal=` | pesanan + dapur | POST `{aksi:"tutup_hari"}` | tu, admin_it, keuangan |
| `/api/admin/kantin/rekap?dari=&sampai=` | per terminal (F-46), terlaris | — | kasir, tu, keuangan, admin_it, manajemen |
| `/api/admin/keuangan/rekonsiliasi` | log + akun sistem + float (§8.4) | POST jalankan sekarang | keuangan, admin_it |
| `/api/admin/keuangan/settlement?dari=&sampai=` | per unit (F-92) | — | keuangan, manajemen |
| `/api/admin/keuangan/koreksi` | refund/koreksi/penarikan | POST `{jenis: refund\|koreksi\|penarikan, …}` | keuangan |
| `/api/admin/keuangan/topup-tunai` | — | `{siswa_id, nominal_rp, disetujui_oleh, catatan?}` (F-23) | tu, keuangan |
| `/api/admin/keuangan/antrian-ditolak` | offline ditolak (F-44) | — | keuangan, admin_it |
| `/api/admin/keuangan/tagihan` | menunggu | POST `{id, aksi: bebaskan\|bayar}` | keuangan, tu |
| `/api/admin/keuangan/sengketa` | sengketa vending | POST `{id, kabulkan, keputusan}` | keuangan |
| `/api/admin/keuangan/webhook` | webhook mentah + top-up | — | keuangan, admin_it |
| `/api/admin/laporan/transaksi?dari=&sampai=&layanan=&format=csv` | ekspor (F-92), tercatat audit | — | keuangan, manajemen |
| `/api/admin/laundry` | aktif, tunggakan, tarif | POST `{aksi: status\|tarif}` | laundry, asrama, admin_it |
| `/api/admin/loker?blok=` | peta, ringkas, akses 24 jam | POST `{aksi: blok\|tugaskan\|lepas\|kondisi\|denda}` | asrama, tu, admin_it |
| `/api/admin/perpus?q=` | pinjaman aktif, populer, katalog, aturan | POST `{aksi: buku\|bebaskan\|hilang\|aturan}` | pustakawan, admin_it |
| `/api/admin/vending` | planogram, produk, mesin, gagal, sengketa | POST `{aksi: mesin\|produk\|setujui\|slot\|restock\|pulihkan}` | `setujui` hanya kesiswaan (F-115); `mesin`/`pulihkan` admin_it |

## Sistem

| Path | Catatan |
|---|---|
| `POST /api/webhook/mayar` | webhook mayar.id — modul gateway masih kerangka (menunggu KYC) |
| `POST /api/webhook/simulasi` | gateway simulasi (dev) |
| `POST /api/simulasi-bayar` | halaman bayar simulasi → memicu webhook (dev) |
| `POST /api/jobs/menit` | vending pending kedaluwarsa, antrian offline, kirim notifikasi |
| `POST /api/jobs/malam` | rekonsiliasi (F-15), tutup PO (F-49), pencocokan top-up, saldo rendah (F-25) |
| `/api/auth/*` | Better Auth (Google, magic link, sesi) |
