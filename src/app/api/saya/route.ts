/**
 * GET /api/saya
 * Siapa yang sedang login, dan ke halaman mana dia seharusnya diarahkan.
 *
 * Dipakai halaman login setelah Google/magic link berhasil. Peran diambil
 * dari tabel sekolah pada setiap panggilan (lihat sesi.ts) — bukan dari isi
 * token, supaya pencabutan peran berlaku seketika.
 *
 * Tidak pernah mengembalikan hash PIN, saldo, atau data anak selain
 * jumlahnya: ini hanya untuk menentukan arah, bukan menampilkan data.
 */
import { ok, tangani } from "@/server/http";
import { principalDariRequest } from "@/server/sesi";

export const GET = tangani(async (req) => {
  const p = await principalDariRequest(req);
  if (!p) return ok({ masuk: false, tujuan: null });

  // Jika dalam mode impersonasi pengecekan, arahkan langsung ke portal sasaran
  const tujuan =
    p.impersonasi ? (p.impersonasi.tipe === "siswa" ? "/siswa" : "/ortu")
    : p.peran.length > 0 ? "/admin"
    : p.siswa ? "/siswa"
    : p.wali.length > 0 ? "/ortu"
    : null;

  return ok({
    masuk: true,
    email: p.email,
    nama: p.impersonasi ? p.impersonasi.targetNama : p.nama,
    peran: p.peran,
    siswa: p.siswa ? { nis: p.siswa.nis, nama: p.siswa.nama } : null,
    jumlah_anak: p.wali.length,
    tujuan,
  });
});
