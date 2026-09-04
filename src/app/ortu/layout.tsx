import { headers } from "next/headers";
import { redirect } from "next/navigation";
import TanpaAkses from "@/components/TanpaAkses";
import { principalDariHeaders } from "@/server/sesi";

/**
 * Penjaga portal orang tua.
 *
 * Sebelum ini /ortu terbuka untuk siapa pun tanpa login — sama seperti
 * /admin. Halamannya masih mockup, jadi yang tampil cuma angka contoh, tapi
 * itu keberuntungan: begitu portal ini merender saldo dan riwayat anak
 * sungguhan (Fase 1.3), tidak adanya penjaga berarti data anak orang lain
 * bisa dibuka siapa saja yang menebak URL-nya.
 *
 * Syaratnya bukan sekadar "sudah login", melainkan "punya anak yang
 * diwalikan". Guru yang juga orang tua lolos karena barisnya ada di tabel
 * `wali`; staf tanpa anak di sekolah ini tidak — dan memang tidak seharusnya
 * bisa membuka portal orang tua.
 *
 * Penjaga ini lapisan kedua. Setiap route API portal tetap memeriksa
 * kepemilikan per anak (`wajibWaliDari`), karena wali yang sah pun tidak
 * boleh melihat anak orang lain.
 */
export default async function OrtuLayout({ children }: { children: React.ReactNode }) {
  const p = await principalDariHeaders(await headers());
  if (!p) redirect("/login");

  if (p.wali.length === 0) {
    return (
      <TanpaAkses
        email={p.email}
        judul="Portal orang tua"
        pesan={
          "Email ini tidak terdaftar sebagai wali murid mana pun. Kalau seharusnya terdaftar, "
          + "hubungi TU — email wali diisi dari data siswa, dan satu huruf yang salah membuat "
          + "portal tidak bisa dibuka."
        }
        tautan={[
          ...(p.peran.length > 0 ? [{ href: "/admin", label: "Dashboard staf" }] : []),
          ...(p.siswa ? [{ href: "/siswa", label: "Portal siswa" }] : []),
        ]}
      />
    );
  }

  return <>{children}</>;
}
