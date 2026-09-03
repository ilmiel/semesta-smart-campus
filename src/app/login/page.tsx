"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { authClient } from "@/lib/auth-client";

/**
 * Login: Google Workspace (staf & siswa, dibatasi @semesta.sch.id oleh
 * parameter `hd` di server) + magic link untuk ortu.
 *
 * Alur: tombol → Better Auth → kembali ke /login → halaman ini menanyakan
 * /api/saya untuk tahu peran, lalu mengarahkan ke /admin, /siswa, atau /ortu.
 * Penentuan peran ada di server; halaman ini hanya mengikuti jawabannya.
 */
export default function LoginPage() {
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [cekSesi, setCekSesi] = useState(true);
  const [terkirim, setTerkirim] = useState(false);

  // Sudah punya sesi? (baru kembali dari Google / magic link, atau buka ulang)
  const arahkan = useCallback(async () => {
    try {
      const r = await fetch("/api/saya", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok && j.data?.masuk) {
        if (j.data.tujuan) { router.replace(j.data.tujuan); return; }
        // Login berhasil tapi email tidak terdaftar sebagai staf/siswa/wali.
        toast("Akun ini belum terdaftar di sekolah. Hubungi TU.");
        await authClient.signOut();
      }
    } catch {
      // Diamkan: kalau server tidak terjangkau, biarkan form login tampil.
    } finally {
      setCekSesi(false);
    }
  }, [router, toast]);

  useEffect(() => { void arahkan(); }, [arahkan]);

  async function masukGoogle() {
    setSibuk(true);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/login",
    });
    if (error) {
      toast(error.message ?? "Login Google gagal. Hubungi admin IT.");
      setSibuk(false);
    }
    // Kalau berhasil, browser dialihkan ke Google — tidak ada yang perlu dilakukan.
  }

  async function kirimLink() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast("Isi alamat email yang valid dulu");
      return;
    }
    setSibuk(true);
    const { error } = await authClient.signIn.magicLink({
      email: email.trim().toLowerCase(),
      callbackURL: "/login",
    });
    setSibuk(false);
    if (error) {
      toast(error.message ?? "Gagal mengirim link masuk. Coba lagi.");
      return;
    }
    // Server sengaja diam untuk email yang tidak terdaftar (mencegah orang
    // menebak-nebak email mana yang ada), jadi pesannya netral.
    setTerkirim(true);
  }

  if (cekSesi) {
    return (
      <div className="root">
        <div className="login-wrap">
          <div className="login-card">
            <div className="logo">S</div>
            <p className="p-note" style={{ textAlign: "center", margin: 0 }}>Memeriksa sesi…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="root">
      <div className="login-wrap">
        <div className="login-card">
          <div className="logo">S</div>
          <h1>Semesta Smart Campus</h1>
          <div className="s">Satu akun untuk kantin, wallet, dan layanan sekolah</div>

          <button type="button" className="btn blok" style={{ gap: 10 }}
            disabled={sibuk} onClick={masukGoogle}>
            <span style={{ fontWeight: 700 }}>G</span> Masuk dengan Google
          </button>
          <p className="p-note" style={{ textAlign: "center", margin: "8px 0 0" }}>
            Untuk staf &amp; siswa — hanya akun <b>@semesta.sch.id</b>
          </p>

          <div className="or">orang tua / wali</div>

          {terkirim ? (
            <>
              <p className="p-note" style={{ textAlign: "center", margin: 0 }}>
                Kalau <b>{email}</b> terdaftar di sekolah, link masuk sudah dikirim ke
                email tersebut. Link berlaku 5 menit.
              </p>
              <button type="button" className="btn blok" style={{ marginTop: 12 }}
                onClick={() => { setTerkirim(false); setEmail(""); }}>
                Kirim ulang / ganti email
              </button>
            </>
          ) : (
            <>
              <div className="field">
                <label className="f" htmlFor="email-ortu">Email yang terdaftar di sekolah</label>
                <input type="email" id="email-ortu" placeholder="nama@email.com"
                  style={{ width: "100%" }} value={email} disabled={sibuk}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") void kirimLink(); }} />
              </div>
              <button type="button" className="btn pri blok" disabled={sibuk} onClick={kirimLink}>
                {sibuk ? "Mengirim…" : "Kirim link masuk"}
              </button>
              <p className="p-note" style={{ textAlign: "center", marginTop: 12 }}>
                Tanpa password — link masuk dikirim ke email kamu dan berlaku 5 menit.
                Email belum terdaftar? Hubungi TU.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
