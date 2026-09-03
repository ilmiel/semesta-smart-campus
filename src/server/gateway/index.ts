/**
 * Payment gateway — antarmuka tunggal (F-20–F-22).
 *
 * Implementasi:
 *   simulasi  — dev/uji: "bayar" lewat halaman lokal, memanggil webhook sendiri.
 *   mayar     — produksi. KYC akun mayar.id masih menunggu (Sep 2026), jadi
 *               modul ini disiapkan sebagai kerangka + TODO yang jelas, bukan
 *               tebakan format API. Isi setelah dokumentasi API resmi dibaca.
 *
 * Pilih lewat env GATEWAY=simulasi|mayar (default simulasi di dev, WAJIB
 * mayar di produksi — server menolak start kalau produksi memakai simulasi).
 */
import { gatewayMayar } from "./mayar";
import { gatewaySimulasi } from "./simulasi";

export interface PermintaanInvoice {
  topupId: number;
  nominalRp: number;
  siswaNama: string;
  nis: string;
  waliNama: string;
  waliEmail: string | null;
  waliWa: string | null;
  kedaluwarsaMenit: number;
}

export interface HasilInvoice {
  invoiceId: string;        // id di gateway → topup.invoice_id (kunci idempotensi webhook)
  url: string;              // halaman bayar untuk ortu
  kedaluwarsa: Date;
}

export interface HasilWebhook {
  valid: boolean;           // tanda tangan cocok?
  event: string | null;     // nama event dari gateway
  invoiceId: string | null;
  lunas: boolean;           // event = pembayaran berhasil
  gagal: boolean;           // event = kedaluwarsa/gagal
  nominalRp: number | null; // nominal yang benar-benar dibayar (dicocokkan DB)
  dibayarPada: Date | null;
  catatan?: string;
}

export interface Gateway {
  nama: string;
  buatInvoice(p: PermintaanInvoice): Promise<HasilInvoice>;
  /** Verifikasi tanda tangan + urai payload. TIDAK boleh melempar untuk payload tak valid — kembalikan valid:false. */
  uraiWebhook(rawBody: string, headers: Headers): Promise<HasilWebhook>;
  /** Cek status invoice langsung ke gateway (tombol "cek status" & job pencocokan, PRD §13). */
  cekStatus(invoiceId: string): Promise<{ lunas: boolean; gagal: boolean; nominalRp: number | null; dibayarPada: Date | null }>;
}

export function gateway(): Gateway {
  const pilih = process.env.GATEWAY ?? (process.env.NODE_ENV === "production" ? "mayar" : "simulasi");
  if (pilih === "simulasi") {
    if (process.env.NODE_ENV === "production") {
      if (process.env.IZINKAN_SIMULASI_PRODUKSI !== "ya") {
        throw new Error("GATEWAY=simulasi tidak boleh dipakai di produksi");
      }
      // Audit §2.8: rahasia bawaan = webhook simulasi bisa dipalsukan siapa
      // pun, dan itu berarti saldo bisa ditambah tanpa uang masuk.
      const s = process.env.SIMULASI_SECRET;
      if (!s || s === "simulasi-dev-secret") {
        throw new Error("SIMULASI_SECRET wajib diisi (dan bukan nilai bawaan) saat gateway simulasi dipakai di produksi");
      }
    }
    return gatewaySimulasi;
  }
  if (pilih === "mayar") return gatewayMayar;
  throw new Error(`GATEWAY tidak dikenal: ${pilih}`);
}
