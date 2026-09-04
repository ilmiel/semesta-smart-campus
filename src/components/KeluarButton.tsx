"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * Tombol keluar.
 *
 * Sebelum ini tidak ada satu pun jalan keluar dari aplikasi: satu-satunya
 * cara berganti akun adalah menghapus cookie lewat devtools. Di komputer
 * bersama — meja TU, terminal kantin, laptop yang dipakai bergantian — itu
 * berarti sesi seseorang menempel sampai kedaluwarsa sendiri.
 *
 * Setelah keluar, halaman dimuat ulang penuh (bukan navigasi klien) supaya
 * tidak ada sisa data akun sebelumnya di memori tab ini.
 */
export default function KeluarButton({ ringkas }: { ringkas?: boolean }) {
  const [sibuk, setSibuk] = useState(false);

  async function keluar() {
    setSibuk(true);
    try {
      await authClient.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <button type="button" className={ringkas ? "btn sm" : "btn"} disabled={sibuk}
      onClick={() => void keluar()} style={ringkas ? undefined : { marginTop: 12 }}>
      {sibuk ? "Keluar…" : "Keluar"}
    </button>
  );
}
