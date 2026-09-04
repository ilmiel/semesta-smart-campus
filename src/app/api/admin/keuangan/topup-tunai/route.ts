/**
 * Top-up tunai dengan kontrol dua orang yang sungguhan (F-23, audit §2.5).
 *
 * GET   — permintaan yang menunggu + riwayat keputusan terakhir.
 * POST  { siswa_id, nominal_rp, catatan? }        — LANGKAH 1: buat permintaan.
 *         Tidak ada uang yang bergerak. Peminta diambil dari sesi.
 * PATCH { permintaan_id, aksi: "setujui"|"tolak"|"batal", alasan? }
 *                                                  — LANGKAH 2: keputusan.
 *         Pemutus diambil dari SESI PEMUTUS, tidak pernah dari isian.
 *
 * Sebelum ini endpoint ini menerima `disetujui_oleh` sebagai teks. Yang
 * diperiksa hanya bahwa emailnya berbeda dan berperan keuangan/tu — jadi satu
 * petugas bisa mengisi saldo sendirian sambil mencantumkan nama rekan yang
 * tidak pernah tahu. Jejak auditnya rapi, dan justru itu bagian terburuknya:
 * kontrol yang terlihat ada membuat orang berhenti mencari kontrol lain.
 *
 * Tidak ada lagi jalur yang menerima identitas penyetuju dari klien. Kalau
 * suatu saat ada yang menambahkannya kembali "supaya cepat", seluruh gunanya
 * hilang lagi.
 */
import { after } from "next/server";
import { fnSatu, q, skalar } from "@/server/db";
import { HttpError, ok, tangani } from "@/server/http";
import { kirimEmail } from "@/server/notifikasi";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  const p = await wajibPeran(req, "tu", "keuangan", "manajemen", "admin_it");
  const [menunggu, riwayat] = await Promise.all([
    q(`SELECT * FROM v_topup_tunai_menunggu ORDER BY dibuat`),
    q(`SELECT * FROM v_topup_tunai_riwayat ORDER BY diputus_pada DESC NULLS LAST LIMIT 50`),
  ]);
  // `saya` dikirim supaya layar bisa menampilkan hanya aksi yang berlaku:
  // peminta tidak bisa menyetujui permintaannya sendiri, dan orang lain tidak
  // bisa membatalkannya. Tombol yang pasti gagal untuk separuh pengguna tidak
  // punya tempat di layar yang menggerakkan uang.
  //
  // Ini kenyamanan, bukan penjaga: keputusannya tetap ditegakkan server.
  return ok({ menunggu, riwayat, saya: aktor(p) });
});

export const POST = tangani(async (req) => {
  const p = await wajibPeran(req, "tu", "keuangan");
  const b = await bacaBody(req, v.obj({
    siswa_id: v.id(), nominal_rp: v.rupiah({ min: 1000 }), catatan: v.str({ max: 200 }).opsional(),
  }));
  const permintaan_id = await skalar<number>(
    "topup_tunai_minta", [b.siswa_id, b.nominal_rp, b.catatan ?? null, aktor(p)]);

  // Beri tahu staf lain yang berwenang bahwa ada permintaan menunggu. Ini
  // kenyamanan, bukan pengaman: kalau email gagal, permintaannya tetap
  // terlihat di layar keuangan. Karena itu kegagalannya dicatat, bukan
  // membatalkan permintaan yang sudah sah.
  // Lewat after(), bukan promise yang dibiarkan menggantung: permintaannya
  // sudah tersimpan dan sah, jadi SMTP yang lambat tidak boleh menahan
  // jawaban — tapi di Vercel invocation bisa dibekukan begitu jawaban
  // dikirim, dan promise lepas ikut mati bersamanya. after() menahan
  // invocation-nya sampai selesai; di VPS perilakunya sama saja.
  after(async () => {
   try {
    const penyetuju = await q<{ email: string }>(
      `SELECT email FROM staf
        WHERE aktif AND peran && ARRAY['keuangan','tu']::peran[] AND email <> $1`, [aktor(p)]);
    await Promise.all(penyetuju.map((s) => kirimEmail({
      ke: s.email,
      judul: "Permintaan top-up tunai menunggu persetujuan",
      teks: `${aktor(p)} meminta top-up tunai Rp ${b.nominal_rp.toLocaleString("id-ID")} `
        + `untuk siswa id ${b.siswa_id} (permintaan #${permintaan_id}).\n\n`
        + `Buka dashboard → Keuangan untuk menyetujui atau menolak dari akunmu sendiri. `
        + `Jangan menyetujui sesuatu yang tidak kamu saksikan sendiri.`,
    })));
   } catch (e) {
    console.error("[topup-tunai] gagal memberi tahu calon penyetuju:", e instanceof Error ? e.message : e);
   }
  });

  return ok({ permintaan_id, status: "menunggu" });
});

export const PATCH = tangani(async (req) => {
  const p = await wajibPeran(req, "tu", "keuangan");
  const b = await bacaBody(req, v.obj({
    permintaan_id: v.id(),
    aksi: v.enum(["setujui", "tolak", "batal"] as const),
    alasan: v.str({ max: 200 }).opsional(),
  }));

  if (b.aksi === "batal") {
    return ok({ permintaan_id: await skalar<number>("topup_tunai_batal", [b.permintaan_id, aktor(p)]), status: "dibatalkan" });
  }
  if (b.aksi === "tolak" && !b.alasan?.trim()) {
    throw new HttpError(400, "VALIDASI", "alasan wajib saat menolak");
  }

  // `aktor(p)` — dari sesi, bukan dari badan permintaan. Ini satu-satunya
  // baris yang membuat kontrol dua orang ini berarti.
  const hasil = await fnSatu<{ permintaan_id: number; status: string; transaksi_id: number | null; saldo_rp: number }>(
    "topup_tunai_putus", [b.permintaan_id, b.aksi === "setujui", aktor(p), b.alasan ?? null]);
  return ok(hasil);
});
