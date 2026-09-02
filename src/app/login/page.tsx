"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

/**
 * Login: Google Workspace (staf & siswa, dibatasi @semesta.sch.id) +
 * magic link untuk ortu. Belum tersambung backend — tombol memberi umpan
 * balik contoh. Implementasi asli: Better Auth (Fase 1a).
 */
export default function LoginPage() {
  const toast = useToast();
  const [email, setEmail] = useState("");

  return (
    <div className="root">
      <div className="login-wrap">
        <div className="login-card">
          <div className="logo">S</div>
          <h1>Semesta Smart Campus</h1>
          <div className="s">Satu akun untuk kantin, wallet, dan layanan sekolah</div>
          <button type="button" className="btn blok" style={{ gap: 10 }}
            onClick={() => toast("Login Google menyusul di Fase 1a (Better Auth)")}>
            <span style={{ fontWeight: 700 }}>G</span> Masuk dengan Google
          </button>
          <p className="p-note" style={{ textAlign: "center", margin: "8px 0 0" }}>
            Untuk staf &amp; siswa — hanya akun <b>@semesta.sch.id</b>
          </p>
          <div className="or">orang tua / wali</div>
          <div className="field">
            <label className="f" htmlFor="email-ortu">Email yang terdaftar di sekolah</label>
            <input type="email" id="email-ortu" placeholder="nama@email.com" style={{ width: "100%" }}
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <button type="button" className="btn pri blok"
            onClick={() => {
              if (!email.includes("@")) { toast("Isi alamat email yang valid dulu"); return; }
              toast(`Link masuk dikirim ke ${email} (contoh)`);
            }}>
            Kirim link masuk
          </button>
          <p className="p-note" style={{ textAlign: "center", marginTop: 12 }}>
            Tanpa password — link masuk dikirim ke email kamu dan berlaku 15 menit.
            Email belum terdaftar? Hubungi TU.
          </p>
        </div>
      </div>
    </div>
  );
}
