/**
 * Audit log (F-95): siapa, kapan, dari mana, apa.
 * Fungsi DB sudah mencatat aksi keuangan sendiri; ini untuk aksi lapisan API
 * (lihat data siswa, penolakan di terminal, login gagal, dsb.).
 */
import { skalar } from "./db";

export async function catatAudit(
  aktor: string, peran: string | null, aksi: string, objek: string | null,
  meta?: Record<string, unknown>, ip?: string | null,
): Promise<void> {
  try {
    await skalar("catat_audit", [aktor, peran, aksi, objek, meta ? JSON.stringify(meta) : null, ip ?? null]);
  } catch (e) {
    console.error("[audit] gagal mencatat:", aksi, e instanceof Error ? e.message : e);
  }
}

/**
 * Penolakan di terminal (kartu bukan pemilik, kartu diblokir, dsb.) dicatat
 * SETELAH transaksi DB gagal — INSERT di dalam fungsi yang RAISE ikut
 * ter-rollback, jadi lapisan API yang mencatatnya.
 */
export async function catatPenolakan(deviceKode: string, aksi: string, kode: string, meta: Record<string, unknown>, ip: string | null): Promise<void> {
  await catatAudit(`device:${deviceKode}`, "terminal", `tolak_${aksi}`, null, { kode, ...meta }, ip);
}

/** Kode penolakan yang layak diaudit (bukan kesalahan input biasa). */
export const KODE_PENOLAKAN_DIAUDIT = new Set([
  "KARTU_DIBLOKIR", "KARTU_TIDAK_DIKENAL", "SISWA_NONAKTIF", "BUKAN_PEMILIK",
  "PIN_SALAH", "PIN_TERKUNCI", "LIMIT_HARIAN", "VENDING_BATAS", "SALDO_KURANG",
]);
