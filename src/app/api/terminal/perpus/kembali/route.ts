/**
 * POST /api/terminal/perpus/kembali { barcode, pin?, petugas? }
 * Tanpa pin → buku diterima, denda (kalau ada) jadi tagihan menunggu (F-71).
 * Dengan pin → denda dipotong dari wallet; saldo kurang → tetap diterima, tagihan.
 */
import { fn, fnSatu, satu } from "@/server/db";
import { wajibDevice } from "@/server/device";
import { HttpError, ipKlien, ok, tangani } from "@/server/http";
import { verifikasiPinSiswa } from "@/server/pin";
import { auditJikaPerlu } from "@/server/terminal";
import { bacaBody, v } from "@/server/validasi";

export const POST = tangani(async (req) => {
  const d = await wajibDevice(req, "perpustakaan");
  const b = await bacaBody(req, v.obj({ barcode: v.str({ min: 2, max: 40 }), pin: v.pin().opsional(), petugas: v.str({ max: 60 }).opsional() }));
  const ip = ipKlien(req);
  let pinOk = false;
  if (b.pin) {
    // PIN milik peminjam aktif eksemplar ini
    const [sc] = await fn<{ pinjaman_id: number | null }>("perpus_scan", [b.barcode]);
    if (!sc?.pinjaman_id) throw new HttpError(409, "TIDAK_DIPINJAM", "eksemplar ini tidak sedang dipinjam");
    const p = await satu<{ siswa_id: number }>(`SELECT siswa_id FROM pinjaman WHERE id = $1`, [sc.pinjaman_id]);
    try {
      await verifikasiPinSiswa(p!.siswa_id, b.pin, d.id, ip);
      pinOk = true;
    } catch (e) {
      await auditJikaPerlu(d, "denda_perpus", e, { barcode: b.barcode }, ip);
      throw e;
    }
  }
  return ok(await fnSatu("perpus_kembali", [d.kode, b.barcode, pinOk, b.petugas ?? null]));
});
