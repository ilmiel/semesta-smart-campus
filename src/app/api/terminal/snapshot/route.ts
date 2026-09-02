/**
 * GET /api/terminal/snapshot?sejak=<ISO>
 * Data untuk cache terminal (mode offline, F-03/F-43): kartu dicabut sejak
 * waktu tertentu, menu aktif, kebijakan. Tanpa `sejak` → juga daftar kartu
 * aktif lengkap (nama, kelas, saldo terakhir) — TANPA PIN, tanpa hash.
 */
import { fn, q } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { ok, tangani } from "@/server/http";
import { kebijakanTerminal } from "@/server/terminal";
import { bacaQuery, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  const d = await wajibDevice(req);
  const { sejak } = bacaQuery(req, v.obj({ sejak: v.str({ max: 40 }).opsional() }));
  const [dicabut, menu, kebijakan] = await Promise.all([
    fn("kartu_dicabut_sejak", [sejak ?? null]),
    d.layanan === "kantin" ? q(`SELECT * FROM v_menu_aktif`) : Promise.resolve([]),
    kebijakanTerminal(d),
  ]);
  const kartu_aktif = sejak ? undefined : await fn("snapshot_kartu_aktif", []);
  await q(`UPDATE device SET terakhir_sinkron = now() WHERE id = $1`, [d.id]);
  return ok({ waktu_server: new Date().toISOString(), device: d, kebijakan, kartu_dicabut: dicabut, kartu_aktif, menu });
});
