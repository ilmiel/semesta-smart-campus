/**
 * Koneksi PostgreSQL — satu pool untuk seluruh proses.
 *
 * Prinsip: logika uang ada di fungsi PostgreSQL (db/00x_*.sql). Lapisan ini
 * hanya memanggil fungsi itu dan meneruskan hasil/kesalahannya. Tidak ada
 * perhitungan saldo, limit, atau PIN-lock di TypeScript.
 *
 * Kesalahan dari fungsi DB membawa HINT berupa kode mesin (mis. SALDO_KURANG);
 * di sini diubah menjadi DbError { kode, pesan } supaya route bisa memetakan
 * ke status HTTP dan menampilkan pesannya langsung ke pengguna.
 */
import { Pool, types, type PoolClient } from "pg";

/** Baris hasil query — objek biasa; bentuk kolom ditentukan pemanggil lewat generik. */
export type Baris = Record<string, unknown>;

// int8 (BIGINT) → number. Rupiah sekolah jauh di bawah 2^53, aman.
types.setTypeParser(20, (v) => Number(v));
// numeric → number (berat kg, dsb.)
types.setTypeParser(1700, (v) => Number(v));
// date → string 'YYYY-MM-DD' apa adanya (jangan digeser zona waktu oleh JS Date)
types.setTypeParser(1082, (v) => v);
// timestamp TANPA zona → string apa adanya, dengan alasan yang sama.
//
// Beberapa view (v_ekspor_transaksi, v_koreksi) memakai `AT TIME ZONE
// 'Asia/Jakarta'` untuk menghasilkan jam dinding WIB — hasilnya bertipe
// timestamp tanpa zona. Parser bawaan node-postgres membacanya sebagai waktu
// lokal PROSES NODE, lalu JSON.stringify mengubahnya ke UTC. Di Vercel (UTC)
// jam 12.47 WIB berubah jadi 19.47; di VPS sekolah yang zonanya WIB, benar.
// Bug yang benar di satu lingkungan dan salah di lingkungan lain adalah bug
// yang paling sulit dipercaya saat dilaporkan.
//
// Sebagai teks, nilainya tetap jam dinding WIB apa adanya — persis yang
// dibutuhkan file CSV yang dibuka di Excel.
types.setTypeParser(1114, (v) => v);

declare global {
  // eslint-disable-next-line no-var
  var __smartcampusPool: Pool | undefined;
}

function buatPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum di-set (lihat .env.example)");
  const p = new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "smartcampus-web",
  });
  p.on("error", (e) => console.error("[db] koneksi idle error:", e.message));
  return p;
}

// Di dev, Next.js me-reload modul → cegah pool menumpuk.
export const pool: Pool = global.__smartcampusPool ?? buatPool();
if (process.env.NODE_ENV !== "production") global.__smartcampusPool = pool;

export class DbError extends Error {
  kode: string;
  status: number;
  detail?: string;
  constructor(kode: string, pesan: string, status: number, detail?: string) {
    super(pesan);
    this.name = "DbError";
    this.kode = kode;
    this.status = status;
    this.detail = detail;
  }
}

// Kode dari HINT fungsi DB → status HTTP. Selain ini: 400 (kesalahan permintaan).
const STATUS_KODE: Record<string, number> = {
  TIDAK_DITEMUKAN: 404, KARTU_TIDAK_DIKENAL: 404, INVOICE_TIDAK_DIKENAL: 404, BUKU_TIDAK_DIKENAL: 404,
  SLOT_TIDAK_ADA: 404, DEVICE_TIDAK_DIKENAL: 401, DEVICE_NONAKTIF: 403,
  KARTU_DIBLOKIR: 403, SISWA_NONAKTIF: 403, PIN_TERKUNCI: 423, BUTUH_PIN: 428,
  SALDO_KURANG: 402, LIMIT_HARIAN: 402, VENDING_BATAS: 402, MELEBIHI_PLAFON: 402,
  IDEMPOTENSI_BEDA: 409, STATUS_TIDAK_SESUAI: 409, SUDAH_REFUND: 409, SUDAH_ADA: 409,
  LOKER_TERISI: 409, SISWA_SUDAH_PUNYA_LOKER: 409, SUDAH_ADA_PENGGANTI: 409, UID_SUDAH_ADA: 409,
  LEWAT_WAKTU: 410, PO_TUTUP: 423, PO_SUDAH_TUTUP: 410, DI_LUAR_JAM: 423, SLOT_NONAKTIF: 423,
  TRANSFER_NONAKTIF: 403, F33: 422,
};

interface PgErr { code?: string; hint?: string; message: string; detail?: string; constraint?: string }

export function petakanError(e: unknown): DbError {
  if (e instanceof DbError) return e;
  const err = e as PgErr;
  if (err && typeof err.message === "string" && (err.code || err.hint)) {
    // P0001 = RAISE EXCEPTION dari plpgsql
    if (err.hint && /^[A-Z][A-Z0-9_]*$/.test(err.hint)) {
      return new DbError(err.hint, err.message, STATUS_KODE[err.hint] ?? 400, err.detail);
    }
    if (err.code === "23505") return new DbError("DUPLIKAT", `data sudah ada (${err.constraint ?? "unik"})`, 409, err.detail);
    if (err.code === "23503") return new DbError("RUJUKAN_TIDAK_ADA", "data yang dirujuk tidak ada", 400, err.detail);
    if (err.code === "23514") return new DbError("MELANGGAR_ATURAN", err.message, 400, err.constraint);
    if (err.code === "22P02" || err.code === "22007" || err.code === "22008") return new DbError("FORMAT_SALAH", err.message, 400);
    if (err.code === "P0001") return new DbError("DITOLAK_DB", err.message, 400, err.detail);
    if (err.code === "40P01") return new DbError("DEADLOCK", "sistem sibuk, coba lagi", 503);
  }
  const m = e instanceof Error ? e.message : String(e);
  return new DbError("KESALAHAN_SERVER", m, 500);
}

/** Jalankan query; hasil sebagai array baris. */
export async function q<T extends object = Baris>(text: string, params: unknown[] = [], client?: PoolClient): Promise<T[]> {
  try {
    const r = await (client ?? pool).query(text, params);
    return r.rows as T[];
  } catch (e) {
    throw petakanError(e);
  }
}

/** Satu baris atau undefined. */
export async function satu<T extends object = Baris>(text: string, params: unknown[] = [], client?: PoolClient): Promise<T | undefined> {
  return (await q<T>(text, params, client))[0];
}

/** Panggil fungsi DB yang mengembalikan baris: SELECT * FROM nama($1, $2, …) */
export async function fn<T extends object = Baris>(nama: string, args: unknown[] = [], client?: PoolClient): Promise<T[]> {
  if (!/^[a-z_][a-z0-9_]*$/.test(nama)) throw new Error("nama fungsi tidak valid");
  const ph = args.map((_, i) => `$${i + 1}`).join(", ");
  return q<T>(`SELECT * FROM ${nama}(${ph})`, args, client);
}

/** Fungsi DB yang mengembalikan tepat satu baris. */
export async function fnSatu<T extends object = Baris>(nama: string, args: unknown[] = [], client?: PoolClient): Promise<T> {
  const rows = await fn<T>(nama, args, client);
  if (!rows[0]) throw new DbError("TIDAK_DITEMUKAN", `${nama} tidak mengembalikan hasil`, 404);
  return rows[0];
}

/** Fungsi DB yang mengembalikan skalar: SELECT nama($1, …) AS v */
export async function skalar<T = unknown>(nama: string, args: unknown[] = [], client?: PoolClient): Promise<T> {
  if (!/^[a-z_][a-z0-9_]*$/.test(nama)) throw new Error("nama fungsi tidak valid");
  const ph = args.map((_, i) => `$${i + 1}`).join(", ");
  const r = await satu<{ v: T }>(`SELECT ${nama}(${ph}) AS v`, args, client);
  return r!.v;
}

/** Transaksi DB untuk langkah ganda (webhook: simpan mentah → proses → tandai). */
export async function tx<T>(kerja: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const hasil = await kerja(c);
    await c.query("COMMIT");
    return hasil;
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { /* abaikan */ }
    throw petakanError(e);
  } finally {
    c.release();
  }
}
