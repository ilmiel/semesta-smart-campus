import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import TanpaAkses from "@/components/TanpaAkses";
import { principalDariHeaders } from "@/server/sesi";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const p = await principalDariHeaders(await headers());

  // Halaman login belum mendukung parameter "kembali ke halaman asal"
  if (!p) redirect("/login");

  if (p.peran.length === 0) {
    return (
      <TanpaAkses
        email={p.email}
        judul="Tidak ada akses staf"
        pesan={
          p.wali.length > 0 || p.siswa
            ? "Email ini tidak terdaftar sebagai staf, tapi punya akses ke portal lain."
            : "Email ini tidak terdaftar sebagai staf. Kalau seharusnya punya akses, minta admin IT "
              + "mendaftarkannya di halaman Staf & Peran."
        }
        tautan={[
          ...(p.wali.length > 0 ? [{ href: "/ortu", label: "Portal orang tua" }] : []),
          ...(p.siswa ? [{ href: "/siswa", label: "Portal siswa" }] : []),
        ]}
      />
    );
  }

  return <AdminShell user={p}>{children}</AdminShell>;
}

