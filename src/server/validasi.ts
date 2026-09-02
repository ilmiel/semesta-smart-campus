/**
 * Validator kecil tanpa dependensi. Validasi SELALU di server — ini pintu
 * masuk setiap route sebelum data menyentuh database.
 *
 *   const Skema = v.obj({ uid: v.uid(), total: v.int({ min: 1 }) });
 *   const data = Skema.parse(await req.json());   // data: { uid: string; total: number }
 *
 * Kalau tim nanti lebih nyaman dengan zod, ganti modul ini saja — pemakaian
 * di route (`.parse`) sama bentuknya.
 */

export class ValidasiError extends Error {
  kode = "VALIDASI";
  status = 400;
  lokasi: string;
  constructor(lokasi: string, pesan: string) {
    super(`${lokasi}: ${pesan}`);
    this.name = "ValidasiError";
    this.lokasi = lokasi;
  }
}

export interface Skema<T> {
  parse(nilai: unknown, lokasi?: string): T;
  opsional(): Skema<T | undefined>;
  nullable(): Skema<T | null>;
  default(d: T): Skema<T>;
}

export type Infer<S> = S extends Skema<infer T> ? T : never;

function buat<T>(parse: (n: unknown, lok: string) => T): Skema<T> {
  const s: Skema<T> = {
    parse: (n, lok = "body") => parse(n, lok),
    opsional: () => buat<T | undefined>((n, lok) => (n === undefined ? undefined : parse(n, lok))),
    nullable: () => buat<T | null>((n, lok) => (n === null || n === undefined ? null : parse(n, lok))),
    default: (d) => buat<T>((n, lok) => (n === undefined || n === null ? d : parse(n, lok))),
  };
  return s;
}

export const v = {
  str(o: { min?: number; max?: number; pola?: RegExp; trim?: boolean } = {}) {
    return buat<string>((n, lok) => {
      if (typeof n !== "string") throw new ValidasiError(lok, "harus teks");
      const s = o.trim === false ? n : n.trim();
      if (o.min !== undefined && s.length < o.min) throw new ValidasiError(lok, `minimal ${o.min} karakter`);
      if (o.max !== undefined && s.length > o.max) throw new ValidasiError(lok, `maksimal ${o.max} karakter`);
      if (o.pola && !o.pola.test(s)) throw new ValidasiError(lok, "format tidak sesuai");
      return s;
    });
  },
  /** Bilangan bulat (rupiah, id, qty). Menerima string angka dari form. */
  int(o: { min?: number; max?: number } = {}) {
    return buat<number>((n, lok) => {
      const x = typeof n === "string" && n.trim() !== "" ? Number(n) : n;
      if (typeof x !== "number" || !Number.isInteger(x)) throw new ValidasiError(lok, "harus bilangan bulat");
      if (o.min !== undefined && x < o.min) throw new ValidasiError(lok, `minimal ${o.min}`);
      if (o.max !== undefined && x > o.max) throw new ValidasiError(lok, `maksimal ${o.max}`);
      return x;
    });
  },
  num(o: { min?: number; max?: number } = {}) {
    return buat<number>((n, lok) => {
      const x = typeof n === "string" && n.trim() !== "" ? Number(n.replace(",", ".")) : n;
      if (typeof x !== "number" || !Number.isFinite(x)) throw new ValidasiError(lok, "harus angka");
      if (o.min !== undefined && x < o.min) throw new ValidasiError(lok, `minimal ${o.min}`);
      if (o.max !== undefined && x > o.max) throw new ValidasiError(lok, `maksimal ${o.max}`);
      return x;
    });
  },
  bool() {
    return buat<boolean>((n, lok) => {
      if (typeof n === "boolean") return n;
      if (n === "true" || n === "1" || n === 1) return true;
      if (n === "false" || n === "0" || n === 0) return false;
      throw new ValidasiError(lok, "harus true/false");
    });
  },
  enum<const U extends readonly string[]>(nilai: U) {
    return buat<U[number]>((n, lok) => {
      if (typeof n !== "string" || !nilai.includes(n)) throw new ValidasiError(lok, `harus salah satu: ${nilai.join(", ")}`);
      return n as U[number];
    });
  },
  arr<T>(item: Skema<T>, o: { min?: number; max?: number } = {}) {
    return buat<T[]>((n, lok) => {
      if (!Array.isArray(n)) throw new ValidasiError(lok, "harus daftar");
      if (o.min !== undefined && n.length < o.min) throw new ValidasiError(lok, `minimal ${o.min} item`);
      if (o.max !== undefined && n.length > o.max) throw new ValidasiError(lok, `maksimal ${o.max} item`);
      return n.map((x, i) => item.parse(x, `${lok}[${i}]`));
    });
  },
  obj<S extends Record<string, Skema<unknown>>>(bentuk: S) {
    type T = { [K in keyof S]: Infer<S[K]> };
    return buat<T>((n, lok) => {
      if (typeof n !== "object" || n === null || Array.isArray(n)) throw new ValidasiError(lok, "harus objek");
      const src = n as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(bentuk)) out[k] = bentuk[k].parse(src[k], lok === "body" ? k : `${lok}.${k}`);
      return out as T;
    });
  },
  /** JSON apa adanya (untuk meta/log). */
  apa() { return buat<unknown>((n) => n); },

  // ---- bentuk khas sekolah ----
  /** UID kartu Mifare: hex 8–20 digit, pemisah ':'/'-'/spasi dibolehkan. */
  uid() {
    return buat<string>((n, lok) => {
      if (typeof n !== "string") throw new ValidasiError(lok, "harus teks");
      const s = n.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
      if (s.length < 8 || s.length > 20) throw new ValidasiError(lok, "UID kartu tidak valid");
      return s;
    });
  },
  /** PIN 6 digit. Tidak pernah di-log. */
  pin() {
    return buat<string>((n, lok) => {
      if (typeof n !== "string" || !/^\d{6}$/.test(n)) throw new ValidasiError(lok, "PIN harus 6 digit angka");
      return n;
    });
  },
  /** Kunci idempotensi dari terminal: 8–64 karakter aman. */
  idem() { return v.str({ min: 8, max: 64, pola: /^[A-Za-z0-9._:-]+$/ }); },
  email() { return buat<string>((n, lok) => {
      if (typeof n !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n.trim())) throw new ValidasiError(lok, "email tidak valid");
      return n.trim().toLowerCase();
    }); },
  tanggal() { return v.str({ pola: /^\d{4}-\d{2}-\d{2}$/ }); },
  jam() { return v.str({ pola: /^([01]\d|2[0-3]):[0-5]\d$/ }); },
  rupiah(o: { min?: number; max?: number } = {}) { return v.int({ min: o.min ?? 0, max: o.max ?? 100_000_000 }); },
  id() { return v.int({ min: 1 }); },
};

/** Baca & validasi body JSON. Body kosong → objek kosong. */
export async function bacaBody<T>(req: Request, skema: Skema<T>): Promise<T> {
  let raw: unknown = {};
  const teks = await req.text();
  if (teks.trim() !== "") {
    try { raw = JSON.parse(teks); } catch { throw new ValidasiError("body", "JSON tidak valid"); }
  }
  return skema.parse(raw);
}

/** Validasi query string (?a=1&b=x) dengan skema objek. */
export function bacaQuery<T>(req: Request, skema: Skema<T>): T {
  const u = new URL(req.url);
  const o: Record<string, string> = {};
  u.searchParams.forEach((val, k) => { o[k] = val; });
  return skema.parse(o, "query");
}
