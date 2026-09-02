/**
 * Alur terminal yang dipakai beberapa route: identifikasi kartu, pembayaran
 * dengan PIN "sesuai keputusan server", pencatatan penolakan.
 *
 * Pola PIN: terminal mengirim transaksi TANPA pin dulu. Kalau server (fungsi
 * DB) menjawab BUTUH_PIN, terminal menampilkan keypad dan mengirim ulang
 * request yang sama (idempotency key sama) + pin. Server memverifikasi PIN,
 * mencatat percobaan, lalu memanggil fungsi DB lagi dengan p_pin_ok = TRUE.
 * Terminal tidak pernah menerima hash; DB yang memutuskan kapan PIN wajib.
 */
import { catatPenolakan, KODE_PENOLAKAN_DIAUDIT } from "./audit";
import { DbError, fnSatu, satu } from "./db";
import type { DeviceAktif } from "./device";
import { HttpError } from "./http";
import { verifikasiPinSiswa } from "./pin";

export interface Identitas {
  siswa_id: number; kartu_id: number | null; nama: string; nis: string; kelas: string | null;
  boarding: boolean; saldo_rp: number; jenjang: string | null;
}

export async function identifikasi(d: DeviceAktif, uid: string, ip: string | null): Promise<Identitas> {
  try {
    return await fnSatu<Identitas>("identifikasi_kartu", [uid]);
  } catch (e) {
    await auditJikaPerlu(d, "tap", e, { uid }, ip);
    throw e;
  }
}

export async function siswaDariNis(nis: string): Promise<Identitas> {
  const s = await satu<Identitas>(
    `SELECT s.id AS siswa_id, NULL::bigint AS kartu_id, s.nama, s.nis, NULL::text AS kelas, s.boarding, saldo_siswa(s.id) AS saldo_rp, s.jenjang
       FROM siswa s WHERE s.nis = $1 AND s.status = 'aktif'`, [nis]);
  if (!s) throw new HttpError(404, "SISWA_NONAKTIF", "NIS tidak ditemukan / siswa nonaktif");
  return s;
}

export async function auditJikaPerlu(d: DeviceAktif, aksi: string, e: unknown, meta: Record<string, unknown>, ip: string | null): Promise<void> {
  const kode = e instanceof DbError ? e.kode : e instanceof HttpError ? e.kode : null;
  if (kode && KODE_PENOLAKAN_DIAUDIT.has(kode)) await catatPenolakan(d.kode, aksi, kode, meta, ip);
}

export interface HasilBayar {
  transaksi_id: number; kode: string; baru: boolean; siswa_id: number; nama: string; saldo_rp: number; total_rp: number;
}

/**
 * Jalankan fungsi DB pembayaran dengan penanganan PIN.
 * `panggil(pinOk)` harus memanggil fungsi DB dengan p_pin_ok = pinOk.
 */
export async function bayarDenganPin<T>(
  d: DeviceAktif, siswaId: number | null, pin: string | undefined, ip: string | null,
  panggil: (pinOk: boolean) => Promise<T>, meta: Record<string, unknown>,
): Promise<T> {
  try {
    return await panggil(false);
  } catch (e) {
    if (!(e instanceof DbError) || e.kode !== "BUTUH_PIN") {
      await auditJikaPerlu(d, "bayar", e, meta, ip);
      throw e;
    }
    if (!pin) throw new HttpError(428, "BUTUH_PIN", e.message);   // terminal: tampilkan keypad
    if (!siswaId) throw new HttpError(400, "IDENTITAS_WAJIB", "siswa tidak dikenal untuk verifikasi PIN");
    try {
      await verifikasiPinSiswa(siswaId, pin, d.id, ip);          // salah → PIN_SALAH / PIN_TERKUNCI
      return await panggil(true);
    } catch (e2) {
      await auditJikaPerlu(d, "bayar", e2, meta, ip);
      throw e2;
    }
  }
}

export interface ItemMenu { menu_id: number; qty: number }

/** Pembayaran kasir: mode nominal (total) atau mode menu (items). */
export async function bayarKasir(d: DeviceAktif, p: {
  idem: string; uid?: string; nis?: string; total?: number; items?: ItemMenu[];
  keterangan?: string; pin?: string; waktuTerminal?: string;
}, ip: string | null): Promise<HasilBayar> {
  const id = p.uid ? await identifikasi(d, p.uid, ip) : p.nis ? await siswaDariNis(p.nis) : null;
  if (!id) throw new HttpError(400, "IDENTITAS_WAJIB", "uid kartu atau nis wajib");
  const waktu = p.waktuTerminal ?? new Date().toISOString();
  const meta = { idem: p.idem, siswa_id: id.siswa_id, total: p.total ?? null };
  if (p.items && p.items.length > 0) {
    return bayarDenganPin(d, id.siswa_id, p.pin, ip,
      (pinOk) => fnSatu<HasilBayar>("bayar_menu", [d.kode, p.idem, p.uid ?? null, JSON.stringify(p.items), pinOk, waktu, p.nis ?? null]), meta);
  }
  if (!p.total || p.total <= 0) throw new HttpError(400, "NOMINAL_TIDAK_VALID", "total wajib untuk mode nominal");
  return bayarDenganPin(d, id.siswa_id, p.pin, ip,
    (pinOk) => fnSatu<HasilBayar>("bayar", [d.kode, p.idem, p.uid ?? null, p.total, p.keterangan ?? "Belanja kantin", pinOk, false, waktu, p.nis ?? null, null]), meta);
}

/** Kebijakan yang perlu diketahui terminal (untuk layar & mode offline). */
export async function kebijakanTerminal(d: DeviceAktif) {
  const r = await satu<{ ambang_pin_rp: number; kumulatif_offline_rp: number; limit_harian_rp: number }>(
    `SELECT kebijakan_int('ambang_pin_rp') AS ambang_pin_rp, kebijakan_int('kumulatif_offline_rp') AS kumulatif_offline_rp,
            kebijakan_int('limit_harian_rp') AS limit_harian_rp`);
  return { ...r!, limit_offline_rp: d.limit_offline_rp };
}
