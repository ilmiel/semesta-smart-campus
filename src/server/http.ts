/**
 * Bentuk respons API yang seragam + pembungkus handler.
 *
 *   sukses: 200 { ok: true, data: … }
 *   gagal : 4xx/5xx { ok: false, kode: "SALDO_KURANG", pesan: "saldo tidak mencukupi …" }
 *
 * `pesan` berbahasa Indonesia dan aman ditampilkan langsung ke kasir/ortu.
 */
import { DbError, petakanError } from "./db";
import { ValidasiError } from "./validasi";

export class HttpError extends Error {
  constructor(public status: number, public kode: string, pesan: string, public data?: unknown) {
    super(pesan);
    this.name = "HttpError";
  }
}

export function ok<T>(data: T, init: ResponseInit = {}): Response {
  return Response.json({ ok: true, data }, { status: 200, ...init });
}

export function gagal(status: number, kode: string, pesan: string, data?: unknown): Response {
  return Response.json({ ok: false, kode, pesan, ...(data !== undefined ? { data } : {}) }, { status });
}

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (req: Request, ctx: Ctx<P>) => Promise<Response>;

/**
 * Bungkus setiap route: kesalahan yang "diketahui" (validasi, aturan DB,
 * akses) jadi respons JSON rapi; sisanya 500 + log server (tanpa bocor detail).
 */
export function tangani<P = Record<string, never>>(h: Handler<P>): Handler<P> {
  return async (req, ctx) => {
    try {
      return await h(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return gagal(e.status, e.kode, e.message, e.data);
      if (e instanceof ValidasiError) return gagal(400, "VALIDASI", e.message, { lokasi: e.lokasi });
      const d = e instanceof DbError ? e : petakanError(e);
      if (d.status >= 500) {
        console.error(`[api] ${req.method} ${new URL(req.url).pathname} →`, d.message, d.detail ?? "");
        return gagal(500, "KESALAHAN_SERVER", "terjadi kesalahan di server — sudah dicatat");
      }
      return gagal(d.status, d.kode, d.message);
    }
  };
}

/** IP klien (di balik reverse proxy Nginx/Caddy pakai X-Forwarded-For). */
export function ipKlien(req: Request): string | null {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

/** CSV sederhana untuk ekspor (Excel Indonesia: pemisah ';'). */
export function csv(baris: Record<string, unknown>[], namaFile: string): Response {
  if (baris.length === 0) return new Response("", { headers: { "content-type": "text/csv; charset=utf-8" } });
  const kolom = Object.keys(baris[0]);
  const esc = (x: unknown) => {
    const s = x === null || x === undefined ? "" : x instanceof Date ? x.toISOString() : String(x);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const isi = [kolom.join(";"), ...baris.map((b) => kolom.map((k) => esc(b[k])).join(";"))].join("\r\n");
  return new Response("﻿" + isi, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${namaFile}"`,
    },
  });
}
