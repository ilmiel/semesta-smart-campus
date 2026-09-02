/**
 * Pekerjaan terjadwal. Dipicu cron di VPS lewat HTTP dengan CRON_SECRET:
 *   * * * * *  curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/jobs/menit
 *   5 0 * * *  curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/jobs/malam
 */
import { timingSafeEqual } from "node:crypto";
import { fnSatu, skalar } from "./db";
import { HttpError } from "./http";
import { kirimAntrianNotifikasi } from "./notifikasi";
import { cocokkanTopupMenunggu } from "./topup";

export function wajibCron(req: Request): void {
  const rahasia = process.env.CRON_SECRET;
  if (!rahasia) throw new HttpError(503, "CRON_SECRET_KOSONG", "CRON_SECRET belum di-set");
  const h = req.headers.get("authorization") ?? "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (tok.length !== rahasia.length || !timingSafeEqual(Buffer.from(tok), Buffer.from(rahasia))) {
    throw new HttpError(401, "CRON_DITOLAK", "token cron salah");
  }
}

/** Tiap menit: hal-hal yang tidak boleh menunggu. */
export async function jobMenit() {
  const vending = await skalar<number>("vending_pending_kedaluwarsa", []);
  const antrian = await fnSatu<{ diproses: number; ditolak: number }>("antrian_proses", [null]);
  const notif = await kirimAntrianNotifikasi();
  return { vending_dibatalkan: vending, antrian_offline: antrian, notifikasi: notif };
}

/** Tiap malam: rekonsiliasi (F-15), penutupan PO (F-49), pencocokan top-up, saldo rendah (F-25). */
export async function jobMalam() {
  const rekon = await fnSatu<{ jumlah_selisih: number; total_float_rp: number; jumlah_akun_siswa: number }>("rekonsiliasi_malam", []);
  let po: unknown = null;
  try { po = await fnSatu("po_tutup_hari", [null]); } catch (e) { po = { dilewati: e instanceof Error ? e.message : String(e) }; }
  const topup = await cocokkanTopupMenunggu();
  const saldoRendah = await skalar<number>("notifikasi_saldo_rendah", []).catch(() => 0);
  return { rekonsiliasi: rekon, po_tutup_hari: po, topup, notifikasi_saldo_rendah: saldoRendah };
}
