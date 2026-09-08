"use client";

import type { ImpersonasiInfo } from "@/server/sesi";

export default function BannerImpersonasi({ impersonasi }: { impersonasi: ImpersonasiInfo }) {
  const labelTipe = impersonasi.tipe === "siswa" ? "Siswa" : "Orang Tua";

  return (
    <div className="banner-impersonasi" role="alert">
      <div className="banner-imp-konten">
        <span className="banner-imp-badge">⚠️ MODE PENGECEKAN</span>
        <span className="banner-imp-teks">
          Staf <b>{impersonasi.adminEmail}</b> sedang melihat portal sebagai {labelTipe}:{" "}
          <b style={{ color: "var(--ink)" }}>{impersonasi.targetNama}</b>
        </span>
      </div>
      <a href="/api/admin/akses/batal" className="btn sm pri banner-imp-btn">
        ✕ Selesai &amp; Kembali ke Admin
      </a>
    </div>
  );
}
