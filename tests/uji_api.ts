/**
 * UJI INTEGRASI ROUTE API — memanggil handler Next.js langsung (tanpa server
 * HTTP) terhadap PostgreSQL sungguhan.
 *
 * PAKAI INI (driver `pg` asli — wajib sebelum Fase 1, audit §5.2):
 *   DATABASE_URL=postgres://.../smartcampus_api CRON_SECRET=uji npm run uji:api
 *
 * Cadangan untuk lingkungan tanpa npm install (sandbox):
 *   npm run uji:api:shim
 *
 * Perbedaannya bukan kosmetik. Shim `pg` menjalankan kueri lewat `psql` dan
 * mengembalikan hasil lewat json_agg, yang otomatis mengubah array Postgres
 * jadi array JSON. Driver asli tidak: array bertipe enum kustom datang
 * sebagai TEKS '{}'. Perbedaan itulah yang membuat sebuah bug otorisasi —
 * wali murid bisa membaca daftar seluruh siswa berikut UID kartu — lolos
 * dari 80 uji dan baru ketahuan lewat uji coba manual pada 3 Sep 2026.
 *
 * Yang tetap diganti dan memang wajar: @/server/auth (login Google tidak bisa
 * diuji otomatis) dan nodemailer. Logika peran, validasi, dan seluruh fungsi
 * DB berjalan nyata.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

process.env.GATEWAY = "simulasi";
process.env.SIMULASI_SECRET = "uji-secret";
process.env.CRON_SECRET = process.env.CRON_SECRET ?? "uji";
process.env.BETTER_AUTH_URL = "http://uji.local";

const URL_DB = process.env.DATABASE_URL!;
const root = path.resolve(__dirname, "..");

// ---------- kerangka mini ----------
let lolos = 0, gagal = 0;
const catatan: string[] = [];
function ok(nama: string, kondisi: unknown, info?: unknown) {
  if (kondisi) { lolos++; } else { gagal++; catatan.push(`GAGAL: ${nama} ${info !== undefined ? JSON.stringify(info) : ""}`); console.log("  ✗", nama, info ?? ""); return; }
  console.log("  ✓", nama);
}
function sama(nama: string, dapat: unknown, harap: unknown) { ok(nama, JSON.stringify(dapat) === JSON.stringify(harap), { dapat, harap }); }

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function panggil(h: Handler, method: string, url: string, opts: { body?: unknown; headers?: Record<string, string>; params?: Record<string, string> } = {}) {
  const req = new Request("http://uji.local" + url, {
    method, headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await h(req, { params: Promise.resolve(opts.params ?? {}) });
  const ct = res.headers.get("content-type") ?? "";
  const j = ct.includes("json") ? await res.json() : { teks: await res.text() };
  return { status: res.status, ...j } as { status: number; ok?: boolean; kode?: string; pesan?: string; data?: any; teks?: string };
}

const KUNCI = { kantin: "kunci-uji-kantin-0000000001", laundry: "kunci-uji-laundry-000000001", perpus: "kunci-uji-perpus-0000000001", vending: "kunci-uji-vending-000000001", loker: "kunci-uji-loker-00000000001" };
const dev = (k: keyof typeof KUNCI) => ({ "x-device-key": KUNCI[k] });
const sebagai = (email: string) => ({ "x-uji-email": email });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function siapkanDb() {
  const env = { ...process.env, DATABASE_URL: URL_DB };
  // stdio "inherit" untuk stderr: kalau penyiapan gagal, pesan psql harus
  // kelihatan. Sebelumnya "ignore" menelan sebabnya dan yang tersisa hanya
  // "Command failed ... status 3" — tidak bisa didiagnosis.
  const diam: ["pipe", "ignore", "inherit"] = ["pipe", "ignore", "inherit"];
  execSync(`bash ${root}/db/migrate.sh --reset`, { env, stdio: diam });
  execSync(`psql -X -q -v ON_ERROR_STOP=1 "${URL_DB}" -f ${root}/db/uji/00_kerangka.sql`, { env, stdio: diam });
  const sql = `
    UPDATE device SET api_key_hash = '${sha(KUNCI.kantin)}'  WHERE kode = 'KANTIN-01';
    UPDATE device SET api_key_hash = '${sha(KUNCI.laundry)}' WHERE kode = 'LNDRY-01';
    UPDATE device SET api_key_hash = '${sha(KUNCI.perpus)}'  WHERE kode = 'PERPUS-01';
    UPDATE device SET api_key_hash = '${sha(KUNCI.vending)}' WHERE kode = 'VEND-01';
    UPDATE device SET api_key_hash = '${sha(KUNCI.loker)}'   WHERE kode = 'LOKER-A';
    SELECT topup_tunai(1, 200000, 'tu@semesta.sch.id', 'tu2@semesta.sch.id');
    SELECT topup_tunai(2, 100000, 'tu@semesta.sch.id', 'tu2@semesta.sch.id');
    SELECT menu_simpan(NULL, 'Nasi ayam', 1, 12000, TRUE, TRUE, NULL, 'it@semesta.sch.id');
    SELECT menu_simpan(NULL, 'Es teh', 2, 3000, TRUE, TRUE, NULL, 'it@semesta.sch.id');
    SELECT kebijakan_set('po_buka', '"00:00"', 'it@semesta.sch.id');
    SELECT kebijakan_set('po_tutup', '"23:59"', 'it@semesta.sch.id');
    SELECT staf_simpan('kesiswaan@semesta.sch.id', 'Bu Kesiswaan', '{kesiswaan}', TRUE, 'it@semesta.sch.id');
    SELECT staf_simpan('kasir@semesta.sch.id', 'Mbak Kasir', '{kasir}', TRUE, 'it@semesta.sch.id');
  `;
  execSync(`psql -X -q -v ON_ERROR_STOP=1 "${URL_DB}"`, { env, input: sql, stdio: ["pipe", "ignore", "inherit"] });
}

async function main() {
  console.log("menyiapkan database uji…");
  await siapkanDb();

  const tap = (await import("@/app/api/terminal/tap/route")).POST as Handler;
  const bayar = (await import("@/app/api/terminal/bayar/route")).POST as Handler;
  const batal = (await import("@/app/api/terminal/batal/route")).POST as Handler;
  const sinkron = (await import("@/app/api/terminal/sinkron/route")).POST as Handler;
  const snapshot = (await import("@/app/api/terminal/snapshot/route")).GET as Handler;
  const poCari = (await import("@/app/api/terminal/po/cari/route")).POST as Handler;
  const poAmbil = (await import("@/app/api/terminal/po/ambil/route")).POST as Handler;
  const pinAdmin = (await import("@/app/api/admin/siswa/[nis]/pin/route")).POST as Handler;
  const siswa360 = (await import("@/app/api/admin/siswa/[nis]/route")).GET as Handler;
  const saya = (await import("@/app/api/saya/route")).GET as Handler;
  const siswaList = (await import("@/app/api/admin/siswa/route")).GET as Handler;
  const kartuAdmin = (await import("@/app/api/admin/siswa/[nis]/kartu/route")).POST as Handler;
  const deviceGet = (await import("@/app/api/admin/device/route")).GET as Handler;
  const devicePost = (await import("@/app/api/admin/device/route")).POST as Handler;
  const kebijakanPut = (await import("@/app/api/admin/kebijakan/route")).PUT as Handler;
  const koreksiPost = (await import("@/app/api/admin/keuangan/koreksi/route")).POST as Handler;
  const rekonGet = (await import("@/app/api/admin/keuangan/rekonsiliasi/route")).GET as Handler;
  const beranda = (await import("@/app/api/admin/beranda/route")).GET as Handler;
  const ortuAnak = (await import("@/app/api/ortu/anak/route")).GET as Handler;
  const ortuTopup = (await import("@/app/api/ortu/anak/[siswaId]/topup/route")).POST as Handler;
  const ortuLimit = (await import("@/app/api/ortu/anak/[siswaId]/limit/route")).PUT as Handler;
  const ortuPo = (await import("@/app/api/ortu/anak/[siswaId]/po/route")).POST as Handler;
  const ortuRiwayat = (await import("@/app/api/ortu/anak/[siswaId]/riwayat/route")).GET as Handler;
  const simBayar = (await import("@/app/api/simulasi-bayar/route")).POST as Handler;
  const webhookSim = (await import("@/app/api/webhook/simulasi/route")).POST as Handler;
  const siswaSaya = (await import("@/app/api/siswa/saya/route")).GET as Handler;
  const siswaPin = (await import("@/app/api/siswa/pin/route")).POST as Handler;
  const siswaHilang = (await import("@/app/api/siswa/kartu/hilang/route")).POST as Handler;
  const laundryTerima = (await import("@/app/api/terminal/laundry/terima/route")).POST as Handler;
  const laundryBayar = (await import("@/app/api/terminal/laundry/bayar/route")).POST as Handler;
  const laundryAdmin = (await import("@/app/api/admin/laundry/route")).POST as Handler;
  const lokerAdmin = (await import("@/app/api/admin/loker/route")).POST as Handler;
  const lokerBuka = (await import("@/app/api/terminal/loker/buka/route")).POST as Handler;
  const perpusAdmin = (await import("@/app/api/admin/perpus/route")).POST as Handler;
  const perpusPinjam = (await import("@/app/api/terminal/perpus/pinjam/route")).POST as Handler;
  const perpusKembali = (await import("@/app/api/terminal/perpus/kembali/route")).POST as Handler;
  const vendingAdmin = (await import("@/app/api/admin/vending/route")).POST as Handler;
  const vendingMulai = (await import("@/app/api/terminal/vending/mulai/route")).POST as Handler;
  const vendingKonfirmasi = (await import("@/app/api/terminal/vending/konfirmasi/route")).POST as Handler;
  const jobMenit = (await import("@/app/api/jobs/menit/route")).POST as Handler;
  const jobMalam = (await import("@/app/api/jobs/malam/route")).POST as Handler;
  const audit = (await import("@/app/api/admin/audit/route")).GET as Handler;

  const RAFIF = "04A1B2C3D4E5F6", AISHA = "04FFEE11223344", KEENAN = "04C0FFEE000001";

  console.log("\n[terminal: identitas & kunci]");
  let r = await panggil(tap, "POST", "/api/terminal/tap", { body: { uid: RAFIF } });
  sama("tanpa kunci → 401", [r.status, r.kode], [401, "DEVICE_TANPA_KUNCI"]);
  r = await panggil(tap, "POST", "/api/terminal/tap", { body: { uid: RAFIF }, headers: { "x-device-key": "kunci-salah-000000000000000" } });
  sama("kunci salah → 401", r.status, 401);
  r = await panggil(tap, "POST", "/api/terminal/tap", { body: { uid: "04:a1:b2:c3:d4:e5:f6" }, headers: dev("kantin") });
  ok("tap: nama & saldo untuk verifikasi kasir", r.status === 200 && r.data.siswa.nama === "Rafif Gamma Wisanggeni" && r.data.saldo_rp === 200000, r);
  ok("tap: hash PIN tidak pernah keluar", JSON.stringify(r.data).includes("hash") === false);
  r = await panggil(tap, "POST", "/api/terminal/tap", { body: { uid: "0400000000FFFF" }, headers: dev("kantin") });
  sama("kartu asing → 404 KARTU_TIDAK_DIKENAL", [r.status, r.kode], [404, "KARTU_TIDAK_DIKENAL"]);
  r = await panggil(tap, "POST", "/api/terminal/tap", { body: { uid: "zz" }, headers: dev("kantin") });
  sama("validasi uid → 400", [r.status, r.kode], [400, "VALIDASI"]);

  console.log("\n[terminal: bayar nominal, idempotensi, PIN]");
  r = await panggil(bayar, "POST", "/api/terminal/bayar", { body: { idem: "api-k01-0001", uid: RAFIF, total: 15000 }, headers: dev("kantin") });
  ok("bayar 15.000 → saldo 185.000", r.status === 200 && r.data.baru === true && r.data.saldo_rp === 185000, r);
  r = await panggil(bayar, "POST", "/api/terminal/bayar", { body: { idem: "api-k01-0001", uid: RAFIF, total: 15000 }, headers: dev("kantin") });
  ok("kirim ulang → baru=false, saldo tetap", r.data.baru === false && r.data.saldo_rp === 185000, r);
  r = await panggil(bayar, "POST", "/api/terminal/bayar", { body: { idem: "api-k01-0002", uid: RAFIF, total: 30000 }, headers: dev("kantin") });
  sama("di atas ambang tanpa PIN → 428 BUTUH_PIN", [r.status, r.kode], [428, "BUTUH_PIN"]);
  r = await panggil(bayar, "POST", "/api/terminal/bayar", { body: { idem: "api-k01-0002", uid: RAFIF, total: 30000, pin: "123456" }, headers: dev("kantin") });
  sama("siswa belum punya PIN → 428 PIN_BELUM_ADA", [r.status, r.kode], [428, "PIN_BELUM_ADA"]);

  r = await panggil(pinAdmin, "POST", "/api/admin/siswa/26001/pin", { body: { aksi: "reset" }, headers: sebagai("kesiswaan@semesta.sch.id"), params: { nis: "26001" } });
  sama("kesiswaan tidak boleh reset PIN → 403", r.status, 403);
  r = await panggil(pinAdmin, "POST", "/api/admin/siswa/26001/pin", { body: { aksi: "reset" }, headers: sebagai("tu@semesta.sch.id"), params: { nis: "26001" } });
  ok("TU reset PIN → PIN sementara 6 digit", r.status === 200 && /^\d{6}$/.test(r.data.pin_sementara), r);
  const pinSementara = r.data.pin_sementara as string;
  const pinSalah = pinSementara === "111222" ? "333444" : "111222";
  r = await panggil(bayar, "POST", "/api/terminal/bayar", { body: { idem: "api-k01-0002", uid: RAFIF, total: 30000, pin: pinSalah }, headers: dev("kantin") });
  ok("PIN salah → 401 PIN_SALAH, sisa 4", r.status === 401 && r.kode === "PIN_SALAH" && r.data?.sisa === 4, r);
  r = await panggil(bayar, "POST", "/api/terminal/bayar", { body: { idem: "api-k01-0002", uid: RAFIF, total: 30000, pin: pinSementara }, headers: dev("kantin") });
  ok("PIN benar → terpotong, saldo 155.000", r.status === 200 && r.data.saldo_rp === 155000, r);
  r = await panggil(tap, "POST", "/api/terminal/tap", { body: { uid: RAFIF }, headers: dev("kantin") });
  ok("tap: PIN sementara ditandai harus_ganti", r.data.pin.harus_ganti === true, r.data.pin);

  console.log("\n[portal siswa: ganti PIN]");
  r = await panggil(siswaPin, "POST", "/api/siswa/pin", { body: { pin_lama: pinSementara, pin_baru: "123456" }, headers: sebagai("rafif.26@semesta.sch.id") });
  sama("PIN berurutan ditolak", [r.status, r.kode], [400, "PIN_LEMAH"]);
  r = await panggil(siswaPin, "POST", "/api/siswa/pin", { body: { pin_lama: pinSalah, pin_baru: "482913" }, headers: sebagai("rafif.26@semesta.sch.id") });
  sama("PIN lama salah ditolak", [r.status, r.kode], [401, "PIN_SALAH"]);
  r = await panggil(siswaPin, "POST", "/api/siswa/pin", { body: { pin_lama: pinSementara, pin_baru: "482913" }, headers: sebagai("rafif.26@semesta.sch.id") });
  sama("ganti PIN sendiri berhasil", r.status, 200);
  r = await panggil(siswaPin, "POST", "/api/siswa/pin", { body: { pin_lama: "482913", pin_baru: "482914" }, headers: sebagai("gamma@example.com") });
  sama("akun ortu bukan siswa → 403", [r.status, r.kode], [403, "BUKAN_SISWA"]);
  r = await panggil(siswaSaya, "GET", "/api/siswa/saya", { headers: sebagai("rafif.26@semesta.sch.id") });
  ok("siswa/saya: saldo & limit", r.status === 200 && r.data.siswa.saldo_rp === 155000 && r.data.limit.terpakai_rp === 45000, r.data?.limit);

  console.log("\n[terminal: mode menu, batal kasir, limit harian]");
  r = await panggil(bayar, "POST", "/api/terminal/bayar", { body: { idem: "api-k01-0003", uid: AISHA, items: [{ menu_id: 1, qty: 1 }, { menu_id: 2, qty: 2 }] }, headers: dev("kantin") });
  ok("mode menu: total dihitung server 18.000", r.status === 200 && r.data.total_rp === 18000, r);
  const tMenu = r.data.transaksi_id;
  r = await panggil(batal, "POST", "/api/terminal/batal", { body: { transaksi_id: tMenu }, headers: dev("laundry") });
  sama("batal dari terminal lain → 404", r.status, 404);
  r = await panggil(batal, "POST", "/api/terminal/batal", { body: { transaksi_id: tMenu }, headers: dev("kantin") });
  ok("batal kasir → refund", r.status === 200 && r.data.refund_id > 0, r);
  r = await panggil(bayar, "POST", "/api/terminal/bayar", { body: { idem: "api-k01-0004", uid: RAFIF, total: 10000 }, headers: dev("kantin") });
  sama("Rafif sudah 45.000 hari ini → +10.000 ditolak LIMIT_HARIAN (402)", [r.status, r.kode], [402, "LIMIT_HARIAN"]);

  console.log("\n[terminal: offline sinkron & snapshot]");
  r = await panggil(sinkron, "POST", "/api/terminal/sinkron", { headers: dev("kantin"), body: { items: [
    { idempotency_key: "api-off-0001", kartu_uid: AISHA, nominal_rp: 5000, waktu_terminal: new Date().toISOString(), keterangan: "offline" },
    { idempotency_key: "api-off-0002", kartu_uid: KEENAN, nominal_rp: 5000, waktu_terminal: new Date().toISOString() },
  ] } });
  ok("sinkron: 1 diproses (Aisha), 1 ditolak (Keenan saldo 0)", r.status === 200 && r.data.diproses === 1 && r.data.ditolak === 1, r.data);
  ok("sinkron: alasan penolakan ikut dikembalikan", r.data.hasil.some((h: any) => h.status === "ditolak" && /saldo/.test(h.alasan_tolak)), r.data?.hasil);
  r = await panggil(sinkron, "POST", "/api/terminal/sinkron", { headers: dev("kantin"), body: { items: [{ idempotency_key: "api-off-0001", kartu_uid: AISHA, nominal_rp: 5000, waktu_terminal: new Date().toISOString() }] } });
  ok("sinkron ulang → duplikat, tidak dipotong lagi", r.data.duplikat === 1 && r.data.diproses === 0, r.data);
  r = await panggil(snapshot, "GET", "/api/terminal/snapshot", { headers: dev("kantin") });
  ok("snapshot: kartu aktif + menu + kebijakan, tanpa PIN", r.status === 200 && r.data.kartu_aktif.length >= 3 && r.data.menu.length === 2 && r.data.kebijakan.ambang_pin_rp === 25000 && !JSON.stringify(r.data).includes("hash"), r.data?.kebijakan);

  console.log("\n[portal ortu: top-up via gateway simulasi + webhook]");
  r = await panggil(ortuAnak, "GET", "/api/ortu/anak", { headers: sebagai("gamma@example.com") });
  ok("ortu melihat hanya anaknya (Rafif)", r.status === 200 && r.data.anak.length === 1 && r.data.anak[0].siswa.nis === "26001", r.data?.anak?.length);
  r = await panggil(ortuTopup, "POST", "/api/ortu/anak/2/topup", { body: { nominal_rp: 50000 }, headers: sebagai("gamma@example.com"), params: { siswaId: "2" } });
  sama("top-up anak orang lain → 403 BUKAN_WALI (F-103)", [r.status, r.kode], [403, "BUKAN_WALI"]);
  r = await panggil(ortuTopup, "POST", "/api/ortu/anak/1/topup", { body: { nominal_rp: 5000 }, headers: sebagai("gamma@example.com"), params: { siswaId: "1" } });
  sama("di bawah minimum → NOMINAL_DI_LUAR_BATAS", r.kode, "NOMINAL_DI_LUAR_BATAS");
  r = await panggil(ortuTopup, "POST", "/api/ortu/anak/1/topup", { body: { nominal_rp: 50000 }, headers: sebagai("gamma@example.com"), params: { siswaId: "1" } });
  ok("top-up dibuat → url simulasi", r.status === 200 && r.data.url.includes("/simulasi-bayar/") && r.data.invoice_id.startsWith("SIM-"), r);
  const invoice = r.data.invoice_id as string;
  r = await panggil(webhookSim, "POST", "/api/webhook/simulasi", { body: { event: "payment.paid", invoice_id: invoice, nominal_rp: 50000 }, headers: { "x-simulasi-signature": "palsu" } });
  ok("webhook tanda tangan palsu → disimpan, valid=false, tidak diproses", r.status === 200 && r.data.valid === false, r);
  r = await panggil(siswaSaya, "GET", "/api/siswa/saya", { headers: sebagai("rafif.26@semesta.sch.id") });
  sama("saldo belum berubah setelah webhook palsu", r.data.siswa.saldo_rp, 155000);
  r = await panggil(simBayar, "POST", "/api/simulasi-bayar", { body: { invoice_id: invoice, event: "payment.paid", nominal_rp: 50000 } });
  ok("webhook sah → lunas", r.status === 200 && r.data.diproses === true && /lunas/.test(r.data.catatan), r);
  r = await panggil(simBayar, "POST", "/api/simulasi-bayar", { body: { invoice_id: invoice, event: "payment.paid", nominal_rp: 50000 } });
  ok("webhook dobel → duplikat (F-22)", /duplikat/.test(r.data.catatan), r);
  r = await panggil(siswaSaya, "GET", "/api/siswa/saya", { headers: sebagai("rafif.26@semesta.sch.id") });
  sama("saldo 205.000 (naik sekali)", r.data.siswa.saldo_rp, 205000);
  r = await panggil(ortuLimit, "PUT", "/api/ortu/anak/1/limit", { body: { limit_harian_rp: 30000 }, headers: sebagai("gamma@example.com"), params: { siswaId: "1" } });
  ok("ortu turunkan limit → efektif 30.000", r.status === 200 && r.data.limit_efektif_rp === 30000, r);
  r = await panggil(ortuLimit, "PUT", "/api/ortu/anak/1/limit", { body: { limit_harian_rp: 80000 }, headers: sebagai("gamma@example.com"), params: { siswaId: "1" } });
  sama("naikkan di atas plafon → MELEBIHI_PLAFON", r.kode, "MELEBIHI_PLAFON");
  r = await panggil(ortuRiwayat, "GET", "/api/ortu/anak/1/riwayat", { headers: sebagai("gamma@example.com"), params: { siswaId: "1" } });
  ok("riwayat ortu memuat top-up & belanja", r.status === 200 && r.data.riwayat.some((x: any) => x.jenis === "topup") && r.data.riwayat.some((x: any) => x.jenis === "belanja"), r.data?.riwayat?.length);

  console.log("\n[PO: ortu pesan → kasir ambil]");
  r = await panggil(ortuPo, "POST", "/api/ortu/anak/2/po", { body: { items: [{ menu_id: 2, qty: 2 }] }, headers: sebagai("piliang@example.com"), params: { siswaId: "2" } });
  ok("PO dibuat & dibayar (6.000)", r.status === 200 && r.data.total_rp === 6000, r);
  const kodePo = r.data.kode as string;
  r = await panggil(poCari, "POST", "/api/terminal/po/cari", { body: { uid: AISHA }, headers: dev("kantin") });
  ok("kasir cari PO via kartu", r.status === 200 && r.data.po[0].kode === kodePo, r);
  r = await panggil(poCari, "POST", "/api/terminal/po/cari", { body: { kode: kodePo.toLowerCase() }, headers: dev("kantin") });
  ok("kasir cari PO via kode", r.data.po[0].nama === "Aishabilla Piliang", r);
  r = await panggil(poAmbil, "POST", "/api/terminal/po/ambil", { body: { po_ids: [r.data.po[0].po_id] }, headers: dev("kantin") });
  sama("PO diambil", r.data?.diambil, 1);

  console.log("\n[admin: RBAC & 360°]");
  r = await panggil(siswa360, "GET", "/api/admin/siswa/26001", { headers: sebagai("kesiswaan@semesta.sch.id"), params: { nis: "26001" } });
  ok("kesiswaan: 360° tanpa rupiah", r.status === 200 && r.data.siswa.saldo_rp === null && r.data.limit === null && r.data.riwayat.every((x: any) => x.total_rp === undefined), r.data?.siswa);
  r = await panggil(siswa360, "GET", "/api/admin/siswa/26001", { headers: sebagai("keuangan@semesta.sch.id"), params: { nis: "26001" } });
  ok("keuangan: 360° dengan rupiah & kartu & wali", r.status === 200 && r.data.siswa.saldo_rp === 205000 && r.data.kartu.length === 1 && r.data.wali.length === 2, r.data?.siswa);
  ok("360°: hash PIN tidak keluar", !("hash" in (r.data.pin ?? {})));
  r = await panggil(siswaList, "GET", "/api/admin/siswa?q=rafif", { headers: sebagai("orang@luar.com") });
  sama("email tak terdaftar → 403 BUKAN_STAF", [r.status, r.kode], [403, "BUKAN_STAF"]);

  // ---- Batas driver DB→TypeScript (audit §1 & §2.6) --------------------
  // Uji-uji di bawah inilah yang DULU tidak mungkin gagal di bawah shim,
  // karena shim mengubah array Postgres jadi array JSON secara otomatis.
  // Dengan driver `pg` asli, `peran_staf()` mengembalikan array enum kustom
  // sebagai TEKS '{}' — dan '{}'.length === 2 membuat penjaga BUKAN_STAF
  // tidak menyala, sehingga wali murid bisa membaca seluruh daftar siswa.
  console.log("\n[batas driver DB→TS]");
  r = await panggil(saya, "GET", "/api/saya", { headers: sebagai("gamma@example.com") });
  ok("wali: peran adalah ARRAY kosong, bukan teks '{}'", Array.isArray(r.data?.peran) && r.data.peran.length === 0, r.data?.peran);
  sama("wali diarahkan ke /ortu, bukan /admin", r.data?.tujuan, "/ortu");
  r = await panggil(saya, "GET", "/api/saya", { headers: sebagai("keuangan@semesta.sch.id") });
  ok("staf: peran terurai jadi array berisi", Array.isArray(r.data?.peran) && r.data.peran.includes("keuangan"), r.data?.peran);
  sama("staf diarahkan ke /admin", r.data?.tujuan, "/admin");
  r = await panggil(siswaList, "GET", "/api/admin/siswa?q=rafif", { headers: sebagai("gamma@example.com") });
  sama("wali TIDAK bisa membaca daftar siswa → 403 BUKAN_STAF", [r.status, r.kode], [403, "BUKAN_STAF"]);

  // §2.6 — UID kartu adalah kredensial: di bawah ambang PIN, bayar() cukup
  // dengan UID. Hanya TU/IT yang boleh melihatnya.
  r = await panggil(siswaList, "GET", "/api/admin/siswa?q=rafif", { headers: sebagai("kasir@semesta.sch.id") });
  ok("kasir: daftar siswa TANPA uid & email", r.status === 200 && r.data.siswa.every((x: any) => x.uid === null && x.email === null), r.data?.siswa?.[0]);
  r = await panggil(siswaList, "GET", "/api/admin/siswa?q=rafif", { headers: sebagai("tu@semesta.sch.id") });
  ok("tu: daftar siswa DENGAN uid", r.status === 200 && r.data.siswa.some((x: any) => typeof x.uid === "string"), r.data?.siswa?.[0]);
  r = await panggil(siswaList, "GET", "/api/admin/siswa?q=rafif", {});
  sama("tanpa sesi → 401", r.status, 401);
  r = await panggil(audit, "GET", "/api/admin/audit?objek=siswa:1", { headers: sebagai("keuangan@semesta.sch.id") });
  ok("audit: lihat_siswa tercatat (§8.1)", r.data.audit.some((a: any) => a.aksi === "lihat_siswa" && a.aktor === "kesiswaan@semesta.sch.id"), r.data?.audit?.slice(0, 3));
  r = await panggil(koreksiPost, "POST", "/api/admin/keuangan/koreksi", { body: { jenis: "refund", transaksi_id: 1, alasan: "x" }, headers: sebagai("tu@semesta.sch.id") });
  sama("TU tidak boleh refund → 403", r.status, 403);
  r = await panggil(kebijakanPut, "PUT", "/api/admin/kebijakan", { body: { kunci: "ambang_pin_rp", nilai: 30000 }, headers: sebagai("it@semesta.sch.id") });
  sama("ambang PIN sendirian ditolak (F-33) → 422", [r.status, r.kode], [422, "F33"]);
  r = await panggil(kebijakanPut, "PUT", "/api/admin/kebijakan", { body: { ambang_pin_rp: 30000 }, headers: sebagai("it@semesta.sch.id") });
  sama("ubah ambang PIN + limit offline bersama", r.status, 200);
  await panggil(kebijakanPut, "PUT", "/api/admin/kebijakan", { body: { ambang_pin_rp: 25000 }, headers: sebagai("it@semesta.sch.id") });

  console.log("\n[admin: device & kunci]");
  r = await panggil(devicePost, "POST", "/api/admin/device", { body: { kode: "KANTIN-09", nama: "Kasir 9", layanan: "kantin" }, headers: sebagai("it@semesta.sch.id") });
  ok("device baru → kunci ditampilkan sekali", r.status === 200 && typeof r.data.kunci === "string" && r.data.kunci.length > 30, r);
  const kunciBaru = r.data.kunci as string;
  r = await panggil(tap, "POST", "/api/terminal/tap", { body: { uid: RAFIF }, headers: { "x-device-key": kunciBaru } });
  sama("kunci baru langsung berlaku", r.status, 200);
  r = await panggil(deviceGet, "GET", "/api/admin/device", { headers: sebagai("it@semesta.sch.id") });
  ok("status device: KANTIN-01 online", r.data.device.some((d: any) => d.kode === "KANTIN-01" && d.status === "online"), r.data?.device?.map((d: any) => [d.kode, d.status]));
  r = await panggil(kartuAdmin, "POST", "/api/admin/siswa/25017/kartu", { body: { aksi: "cabut", kartu_id: 3, status: "hilang" }, headers: sebagai("tu@semesta.sch.id"), params: { nis: "25017" } });
  sama("TU cabut kartu Keenan", r.status, 200);
  r = await panggil(tap, "POST", "/api/terminal/tap", { body: { uid: KEENAN }, headers: dev("kantin") });
  sama("kartu dicabut → 403 KARTU_DIBLOKIR seketika (F-03)", [r.status, r.kode], [403, "KARTU_DIBLOKIR"]);
  r = await panggil(siswaHilang, "POST", "/api/siswa/kartu/hilang", { headers: sebagai("aishabilla.26@semesta.sch.id") });
  sama("siswa lapor hilang sendiri", [r.status, r.data?.status], [200, "hilang"]);
  await panggil(kartuAdmin, "POST", "/api/admin/siswa/26002/kartu", { body: { aksi: "aktifkan", kartu_id: 2 }, headers: sebagai("tu@semesta.sch.id"), params: { nis: "26002" } });

  console.log("\n[laundry]");
  r = await panggil(laundryTerima, "POST", "/api/terminal/laundry/terima", { body: { uid: RAFIF, berat_kg: 3.5, express: false, petugas: "Pak Slamet", rak: "B-14" }, headers: dev("laundry") });
  ok("terima cucian 3,5 kg = 24.500, tanpa uang", r.status === 200 && r.data.total_rp === 24500, r);
  const orderId = r.data.order_id;
  await panggil(laundryAdmin, "POST", "/api/admin/laundry", { body: { aksi: "status", order_id: orderId, status: "siap", rak: "B-14" }, headers: sebagai("asrama@semesta.sch.id") });
  r = await panggil(laundryBayar, "POST", "/api/terminal/laundry/bayar", { body: { order_id: orderId, uid: AISHA, pin: "482913" }, headers: dev("laundry") });
  sama("kartu bukan pemilik → 400 BUKAN_PEMILIK", r.kode, "BUKAN_PEMILIK");
  r = await panggil(laundryBayar, "POST", "/api/terminal/laundry/bayar", { body: { order_id: orderId, uid: RAFIF }, headers: dev("laundry") });
  sama("tanpa PIN → 428", r.status, 428);
  r = await panggil(laundryBayar, "POST", "/api/terminal/laundry/bayar", { body: { order_id: orderId, uid: RAFIF, pin: "482913" }, headers: dev("laundry") });
  ok("bayar laundry dgn PIN → saldo 180.500", r.status === 200 && r.data.saldo_rp === 180500, r);
  r = await panggil(audit, "GET", "/api/admin/audit?aksi=tolak_bayar", { headers: sebagai("it@semesta.sch.id") });
  ok("penolakan bukan pemilik tercatat oleh API", r.data.audit.some((a: any) => a.meta?.kode === "BUKAN_PEMILIK"), r.data?.audit?.length);

  console.log("\n[loker]");
  await panggil(lokerAdmin, "POST", "/api/admin/loker", { body: { aksi: "blok", blok: "A", dari: 1, sampai: 3, lokasi: "Asrama", device_kode: "LOKER-A" }, headers: sebagai("asrama@semesta.sch.id") });
  await panggil(lokerAdmin, "POST", "/api/admin/loker", { body: { aksi: "tugaskan", loker: "A-002", siswa_id: 1 }, headers: sebagai("asrama@semesta.sch.id") });
  r = await panggil(lokerBuka, "POST", "/api/terminal/loker/buka", { body: { loker: "a-002", uid: RAFIF }, headers: dev("loker") });
  sama("pemilik → buka", [r.status, r.data?.buka], [200, true]);
  r = await panggil(lokerBuka, "POST", "/api/terminal/loker/buka", { body: { loker: "A-002", uid: AISHA }, headers: dev("loker") });
  sama("bukan pemilik → 200 buka=false + alasan", [r.status, r.data?.buka, r.data?.alasan], [200, false, "bukan loker siswa ini"]);
  r = await panggil(lokerBuka, "POST", "/api/terminal/loker/buka", { body: { loker: "A-002", uid: RAFIF }, headers: dev("kantin") });
  sama("terminal kantin tidak boleh buka loker → 403", r.status, 403);

  console.log("\n[perpustakaan]");
  await panggil(perpusAdmin, "POST", "/api/admin/perpus", { body: { aksi: "buku", judul: "Bumi", pengarang: "Tere Liye", jumlah_eksemplar: 2, prefix_barcode: "BUMI" }, headers: sebagai("perpus@semesta.sch.id") });
  r = await panggil(perpusPinjam, "POST", "/api/terminal/perpus/pinjam", { body: { barcode: "BUMI-01", uid: RAFIF }, headers: dev("perpus") });
  ok("pinjam → jatuh tempo 7 hari", r.status === 200 && r.data.pinjaman_aktif === 1, r);
  execSync(`psql -X -q "${URL_DB}" -c "UPDATE pinjaman SET jatuh_tempo = hari_ini() - 3 WHERE id = ${r.data.pinjaman_id}"`);
  r = await panggil(perpusKembali, "POST", "/api/terminal/perpus/kembali", { body: { barcode: "BUMI-01", pin: "000000" }, headers: dev("perpus") });
  sama("PIN salah saat denda → 401", r.status, 401);
  r = await panggil(perpusKembali, "POST", "/api/terminal/perpus/kembali", { body: { barcode: "BUMI-01", pin: "482913" }, headers: dev("perpus") });
  ok("kembali + PIN → denda 3.000 dipotong", r.status === 200 && r.data.denda_rp === 3000 && r.data.denda_status === "dipotong" && r.data.saldo_rp === 177500, r);

  console.log("\n[vending]");
  await panggil(vendingAdmin, "POST", "/api/admin/vending", { body: { aksi: "mesin", device_kode: "VEND-01", jam_mulai: "00:00", jam_selesai: "23:59" }, headers: sebagai("it@semesta.sch.id") });
  r = await panggil(vendingAdmin, "POST", "/api/admin/vending", { body: { aksi: "produk", nama: "Air mineral", harga_rp: 4000 }, headers: sebagai("it@semesta.sch.id") });
  const produkId = r.data.produk_id;
  r = await panggil(vendingAdmin, "POST", "/api/admin/vending", { body: { aksi: "setujui", produk_id: produkId, setuju: true }, headers: sebagai("it@semesta.sch.id") });
  sama("admin IT tidak boleh menyetujui produk (F-115) → 403", r.status, 403);
  await panggil(vendingAdmin, "POST", "/api/admin/vending", { body: { aksi: "setujui", produk_id: produkId, setuju: true }, headers: sebagai("kesiswaan@semesta.sch.id") });
  await panggil(vendingAdmin, "POST", "/api/admin/vending", { body: { aksi: "slot", device_kode: "VEND-01", slot: "A1", produk_id: produkId, kapasitas: 10 }, headers: sebagai("it@semesta.sch.id") });
  await panggil(vendingAdmin, "POST", "/api/admin/vending", { body: { aksi: "restock", device_kode: "VEND-01", slot: "A1", ditambah: 5 }, headers: sebagai("tu@semesta.sch.id") });
  r = await panggil(vendingMulai, "POST", "/api/terminal/vending/mulai", { body: { idem: "api-vd-0001", uid: RAFIF, slot: "A1" }, headers: dev("vending") });
  sama("Rafif: limit harian (diturunkan ortu ke 30.000) juga berlaku di vending", r.kode, "LIMIT_HARIAN");
  r = await panggil(vendingMulai, "POST", "/api/terminal/vending/mulai", { body: { idem: "api-vd-0001", uid: AISHA, slot: "A1" }, headers: dev("vending") });
  ok("vending mulai → pending, saldo Aisha ditahan 85.000", r.status === 200 && r.data.saldo_rp === 85000, r);
  r = await panggil(vendingKonfirmasi, "POST", "/api/terminal/vending/konfirmasi", { body: { transaksi_id: r.data.transaksi_id, sensor_ok: false }, headers: dev("vending") });
  ok("sensor gagal → batal, saldo kembali 89.000", r.status === 200 && r.data.status === "batal" && r.data.saldo_rp === 89000, r);
  r = await panggil(vendingMulai, "POST", "/api/terminal/vending/mulai", { body: { idem: "api-vd-0002", uid: AISHA, slot: "A1" }, headers: dev("vending") });
  sama("slot bermasalah → 423 SLOT_NONAKTIF", [r.status, r.kode], [423, "SLOT_NONAKTIF"]);

  console.log("\n[jobs & rekonsiliasi]");
  r = await panggil(jobMenit, "POST", "/api/jobs/menit", { headers: { authorization: "Bearer salah" } });
  sama("cron token salah → 401", r.status, 401);
  r = await panggil(jobMenit, "POST", "/api/jobs/menit", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  ok("job menit jalan", r.status === 200 && "notifikasi" in r.data, r);
  r = await panggil(jobMalam, "POST", "/api/jobs/malam", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  ok("job malam: rekonsiliasi selisih 0", r.status === 200 && r.data.rekonsiliasi.jumlah_selisih === 0, r.data?.rekonsiliasi);
  r = await panggil(rekonGet, "GET", "/api/admin/keuangan/rekonsiliasi", { headers: sebagai("keuangan@semesta.sch.id") });
  ok("log rekonsiliasi & float tersedia", r.status === 200 && r.data.log.length >= 1 && r.data.log[0].total_float_rp > 0, r.data?.log?.[0]);
  r = await panggil(beranda, "GET", "/api/admin/beranda", { headers: sebagai("gm@semesta.sch.id") });
  ok("beranda GM: KPI + perhatian", r.status === 200 && r.data.kpi.siswa_aktif >= 4 && r.data.perhatian.kartu_dicabut.length >= 1, r.data?.kpi);

  console.log(`\n${lolos} lolos, ${gagal} gagal`);
  if (gagal) console.log(catatan.join("\n"));

  // Driver `pg` asli menahan proses tetap hidup lewat pool-nya; shim tidak
  // punya end(). Tutup kalau ada, lalu keluar dengan kode yang benar.
  try {
    const { pool } = await import("@/server/db");
    await (pool as { end?: () => Promise<void> }).end?.();
  } catch { /* shim: tidak ada pool untuk ditutup */ }
  process.exit(gagal ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
