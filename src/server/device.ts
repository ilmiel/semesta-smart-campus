/**
 * Identitas terminal (PRD prinsip 10, F-93).
 *
 * Tiap terminal membawa header `X-Device-Key: <kunci>`. Kunci dibuat sekali
 * oleh admin IT (acak 32 byte), ditampilkan SEKALI, dan hanya hash SHA-256-nya
 * yang disimpan (kolom device.api_key_hash). Kunci acak 256-bit tidak perlu
 * bcrypt — entropinya sudah jauh di atas kemampuan brute force.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { q, satu } from "./db";
import { HttpError } from "./http";

export interface DeviceAktif {
  id: number;
  kode: string;
  nama: string;
  layanan: "kantin" | "perpustakaan" | "locker" | "vending" | "laundry" | "kelas" | "gerbang" | "topup";
  lokasi: string | null;
  limit_offline_rp: number;
}

export function hashKunci(kunci: string): string {
  return createHash("sha256").update(kunci, "utf8").digest("hex");
}

/** Kunci baru: 43 karakter base64url. Dikembalikan sekali ke admin. */
export function buatKunciDevice(): { kunci: string; hash: string } {
  const kunci = randomBytes(32).toString("base64url");
  return { kunci, hash: hashKunci(kunci) };
}

function samaAman(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Autentikasi terminal. Opsional: batasi jenis layanan (kasir tidak bisa
 * memanggil endpoint vending, dst.).
 */
export async function wajibDevice(req: Request, ...layanan: DeviceAktif["layanan"][]): Promise<DeviceAktif> {
  const kunci = req.headers.get("x-device-key");
  if (!kunci || kunci.length < 20) throw new HttpError(401, "DEVICE_TANPA_KUNCI", "header X-Device-Key wajib");
  const h = hashKunci(kunci);
  const d = await satu<DeviceAktif & { api_key_hash: string; aktif: boolean }>(
    `SELECT id, kode, nama, layanan, lokasi, limit_offline_rp, api_key_hash, aktif FROM device WHERE api_key_hash = $1`, [h]);
  if (!d || !samaAman(d.api_key_hash, h)) throw new HttpError(401, "DEVICE_TIDAK_DIKENAL", "kunci terminal tidak dikenal");
  if (!d.aktif) throw new HttpError(403, "DEVICE_NONAKTIF", `terminal ${d.kode} dinonaktifkan admin`);
  if (layanan.length > 0 && !layanan.includes(d.layanan)) {
    throw new HttpError(403, "LAYANAN_TIDAK_VALID", `terminal ${d.kode} (${d.layanan}) tidak boleh memakai endpoint ini`);
  }
  // jejak "terakhir online" (F-93) — murah, satu UPDATE per request
  void q(`UPDATE device SET terakhir_online = now(), versi_terminal = COALESCE($2, versi_terminal) WHERE id = $1`,
         [d.id, req.headers.get("x-terminal-versi")]).catch(() => { /* jangan ganggu transaksi */ });
  return { id: d.id, kode: d.kode, nama: d.nama, layanan: d.layanan, lokasi: d.lokasi, limit_offline_rp: d.limit_offline_rp };
}
