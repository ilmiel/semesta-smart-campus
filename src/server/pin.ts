/**
 * PIN 6 digit (F-30–F-34).
 *
 * Hash: scrypt (bawaan Node, tanpa dependensi) dengan garam acak per siswa.
 * PIN hanya punya 10^6 kemungkinan, jadi kekuatan sebenarnya datang dari:
 *   1. hash TIDAK PERNAH keluar dari server (F-33) — terminal tak pernah menerimanya;
 *   2. kunci setelah N kali salah (pin_catat di DB, F-32);
 *   3. scrypt yang mahal (N=2^14, r=8) supaya brute force offline pun lambat.
 * Nilai PIN mentah tidak pernah di-log dan tidak pernah disimpan.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { fnSatu, skalar } from "./db";
import { HttpError } from "./http";

const N = 1 << 14, R = 8, P = 1, LEN = 32;
// scrypt butuh memori 128·N·r byte; beri batas eksplisit supaya tidak kena default 32 MB Node.
const MAXMEM = 128 * N * R * 2;

export function hashPin(pin: string): string {
  if (!/^\d{6}$/.test(pin)) throw new HttpError(400, "PIN_FORMAT", "PIN harus 6 digit");
  const salt = randomBytes(16);
  const h = scryptSync(pin, salt, LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${h.toString("base64")}`;
}

export function cocokPin(pin: string, hash: string): boolean {
  const [alg, n, r, p, salt, h] = hash.split("$");
  if (alg !== "scrypt") return false;
  const calon = scryptSync(pin, Buffer.from(salt, "base64"), LEN, { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * Number(n) * Number(r) * 2 });
  const asli = Buffer.from(h, "base64");
  return calon.length === asli.length && timingSafeEqual(calon, asli);
}

/** PIN yang terlalu mudah ditebak ditolak saat siswa memilih PIN baru. */
export function pinLemah(pin: string): string | null {
  if (/^(\d)\1{5}$/.test(pin)) return "PIN tidak boleh 6 angka sama";
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return "PIN tidak boleh angka berurutan";
  return null;
}

interface PinInfo { ada: boolean; hash: string | null; terkunci: boolean; terkunci_hingga: string | null; harus_ganti: boolean; gagal: number }
interface PinCatat { terkunci: boolean; terkunci_hingga: string | null; sisa_percobaan: number }

/**
 * Verifikasi PIN siswa + catat percobaan (kunci otomatis di DB).
 * Melempar HttpError dengan kode yang bisa ditampilkan terminal.
 */
export async function verifikasiPinSiswa(siswaId: number, pin: string, deviceId: number | null, ip: string | null): Promise<void> {
  if (!/^\d{6}$/.test(pin)) throw new HttpError(400, "PIN_FORMAT", "PIN harus 6 digit");
  const info = await fnSatu<PinInfo>("pin_info", [siswaId]);
  if (!info.ada || !info.hash) throw new HttpError(428, "PIN_BELUM_ADA", "siswa belum punya PIN — minta TU menetapkan PIN awal");
  if (info.terkunci) {
    throw new HttpError(423, "PIN_TERKUNCI", "PIN terkunci — hubungi TU", { hingga: info.terkunci_hingga });
  }
  const benar = cocokPin(pin, info.hash);
  const c = await fnSatu<PinCatat>("pin_catat", [siswaId, benar, deviceId, ip]);
  if (!benar) {
    if (c.terkunci) throw new HttpError(423, "PIN_TERKUNCI", "PIN salah 5 kali — terkunci", { hingga: c.terkunci_hingga });
    throw new HttpError(401, "PIN_SALAH", `PIN salah — sisa ${c.sisa_percobaan} percobaan`, { sisa: c.sisa_percobaan });
  }
}

/** Siswa mengganti PIN sendiri (F-102): wajib PIN lama; PIN awal dari TU wajib diganti (F-30). */
export async function gantiPinSiswa(siswaId: number, pinLama: string, pinBaru: string, ip: string | null): Promise<void> {
  const lemah = pinLemah(pinBaru);
  if (lemah) throw new HttpError(400, "PIN_LEMAH", lemah);
  if (pinLama === pinBaru) throw new HttpError(400, "PIN_SAMA", "PIN baru harus berbeda dari PIN lama");
  await verifikasiPinSiswa(siswaId, pinLama, null, ip);
  await skalar("pin_set", [siswaId, hashPin(pinBaru), "siswa", false]);
}

/** TU mereset PIN (F-34): siswa hadir, PIN sementara wajib diganti pada pemakaian pertama. */
export async function resetPinOlehTU(siswaId: number, pinSementara: string, emailTU: string): Promise<void> {
  await skalar("pin_set", [siswaId, hashPin(pinSementara), emailTU, true]);
}

/** PIN sementara acak 6 digit (untuk TU). */
export function pinAcak(): string {
  let p = "";
  do { p = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0"); } while (pinLemah(p));
  return p;
}
