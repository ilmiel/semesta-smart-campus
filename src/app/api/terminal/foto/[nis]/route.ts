/**
 * GET /api/terminal/foto/[nis] — foto siswa untuk verifikasi visual (F-42).
 * Dilayani dari folder FOTO_SISWA_DIR/<nis>.jpg di server, cache singkat
 * (§8.1: terminal tidak menyimpan foto lebih dari sesi). Belum ada foto →
 * 204 (terminal menampilkan inisial).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { wajibDevice } from "@/server/device";
import { tangani } from "@/server/http";

export const GET = tangani<{ nis: string }>(async (req, { params }) => {
  await wajibDevice(req);
  const { nis } = await params;
  if (!/^[0-9A-Za-z-]{2,20}$/.test(nis)) return new Response(null, { status: 400 });
  const dir = process.env.FOTO_SISWA_DIR;
  if (!dir) return new Response(null, { status: 204 });
  try {
    const buf = await readFile(path.join(dir, `${nis}.jpg`));
    return new Response(new Uint8Array(buf), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=600" } });
  } catch {
    return new Response(null, { status: 204 });
  }
});
