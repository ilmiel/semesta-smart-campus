/**
 * POST /api/terminal/tap  { uid }
 * Identifikasi kartu untuk verifikasi visual kasir (F-42): nama, kelas, saldo.
 * Tidak memotong apa pun.
 */
import { fnSatu } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { ipKlien, ok, tangani } from "@/server/http";
import { identifikasi } from "@/server/terminal";
import { bacaBody, v } from "@/server/validasi";

const Body = v.obj({ uid: v.uid() });

export const POST = tangani(async (req) => {
  const d = await wajibDevice(req);
  const { uid } = await bacaBody(req, Body);
  const s = await identifikasi(d, uid, ipKlien(req));
  const pin = await fnSatu<{ ada: boolean; terkunci: boolean; harus_ganti: boolean }>("pin_info", [s.siswa_id]);
  return ok({
    siswa: { id: s.siswa_id, nis: s.nis, nama: s.nama, kelas: s.kelas, boarding: s.boarding, jenjang: s.jenjang },
    saldo_rp: s.saldo_rp,
    foto_url: `/api/terminal/foto/${s.nis}`,   // dilayani server, cache sesi saja (§8.1)
    pin: { ada: pin.ada, terkunci: pin.terkunci, harus_ganti: pin.harus_ganti },
  });
});
