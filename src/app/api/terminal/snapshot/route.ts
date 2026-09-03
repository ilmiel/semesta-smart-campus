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
  const [dicabut, menu, tarif, kebijakan] = await Promise.all([
    fn("kartu_dicabut_sejak", [sejak ?? null]),
    d.layanan === "kantin" ? q(`SELECT * FROM v_menu_aktif`) : Promise.resolve([]),
    // Terminal laundry butuh daftar tarif untuk menyusun tiket; harganya
    // tetap dihitung ulang server saat laundry_terima (F-41).
    d.layanan === "laundry"
      ? q(`SELECT kode, nama, jenis::text AS jenis, harga_rp FROM tarif_laundry WHERE aktif ORDER BY jenis, nama`)
      : Promise.resolve([]),
    kebijakanTerminal(d),
  ]);
  const kartu_aktif = sejak ? undefined : await fn("snapshot_kartu_aktif", []);
  await q(`UPDATE device SET terakhir_sinkron = now() WHERE id = $1`, [d.id]);
  return ok({ waktu_server: new Date().toISOString(), device: d, kebijakan, kartu_dicabut: dicabut, kartu_aktif, menu, tarif });
});
