"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIdentitas } from "./IdentitasProvider";
import LogoSekolah from "./LogoSekolah";

const MENU = [
  { href: "/admin", ikon: "▤", label: "Ringkasan" },
  { href: "/admin/akses", ikon: "⚡", label: "Login & Terminal" },
  { href: "/admin/siswa", ikon: "☺", label: "Siswa" },
  { href: "/admin/keuangan", ikon: "💳", label: "Keuangan" },
  { href: "/admin/laporan", ikon: "▦", label: "Laporan Transaksi" },
  { href: "/admin/kebijakan", ikon: "⚙", label: "Kebijakan & Kuota" },
  { href: "/admin/perangkat", ikon: "⌨", label: "Perangkat" },
  { href: "/admin/staf", ikon: "♟", label: "Staf" },
  { href: "/admin/audit", ikon: "⏱", label: "Audit" },
  { href: "/admin/kantin", ikon: "☕", label: "Kantin" },
  { href: "/admin/laundry", ikon: "♨", label: "Laundry" },
  { href: "/admin/loker", ikon: "⊞", label: "Loker", pilot: true },
  { href: "/admin/perpus", ikon: "📖", label: "Perpus", pilot: true },
  { href: "/admin/vending", ikon: "⛁", label: "Vending", pilot: true },
];

export default function Sidebar() {
  const path = usePathname();
  const { identitas } = useIdentitas();
  const aktif = (href: string) =>
    href === "/admin" ? path === "/admin" : path.startsWith(href);

  return (
    <aside className="side">
      <div className="brand">
        {identitas.logo_landscape ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
            <LogoSekolah tipe="landscape" size={38} style={{ maxWidth: 200 }} />
            <small style={{ color: "var(--side-ink-2)", fontSize: 11 }}>Portal Manajemen Admin</small>
          </div>
        ) : (
          <>
            <LogoSekolah tipe="portrait" size={34} />
            <div style={{ minWidth: 0 }}>
              <b style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {identitas.nama_singkat || "Smart Campus"}
              </b>
              <small
                style={{
                  display: "block",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 150,
                  color: "var(--side-ink-2)",
                }}
                title={identitas.nama}
              >
                {identitas.nama || "Admin"}
              </small>
            </div>
          </>
        )}
      </div>
      <nav className="nav" aria-label="Menu utama">
        {MENU.map(m => (
          <Link key={m.href} href={m.href} className={aktif(m.href) ? "active" : undefined}
            aria-current={aktif(m.href) ? "page" : undefined}>
            <span className="ico">{m.ikon}</span> {m.label}
            {m.pilot ? (
              <span className="fase" style={{ borderColor: "var(--accent)", color: "#fff", background: "var(--accent)" }}>pilot</span>
            ) : null}
          </Link>
        ))}
      </nav>
      <div className="foot">
        v0.1 frontend · PRD v0.4 §7.10<br />
        {identitas.nama || "Smart Campus"}
      </div>
    </aside>
  );
}
