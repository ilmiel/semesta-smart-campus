/**
 * Pengiriman notifikasi.
 *
 * Kanal ortu belum diputuskan (PRD §12-9: email vs WhatsApp). Modul ini
 * memisahkan "apa yang harus dikirim" (tabel `notifikasi`, diisi fungsi DB)
 * dari "bagaimana mengirim" (fungsi di bawah). Menambah WhatsApp nanti =
 * menambah satu fungsi kirim, tanpa menyentuh modul lain.
 *
 * Tanpa SMTP_HOST (dev), email hanya dicetak ke console.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { q } from "./db";

let transport: Transporter | null | undefined;

function transporter(): Transporter | null {
  if (transport !== undefined) return transport;
  const host = process.env.SMTP_HOST;
  if (!host) { transport = null; return null; }

  // SMTP_USER terisi tapi SMTP_PASS kosong adalah kesalahan konfigurasi yang
  // paling sering terjadi (variabel tersimpan di environment yang salah, atau
  // deployment belum diulang). Tanpa penjaga ini nodemailer tetap mencoba
  // login dengan password kosong dan menjawab 'Missing credentials for
  // "PLAIN"' — pesan yang tidak menyebut satu pun nama variabel kita, jadi
  // orang mencarinya di tempat yang salah selama setengah jam.
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (user && !pass) {
    throw new Error("SMTP_USER terisi tapi SMTP_PASS kosong — periksa environment variable di server (dan ulangi deploy setelah menambahkannya)");
  }

  transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: user ? { user, pass } : undefined,
  });
  return transport;
}

export async function kirimEmail(p: { ke: string; judul: string; teks: string; html?: string }): Promise<void> {
  const t = transporter();
  const dari = process.env.EMAIL_DARI ?? "Semesta Smart Campus <no-reply@semesta.sch.id>";
  if (!t) {
    // Audit §2.7: isi email memuat tautan masuk. Boleh dicetak hanya di dev.
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP belum dikonfigurasi — email tidak bisa dikirim di produksi");
    }
    console.log(`[email:dev] ke=${p.ke} judul=${p.judul}\n${p.teks}\n`);
    return;
  }
  await t.sendMail({ from: dari, to: p.ke, subject: p.judul, text: p.teks, html: p.html });
}

interface BarisNotif {
  id: number; jenis: string; judul: string; isi: string;
  wali_email: string | null; wali_wa: string | null; siswa_nama: string | null;
}

/**
 * Worker outbox: kirim yang berstatus 'antri'. Dipanggil job berkala
 * (/api/jobs/menit). Gagal kirim → status 'gagal' + catatan, tidak diulang
 * otomatis lebih dari 3× (kolom catatan menyimpan hitungan).
 */
export async function kirimAntrianNotifikasi(batas = 50): Promise<{ terkirim: number; gagal: number }> {
  const baris = await q<BarisNotif>(
    `SELECT n.id, n.jenis, n.judul, n.isi, w.email AS wali_email, w.whatsapp AS wali_wa, s.nama AS siswa_nama
       FROM notifikasi n
       LEFT JOIN wali w ON w.id = n.wali_id
       LEFT JOIN siswa s ON s.id = n.siswa_id
      WHERE n.status = 'antri' ORDER BY n.id LIMIT $1`, [batas]);
  let terkirim = 0, gagal = 0;
  for (const b of baris) {
    try {
      if (!b.wali_email) throw new Error("wali tidak punya email");
      const teks = b.siswa_nama ? `${b.isi}\n\n(Siswa: ${b.siswa_nama})` : b.isi;
      await kirimEmail({ ke: b.wali_email, judul: `[Semesta] ${b.judul}`, teks });
      await q(`UPDATE notifikasi SET status = 'terkirim', terkirim = now() WHERE id = $1`, [b.id]);
      terkirim++;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      await q(`UPDATE notifikasi SET status = 'gagal', catatan = $2 WHERE id = $1`, [b.id, m.slice(0, 500)]);
      gagal++;
    }
  }
  return { terkirim, gagal };
}
