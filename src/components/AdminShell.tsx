"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoSekolah from "./LogoSekolah";
import { useIdentitas } from "./IdentitasProvider";
import BannerImpersonasi from "./BannerImpersonasi";
import { authClient } from "@/lib/auth-client";
import type { ImpersonasiInfo } from "@/server/sesi";

export interface AdminShellUser {
  email: string;
  nama: string | null;
  peran: string[];
  impersonasi?: ImpersonasiInfo | null;
  wali?: { waliId: number; siswaId: number; utama: boolean }[];
  siswa?: { id: number; nis: string; nama: string } | null;
}

interface AdminShellProps {
  user: AdminShellUser;
  children: React.ReactNode;
}

// Menu Navigasi Topbar Utama
const TOP_NAV = [
  { href: "/admin", label: "Ringkasan" },
  { href: "/admin/keuangan", label: "Keuangan" },
  { href: "/admin/siswa", label: "Siswa" },
  { href: "/admin/perangkat", label: "Perangkat & Terminal" },
  { href: "/admin/laporan", label: "Laporan Kas" },
  { href: "/admin/audit", label: "Audit Log" },
];

// Semua Modul Layanan Kampus
const SEMUA_MODUL = [
  {
    kategori: "Unit Layanan Mandiri",
    items: [
      { href: "/admin/kantin", label: "Kantin & Kafetaria", ikon: "🍱", badge: "2 Pos" },
      { href: "/admin/laundry", label: "Laundry Asrama", ikon: "🧺", badge: null },
      { href: "/admin/loker", label: "Loker Cerdas", ikon: "🔐", badge: "PILOT" },
      { href: "/admin/perpus", label: "Perpustakaan", ikon: "📚", badge: "PILOT" },
      { href: "/admin/vending", label: "Vending Machine", ikon: "🥤", badge: "PILOT" },
    ],
  },
  {
    kategori: "Kesiswaan & Staf",
    items: [
      { href: "/admin/siswa", label: "Data Siswa & Kartu", ikon: "🎓", badge: null },
      { href: "/admin/staf", label: "Staf & Peran", ikon: "👥", badge: null },
      { href: "/admin/akses", label: "Login & Terminal", ikon: "⚡", badge: null },
    ],
  },
  {
    kategori: "Keuangan & Audit",
    items: [
      { href: "/admin/keuangan", label: "Pusat Keuangan & Top-Up", ikon: "💳", badge: null },
      { href: "/admin/laporan", label: "Laporan Transaksi & Mutasi", ikon: "📊", badge: null },
      { href: "/admin/perangkat", label: "Monitoring Perangkat", ikon: "📡", badge: null },
      { href: "/admin/kebijakan", label: "Kebijakan & Kuota Harian", ikon: "⚙️", badge: null },
      { href: "/admin/audit", label: "Log Audit Sistem", ikon: "🛡️", badge: null },
    ],
  },
];

export default function AdminShell({ user, children }: AdminShellProps) {
  const path = usePathname();
  const { identitas } = useIdentitas();
  const [bukaModul, setBukaModul] = useState(false);
  const [bukaNotifikasi, setBukaNotifikasi] = useState(false);
  const [bukaAkun, setBukaAkun] = useState(false);
  const [keluarSibuk, setKeluarSibuk] = useState(false);
  const [modeTema, setModeTema] = useState<"light" | "dark">("light");

  const namaUser = user.nama || user.email.split("@")[0] || "Staf";
  const inisialUser = inisial(namaUser);
  const peranUtama = user.peran.includes("admin_it")
    ? "Super Admin"
    : user.peran.includes("keuangan")
    ? "Admin Keuangan"
    : user.peran[0] || "Staf Kampus";

  const aktif = (href: string) =>
    href === "/admin" ? path === "/admin" : path.startsWith(href);

  // Inisialisasi tema — default strictly "light", jangan by system
  useEffect(() => {
    const tersimpan = (typeof window !== "undefined" ? localStorage.getItem("smartcampus_mode") : null) as "light" | "dark" | null;
    const awal = tersimpan === "dark" ? "dark" : "light";
    setModeTema(awal);
    terapkanMode(awal);
  }, []);

  function terapkanMode(m: "light" | "dark") {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", m);
    if (m === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  function toggleModeTema() {
    const next = modeTema === "dark" ? "light" : "dark";
    setModeTema(next);
    try {
      localStorage.setItem("smartcampus_mode", next);
    } catch {}
    terapkanMode(next);
  }

  async function handleLogout() {
    setKeluarSibuk(true);
    try {
      await authClient.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f3f6f5] dark:bg-[#090e0c] text-slate-800 dark:text-slate-100 antialiased selection:bg-emerald-600 selection:text-white transition-colors duration-150">
      {/* ============================================================ */}
      {/* 1. TOP GLOBAL HEADER                                         */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#101713]/95 backdrop-blur-md border-b border-slate-200/70 dark:border-[#1e2e26] px-4 lg:px-8 py-3 shadow-xs transition-colors duration-150">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          {/* Brand Identity & Navigation */}
          <div className="flex items-center gap-6 lg:gap-10">
            {/* Logo & School Name */}
            <Link href="/admin" className="flex items-center gap-3 group text-decoration-none">
              <div className="w-9 h-9 rounded-xl bg-[#133e2f] flex items-center justify-center text-white shadow-sm shadow-[#133e2f]/20 group-hover:scale-105 transition">
                <LogoSekolah tipe="portrait" size={24} style={{ borderRadius: 4 }} />
              </div>
              <div>
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="font-bold text-slate-900 dark:text-white text-sm tracking-tight">
                    {identitas.nama_singkat || "Smart Campus"}
                  </span>
                </div>
                <span className="text-[10px] font-semibold tracking-wider text-emerald-700 dark:text-emerald-400 uppercase">
                  {identitas.nama || "SEMESTA BBS"}
                </span>
              </div>
            </Link>

            {/* Desktop Top Nav Pills */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 dark:bg-[#16221c] p-1 rounded-2xl text-xs font-medium text-slate-600 dark:text-slate-300 border border-transparent dark:border-[#1e2e26]">
              {TOP_NAV.map((item) => {
                const isAktif = aktif(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3.5 py-1.5 rounded-xl transition-all ${
                      isAktif
                        ? "bg-[#133e2f] dark:bg-emerald-600 text-white shadow-xs font-semibold"
                        : "text-slate-600 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-[#1c2c24]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Action Icons & Profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Tombol Buka Semua Modul (App Grid) */}
            <button
              type="button"
              onClick={() => setBukaModul(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200/80 dark:border-[#1e2e26] bg-slate-50 dark:bg-[#16221c] hover:bg-white dark:hover:bg-[#1c2c24] text-slate-700 dark:text-slate-200 text-xs font-medium transition shadow-xs"
              title="Daftar Semua Modul"
            >
              <svg className="w-4 h-4 text-emerald-700 dark:text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect height="7" rx="1.5" width="7" x="3" y="3"></rect>
                <rect height="7" rx="1.5" width="7" x="14" y="3"></rect>
                <rect height="7" rx="1.5" width="7" x="14" y="14"></rect>
                <rect height="7" rx="1.5" width="7" x="3" y="14"></rect>
              </svg>
              <span className="hidden sm:inline">Semua Modul</span>
            </button>

            {/* Tombol Notifikasi Sistem */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setBukaNotifikasi(!bukaNotifikasi)}
                className="relative p-2 rounded-xl border border-slate-200/80 dark:border-[#1e2e26] bg-slate-50 dark:bg-[#16221c] hover:bg-white dark:hover:bg-[#1c2c24] text-slate-600 dark:text-slate-300 transition shadow-xs"
                title="Notifikasi Sistem"
                aria-label="Notifikasi Sistem"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {/* Active Notification indicator dot */}
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#16221c]"></span>
              </button>

              {/* Popover Dropdown Notifikasi */}
              {bukaNotifikasi && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBukaNotifikasi(false)} />
                  <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#121c17] rounded-2xl shadow-xl border border-slate-200/90 dark:border-[#1e2e26] p-4 z-50 text-xs animate-fade-in">
                    <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100 dark:border-[#1e2e26]">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-sm">
                        <span>🔔 Notifikasi Sistem</span>
                      </div>
                      <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/40">
                        Live Normal
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#16221c] border border-slate-100 dark:border-[#1e2e26]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">Terminal &amp; Kasir POS</span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">12ms · Normal</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          Seluruh perangkat kartu RFID dan kasir terhubung stabil.
                        </p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#16221c] border border-slate-100 dark:border-[#1e2e26]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">Jadwal PO Kantin</span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">09:30 WIB</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          Jalur pemesanan pra-pesan ditutup pukul 09.30 WIB setiap hari.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Tombol Dark / Light Mode Toggle (Di samping Notifikasi) */}
            <button
              type="button"
              onClick={toggleModeTema}
              className="p-2 rounded-xl border border-slate-200/80 dark:border-[#1e2e26] bg-slate-50 dark:bg-[#16221c] hover:bg-white dark:hover:bg-[#1c2c24] text-slate-600 dark:text-slate-300 transition shadow-xs group"
              title={modeTema === "dark" ? "Beralih ke Mode Terang (Default)" : "Beralih ke Mode Gelap"}
              aria-label={modeTema === "dark" ? "Mode Terang" : "Mode Gelap"}
            >
              {modeTema === "dark" ? (
                // Ikon Matahari (Sun) saat mode gelap aktif
                <svg className="w-4 h-4 text-amber-400 group-hover:rotate-45 transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                // Ikon Bulan (Moon) saat mode terang aktif
                <svg className="w-4 h-4 text-slate-600 group-hover:-rotate-12 transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* User Profile Pill */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setBukaAkun(!bukaAkun)}
                className="flex items-center gap-2 p-1 pr-2 rounded-xl hover:bg-slate-50 dark:hover:bg-[#16221c] border border-transparent hover:border-slate-200 dark:hover:border-[#1e2e26] transition"
              >
                <div className="relative w-8 h-8 rounded-full bg-[#133e2f] text-emerald-300 font-bold flex items-center justify-center text-xs shadow-xs">
                  {inisialUser}
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#16221c]"></span>
                </div>
                <div className="hidden lg:block text-left leading-tight">
                  <div className="text-xs font-bold text-slate-800 dark:text-white">{namaUser}</div>
                  <div className="text-[10px] text-slate-400 font-medium">{peranUtama}</div>
                </div>
                <svg className="w-3.5 h-3.5 text-slate-400 hidden lg:block" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"></path>
                </svg>
              </button>

              {/* Profile Dropdown */}
              {bukaAkun && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBukaAkun(false)} />
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#121c17] rounded-2xl shadow-xl border border-slate-200/90 dark:border-[#1e2e26] py-2.5 z-50 text-xs animate-fade-in">
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-[#1e2e26]">
                      <div className="font-bold text-slate-900 dark:text-white text-sm">{namaUser}</div>
                      <div className="text-slate-500 dark:text-slate-400 text-[11px] truncate">{user.email}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {user.peran.map((p) => (
                          <span key={p} className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold text-[9px] border border-emerald-200/60 dark:border-emerald-800/40">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Switch Portal jika punya akses lain */}
                    {((user.wali && user.wali.length > 0) || user.siswa) && (
                      <div className="px-2 py-1.5 border-b border-slate-100 dark:border-[#1e2e26]">
                        <div className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-1">Ganti Portal</div>
                        {user.wali && user.wali.length > 0 && (
                          <Link href="/ortu" className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-[#16221c] text-slate-700 dark:text-slate-200">
                            <span>👨‍👩‍👧</span> Portal Orang Tua
                          </Link>
                        )}
                        {user.siswa && (
                          <Link href="/siswa" className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-[#16221c] text-slate-700 dark:text-slate-200">
                            <span>🎓</span> Portal Siswa
                          </Link>
                        )}
                      </div>
                    )}

                    <div className="p-2">
                      <button
                        type="button"
                        disabled={keluarSibuk}
                        onClick={() => void handleLogout()}
                        className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-semibold transition"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                          <polyline points="16 17 21 12 16 7"></polyline>
                          <line x1="21" x2="9" y1="12" y2="12"></line>
                        </svg>
                        {keluarSibuk ? "Keluar…" : "Keluar Akun"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Impersonation Banner jika sedang mode cek */}
      {user.impersonasi && <BannerImpersonasi impersonasi={user.impersonasi} />}

      {/* ============================================================ */}
      {/* 2. MAIN LAYOUT (DESKTOP VERTICAL SIDEBAR + CONTENT)          */}
      {/* ============================================================ */}
      <div className="max-w-[1600px] w-full mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-5 flex gap-4 lg:gap-5 items-start flex-1">
        {/* Dedicated Vertical Sidebar (Desktop only) */}
        <aside
          className="hidden lg:flex w-14 shrink-0 flex-col items-center bg-white dark:bg-[#101713] border border-slate-200/90 dark:border-[#1e2e26] rounded-2xl py-4 shadow-sm sticky top-20 min-h-[calc(100vh-6.5rem)] transition-colors duration-150"
          data-purpose="service-vertical-nav"
        >
          {/* Launcher Semua Modul */}
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setBukaModul(true)}
              className="w-10 h-10 rounded-xl bg-[#133e2f] text-emerald-400 flex items-center justify-center hover:bg-[#0b291e] transition shadow-sm group relative"
              title="Semua Modul"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <rect height="7" rx="1.5" width="7" x="3" y="3"></rect>
                <rect height="7" rx="1.5" width="7" x="14" y="3"></rect>
                <rect height="7" rx="1.5" width="7" x="14" y="14"></rect>
                <rect height="7" rx="1.5" width="7" x="3" y="14"></rect>
              </svg>
              <span className="absolute left-14 bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition whitespace-nowrap z-40 shadow-lg border border-slate-700/50">
                Semua Modul
              </span>
            </button>
          </div>

          <div className="w-8 h-[1px] bg-slate-200/80 dark:bg-[#1e2e26] mb-3" />

          {/* Campus Service Navigation Icons */}
          <nav className="flex flex-col items-center gap-2.5 w-full px-2">
            {/* 1. Overview */}
            <Link
              href="/admin"
              className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition ${
                path === "/admin"
                  ? "bg-emerald-50 dark:bg-[#162e22] text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-700/50 font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-slate-100 dark:hover:bg-[#16221c]"
              }`}
              title="Ringkasan"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="18" x2="18" y1="20" y2="10"></line>
                <line x1="12" x2="12" y1="20" y2="4"></line>
                <line x1="6" x2="6" y1="20" y2="14"></line>
              </svg>
              <span className="absolute left-14 bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition whitespace-nowrap z-40 shadow-lg border border-slate-700/50">
                Overview &amp; Monitoring
              </span>
            </Link>

            {/* 2. Kantin */}
            <Link
              href="/admin/kantin"
              className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition ${
                path.startsWith("/admin/kantin")
                  ? "bg-amber-50 dark:bg-[#2b210e] text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-700/50 font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-slate-100 dark:hover:bg-[#16221c]"
              }`}
              title="Kantin &amp; Kafetaria"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2"></path>
                <path d="M15 11v11"></path>
                <path d="M6 2v10a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V2"></path>
                <path d="M8 14v8"></path>
              </svg>
              <span className="absolute left-14 bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition whitespace-nowrap z-40 shadow-lg border border-slate-700/50">
                Kantin &amp; Dining
              </span>
            </Link>

            {/* 3. Laundry */}
            <Link
              href="/admin/laundry"
              className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition ${
                path.startsWith("/admin/laundry")
                  ? "bg-sky-50 dark:bg-[#0c2438] text-sky-800 dark:text-sky-300 border border-sky-200/80 dark:border-sky-700/50 font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-slate-100 dark:hover:bg-[#16221c]"
              }`}
              title="Laundry Mandiri"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect height="20" rx="2" width="16" x="4" y="2"></rect>
                <circle cx="12" cy="13" r="5"></circle>
                <path d="M12 10a3 3 0 0 1 3 3"></path>
                <circle cx="8" cy="6" r="1"></circle>
                <circle cx="11" cy="6" r="1"></circle>
              </svg>
              <span className="absolute left-14 bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition whitespace-nowrap z-40 shadow-lg border border-slate-700/50">
                Laundry Asrama
              </span>
            </Link>

            {/* 4. Loker */}
            <Link
              href="/admin/loker"
              className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition ${
                path.startsWith("/admin/loker")
                  ? "bg-indigo-50 dark:bg-[#1b1938] text-indigo-800 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-700/50 font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-slate-100 dark:hover:bg-[#16221c]"
              }`}
              title="Loker Cerdas"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect height="18" rx="2" width="18" x="3" y="3"></rect>
                <line x1="3" x2="21" y1="12" y2="12"></line>
                <circle cx="7" cy="7.5" fill="currentColor" r="1"></circle>
                <circle cx="7" cy="16.5" fill="currentColor" r="1"></circle>
              </svg>
              <span className="absolute left-14 bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition whitespace-nowrap z-40 shadow-lg border border-slate-700/50">
                Loker Siswa Otomatis
              </span>
            </Link>

            {/* 5. Perpustakaan */}
            <Link
              href="/admin/perpus"
              className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition ${
                path.startsWith("/admin/perpus")
                  ? "bg-emerald-50 dark:bg-[#162e22] text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-700/50 font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-slate-100 dark:hover:bg-[#16221c]"
              }`}
              title="Perpustakaan &amp; Literasi"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                <line x1="9" x2="16" y1="7" y2="7"></line>
                <line x1="9" x2="14" y1="11" y2="11"></line>
              </svg>
              <span className="absolute left-14 bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition whitespace-nowrap z-40 shadow-lg border border-slate-700/50">
                Perpustakaan
              </span>
            </Link>

            {/* 6. Vending Machine */}
            <Link
              href="/admin/vending"
              className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition ${
                path.startsWith("/admin/vending")
                  ? "bg-rose-50 dark:bg-[#331119] text-rose-800 dark:text-rose-300 border border-rose-200/80 dark:border-rose-700/50 font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-slate-100 dark:hover:bg-[#16221c]"
              }`}
              title="Vending Machine"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect height="20" rx="2" width="14" x="5" y="2"></rect>
                <rect height="6" rx="1" width="8" x="8" y="5"></rect>
                <line x1="8" x2="16" y1="15" y2="15"></line>
                <circle cx="12" cy="18" fill="currentColor" r="1.2"></circle>
              </svg>
              <span className="absolute left-14 bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition whitespace-nowrap z-40 shadow-lg border border-slate-700/50">
                Vending Mesin
              </span>
            </Link>

            {/* 7. Laporan Kas */}
            <Link
              href="/admin/laporan"
              className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition ${
                path.startsWith("/admin/laporan")
                  ? "bg-emerald-50 dark:bg-[#162e22] text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-700/50 font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-slate-100 dark:hover:bg-[#16221c]"
              }`}
              title="Laporan Kas &amp; Log Transaksi"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span className="absolute left-14 bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition whitespace-nowrap z-40 shadow-lg border border-slate-700/50">
                Riwayat &amp; Buku Kas
              </span>
            </Link>
          </nav>

          {/* Bottom Settings & Logout */}
          <div className="mt-auto flex flex-col items-center gap-2 pt-4 border-t border-slate-200/80 dark:border-[#1e2e26] w-full px-2">
            <Link
              href="/admin/kebijakan"
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition group relative ${
                path.startsWith("/admin/kebijakan")
                  ? "bg-slate-100 dark:bg-[#16221c] text-slate-800 dark:text-white"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#16221c]"
              }`}
              title="Kebijakan &amp; Pengaturan"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span className="absolute left-14 bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition whitespace-nowrap z-40 shadow-lg border border-slate-700/50">
                Kebijakan &amp; Kuota
              </span>
            </Link>

            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={keluarSibuk}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition group relative"
              title="Keluar Akun"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" x2="9" y1="12" y2="12"></line>
              </svg>
              <span className="absolute left-14 bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition whitespace-nowrap z-40 shadow-lg border border-slate-700/50">
                Keluar Sesi
              </span>
            </button>
          </div>
        </aside>

        {/* Content Container */}
        <main className="flex-1 min-w-0 p-4 lg:p-8 max-w-[1600px] mx-auto w-full pb-24 lg:pb-12">{children}</main>
      </div>

      {/* ============================================================ */}
      {/* 3. FLOATING MOBILE NAVIGATION DOCK (MOBILE ONLY)             */}
      {/* ============================================================ */}
      <nav
        className="lg:hidden fixed bottom-3 inset-x-0 z-50 px-4 flex justify-center pointer-events-none"
        data-purpose="bottom-floating-navigation"
      >
        <div className="pointer-events-auto max-w-sm w-full bg-white/95 dark:bg-[#101713]/95 backdrop-blur-xl border border-white/80 dark:border-[#1e2e26] rounded-full px-2.5 py-1.5 flex items-center justify-between shadow-float ring-1 ring-slate-900/5 dark:ring-white/5 transition-colors duration-150">
          {/* Ringkasan */}
          <Link
            href="/admin"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition active:scale-95 ${
              path === "/admin"
                ? "bg-[#133e2f] dark:bg-emerald-600 text-white shadow-sm font-bold"
                : "text-slate-600 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-300"
            }`}
          >
            <svg className="w-4 h-4 stroke-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" strokeLinecap="round" strokeLinejoin="round"></path>
            </svg>
            <span className="text-[11px] font-bold tracking-tight">Ringkasan</span>
          </Link>

          {/* Layanan (Sheet Trigger) */}
          <button
            type="button"
            onClick={() => setBukaModul(true)}
            className="flex flex-col items-center gap-0.5 text-slate-500 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-300 transition py-1 px-2 rounded-xl"
          >
            <svg className="w-4 h-4 stroke-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect height="7" rx="1.5" width="7" x="3" y="3"></rect>
              <rect height="7" rx="1.5" width="7" x="14" y="3"></rect>
              <rect height="7" rx="1.5" width="7" x="14" y="14"></rect>
              <rect height="7" rx="1.5" width="7" x="3" y="14"></rect>
            </svg>
            <span className="text-[9px] font-semibold">Layanan</span>
          </button>

          {/* Keuangan */}
          <Link
            href="/admin/keuangan"
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition ${
              path.startsWith("/admin/keuangan")
                ? "text-emerald-800 dark:text-emerald-300 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-300"
            }`}
          >
            <svg className="w-4 h-4 stroke-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="2" y="5" width="20" height="14" rx="2"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
            </svg>
            <span className="text-[9px] font-semibold">Keuangan</span>
          </Link>

          {/* Terminal */}
          <Link
            href="/admin/perangkat"
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition ${
              path.startsWith("/admin/perangkat")
                ? "text-emerald-800 dark:text-emerald-300 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-300"
            }`}
          >
            <svg className="w-4 h-4 stroke-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="2" y="3" width="20" height="14" rx="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <span className="text-[9px] font-semibold">Terminal</span>
          </Link>

          {/* Akun */}
          <button
            type="button"
            onClick={() => setBukaAkun(true)}
            className="flex flex-col items-center gap-0.5 text-slate-500 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-300 transition py-1 px-2 rounded-xl"
          >
            <div className="w-5 h-5 rounded-full bg-[#133e2f] text-emerald-300 text-[9px] font-bold flex items-center justify-center ring-1 ring-emerald-700/20 shadow-xs">
              {inisialUser}
            </div>
            <span className="text-[9px] font-semibold">Akun</span>
          </button>
        </div>
      </nav>

      {/* ============================================================ */}
      {/* 4. MODAL DRAWER: SEMUA MODUL                                 */}
      {/* ============================================================ */}
      {bukaModul && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div
            className="fixed inset-0"
            onClick={() => setBukaModul(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-2xl bg-white dark:bg-[#121c17] rounded-3xl shadow-2xl border border-slate-200 dark:border-[#1e2e26] p-5 sm:p-6 z-10 max-h-[90vh] overflow-y-auto custom-scrollbar transition-colors duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#1e2e26] mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-[#162e22] text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold">
                  🗂️
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">Semua Modul &amp; Layanan</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-400">Pusat Navigasi Administrasi Semesta Smart Campus</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBukaModul(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#16221c] hover:bg-slate-200 dark:hover:bg-[#1c2c24] text-slate-500 dark:text-slate-300 flex items-center justify-center text-lg leading-none transition"
              >
                ×
              </button>
            </div>

            <div className="space-y-6">
              {SEMUA_MODUL.map((grup) => (
                <div key={grup.kategori}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-2.5 px-1">
                    {grup.kategori}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {grup.items.map((item) => {
                      const isAktif = aktif(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setBukaModul(false)}
                          className={`flex items-center justify-between p-3 rounded-2xl border transition ${
                            isAktif
                              ? "bg-emerald-50/90 dark:bg-[#1a3327] border-emerald-300 dark:border-emerald-600/50 text-emerald-900 dark:text-emerald-300 font-bold shadow-xs"
                              : "bg-slate-50/60 dark:bg-[#16221c] hover:bg-white dark:hover:bg-[#1c2e25] border-slate-200/80 dark:border-[#1e2e26] text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-emerald-700/60"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-lg">{item.ikon}</span>
                            <span className="text-xs truncate">{item.label}</span>
                          </div>
                          {item.badge && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40 shrink-0">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-[#1e2e26] flex justify-end">
              <button
                type="button"
                onClick={() => setBukaModul(false)}
                className="btn sm"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function inisial(x: string): string {
  const bagian = x.split(/[@\s.]+/).filter(Boolean);
  return ((bagian[0]?.[0] ?? "?") + (bagian[1]?.[0] ?? "")).toUpperCase();
}
