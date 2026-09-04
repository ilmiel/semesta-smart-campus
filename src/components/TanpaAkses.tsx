import Link from "next/link";
import KeluarButton from "@/components/KeluarButton";

/**
 * Layar "kamu masuk, tapi bukan ke sini".
 *
 * Dipakai penjaga /admin, /ortu, dan /siswa. Sengaja MENYEBUT email yang
 * sedang dipakai: penyebab paling sering bukan orang yang salah, melainkan
 * browser yang masih memegang sesi akun lain — dan tanpa menyebut emailnya,
 * orang akan mencoba hal yang sama berulang kali tanpa tahu apa yang salah.
 *
 * Tautan ke portal lain hanya muncul kalau akun ini memang punya akses ke
 * sana. Menawarkan tautan yang ujungnya juga menolak hanya memindahkan
 * kebingungan, tidak menyelesaikannya.
 */
export default function TanpaAkses({ email, judul, pesan, tautan }: {
  email: string;
  judul: string;
  pesan: string;
  tautan?: { href: string; label: string }[];
}) {
  return (
    <div className="root">
      <div className="t-shell" style={{ maxWidth: 560 }}>
        <section className="panel">
          <h1 style={{ fontSize: 18, margin: "0 0 6px" }}>{judul}</h1>
          <p className="p-note" style={{ marginTop: 0 }}>
            Kamu masuk sebagai <b>{email}</b>.
          </p>
          <p style={{ fontSize: 13.5 }}>{pesan}</p>
          {tautan && tautan.length > 0 ? (
            <p style={{ fontSize: 13.5 }}>
              {tautan.map((t, i) => (
                <span key={t.href}>
                  {i > 0 ? " · " : ""}
                  <Link href={t.href}>{t.label}</Link>
                </span>
              ))}
            </p>
          ) : null}
          <KeluarButton />
        </section>
      </div>
    </div>
  );
}
