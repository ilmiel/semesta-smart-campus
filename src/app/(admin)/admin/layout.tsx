import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import KeluarButton from "@/components/KeluarButton";
import TanpaAkses from "@/components/TanpaAkses";
import { principalDariHeaders } from "@/server/sesi";

/**
 * Penjaga akses seluruh area /admin.
 *
 * Sampai sekarang halaman admin tidak memeriksa apa pun: yang memeriksa
 * hanya route API-nya. Selama semua halaman masih mockup, yang bocor cuma
 * angka karangan — tapi itu keberuntungan, bukan desain. Begitu halaman
 * mulai merender data sungguhan di server (Fase 1.4b/1.4c), tidak adanya
 * penjaga di sini berarti kebocoran betulan.
 *
 * Penjaganya ditaruh di layout, bukan di tiap halaman, supaya halaman baru
 * ikut terlindungi secara otomatis — pengaman yang harus diingat untuk
 * dipasang di setiap berkas baru pasti suatu hari terlupa.
 *
 * Ini lapisan KEDUA, bukan satu-satunya. Setiap route API tetap memanggil
 * `wajibPeran()` sendiri, karena API bisa dipanggil langsung tanpa melewati
 * halaman mana pun.
 *
 * Yang TIDAK dilakukan penjaga ini: layout dipakai ulang antar navigasi di
 * dalam /admin, jadi pemeriksaan ini berjalan pada permintaan pertama dan
 * pada segmen yang benar-benar berganti — bukan setiap klik. Staf yang
 * perannya dicabut di tengah sesi masih melihat kerangka layar ini sampai
 * halaman dimuat ulang, tapi setiap datanya sudah ditolak server. Jangan
 * pernah memperlakukan layout sebagai titik penegakan.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const p = await principalDariHeaders(await headers());

  // Halaman login belum mendukung parameter "kembali ke halaman asal", jadi
  // tidak ada gunanya menambahkannya di sini — parameter yang tidak dibaca
  // siapa pun cuma membuat kode terlihat lebih pintar dari kenyataannya.
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

  return (
    <div className="app">
      <Sidebar />
      <main className="adm">
        <div className="adm-akun">
          <span className="chip-user">
            <span className="av">{inisial(p.nama || p.email)}</span> {p.email}
          </span>
          <span className="p-note">{p.peran.join(" · ")}</span>
          <KeluarButton ringkas />
        </div>
        {children}
      </main>
    </div>
  );
}

function inisial(x: string): string {
  const bagian = x.split(/[@\s.]+/).filter(Boolean);
  return ((bagian[0]?.[0] ?? "?") + (bagian[1]?.[0] ?? "")).toUpperCase();
}
