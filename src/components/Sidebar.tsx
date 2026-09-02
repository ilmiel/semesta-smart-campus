"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU: { href: string; ikon: string; label: string; pilot?: boolean }[] = [
  { href: "/admin", ikon: "◧", label: "Beranda" },
  { href: "/admin/siswa", ikon: "☷", label: "Siswa & Kartu" },
  { href: "/admin/kantin", ikon: "▤", label: "Kantin" },
  { href: "/admin/keuangan", ikon: "◫", label: "Keuangan" },
  { href: "/admin/perangkat", ikon: "⌸", label: "Perangkat" },
  { href: "/admin/laporan", ikon: "≣", label: "Laporan" },
  { href: "/admin/laundry", ikon: "◎", label: "Laundry", pilot: true },
  { href: "/admin/loker", ikon: "▦", label: "Loker", pilot: true },
  { href: "/admin/perpus", ikon: "🕮", label: "Perpustakaan", pilot: true },
  { href: "/admin/vending", ikon: "⛁", label: "Vending", pilot: true },
];

export default function Sidebar() {
  const path = usePathname();
  const aktif = (href: string) =>
    href === "/admin" ? path === "/admin" : path.startsWith(href);

  return (
    <aside className="side">
      <div className="brand">
        <div className="logo">S</div>
        <div><b>Smart Campus</b><small>Semesta BBS · Admin</small></div>
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
      <div className="foot">v0.1 frontend · PRD v0.4 §7.10<br />Semesta Bilingual Boarding School</div>
    </aside>
  );
}
