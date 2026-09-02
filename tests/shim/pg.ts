/**
 * PENGGANTI `pg` UNTUK UJI DI LINGKUNGAN TANPA npm (sandbox).
 * Menjalankan tiap query lewat proses `psql` (\bind untuk parameter, hasil
 * sebagai JSON). Hanya dipakai tests/ lewat tsconfig "paths"; aplikasi asli
 * memakai node-postgres. Perilaku yang ditiru: query(text, values) → { rows },
 * error dengan .code (SQLSTATE) dan .hint.
 */
import { spawnSync } from "node:child_process";

export interface QueryResultRow { [column: string]: any }
export interface QueryResult<R = QueryResultRow> { rows: R[]; rowCount: number | null }

function keTeks(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return "{" + v.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(",") + "}";
  if (typeof v === "object" && v !== null) return JSON.stringify(v);
  return String(v);
}

function jalankan(url: string, text: string, values: unknown[] = []): QueryResult {
  const kata = text.trim().split(/\s+/)[0].toUpperCase();
  const kembalikan = kata === "SELECT" || kata === "WITH" || /\bRETURNING\b/i.test(text);
  let sql: string;
  if (kata === "SELECT" || kata === "WITH") sql = `SELECT coalesce(json_agg(row_to_json(__t)), '[]'::json)::text AS j FROM (${text}) __t`;
  else if (kembalikan) sql = `WITH __t AS (${text}) SELECT coalesce(json_agg(row_to_json(__t)), '[]'::json)::text AS j FROM __t`;
  else sql = text;

  // $n → NULL literal untuk nilai null; sisanya dinomori ulang untuk \bind
  const urut: number[] = [];
  const sqlFinal = sql.replace(/\$(\d+)/g, (_, n: string) => {
    const i = Number(n) - 1;
    const v = values[i];
    if (v === null || v === undefined) return "NULL";
    let pos = urut.indexOf(i);
    if (pos < 0) { urut.push(i); pos = urut.length - 1; }
    return `$${pos + 1}`;
  });
  const bind = urut.length ? " \\bind " + urut.map((i) => `'${keTeks(values[i]).replace(/'/g, "''")}'`).join(" ") : "";
  const skrip = `\\set VERBOSITY verbose\n\\pset format unaligned\n\\pset tuples_only on\n${sqlFinal}${bind} \\g\n`;
  const r = spawnSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", url], { input: skrip, encoding: "utf8" });
  if (r.status !== 0) {
    const err = r.stderr;
    const m = /ERROR:\s+([0-9A-Z]{5}):\s+([^\n]*)/.exec(err);
    const h = /HINT:\s+([^\n]*)/.exec(err);
    const e = new Error(m ? m[2] : err.trim()) as Error & { code?: string; hint?: string };
    e.code = m ? m[1] : undefined; e.hint = h ? h[1].trim() : undefined;
    throw e;
  }
  if (!kembalikan) return { rows: [], rowCount: null };
  const out = r.stdout.trim();
  const rows = out ? (JSON.parse(out) as QueryResultRow[]) : [];
  return { rows, rowCount: rows.length };
}

export class PoolClient {
  constructor(private url: string) {}
  async query<R = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>> { return jalankan(this.url, text, values) as QueryResult<R>; }
  release(): void {}
}

export class Pool {
  private url: string;
  constructor(cfg: { connectionString?: string } = {}) { this.url = cfg.connectionString ?? process.env.DATABASE_URL ?? ""; }
  async query<R = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>> { return jalankan(this.url, text, values) as QueryResult<R>; }
  async connect(): Promise<PoolClient> { return new PoolClient(this.url); }
  on(): this { return this; }
  async end(): Promise<void> {}
}

export const types = { setTypeParser(): void {} };
