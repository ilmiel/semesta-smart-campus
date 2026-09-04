import { headers } from "next/headers";
import { redirect } from "next/navigation";
import TanpaAkses from "@/components/TanpaAkses";
import { principalDariHeaders } from "@/server/sesi";

/**
 * Penjaga portal siswa.
 *
 * Syaratnya: email akun Google-nya terdaftar di kolom `email` tabel `siswa`
 * dengan status aktif atau cuti. Siswa yang sudah lulus atau keluar tidak
 * bisa masuk lagi — saldonya diselesaikan lewat TU, bukan lewat portal.
 *
 * Sama seperti /ortu dan /admin: ini lapisan kedua. Route API portal siswa
 * tetap memeriksa sendiri lewat `wajibSiswa()`, dan tidak pernah menerima
 * id siswa dari klien.
 */
export default async function SiswaLayout({ children }: { children: React.ReactNode }) {
  const p = await principalDariHeaders(await headers());
  if (!p) redirect("/login");

  if (!p.siswa) {
    return (
      <TanpaAkses
        email={p.email}
        judul="Portal siswa"
        pesan={
          "Email ini bukan akun siswa aktif. Siswa yang sudah lulus atau keluar tidak bisa "
          + "membuka portal — sisa saldo diselesaikan lewat TU."
        }
        tautan={[
          ...(p.peran.length > 0 ? [{ href: "/admin", label: "Dashboard staf" }] : []),
          ...(p.wali.length > 0 ? [{ href: "/ortu", label: "Portal orang tua" }] : []),
        ]}
      />
    );
  }

  return <>{children}</>;
}
