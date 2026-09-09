"use client";

import { useState } from "react";
import Link from "next/link";
import { useMuat, waktuSingkat, sejak } from "@/lib/api";
import { rp, ribuan } from "@/lib/format";

interface Kpi {
  transaksi_hari_ini: number;
  omzet_hari_ini_rp: number | null;
  siswa_aktif: number;
  kartu_aktif: number;
  total_float_rp: number | null;
  device_online: number;
  device_total: number;
  antrian_tertunda: number;
  ditolak_hari_ini: number;
  pin_terkunci: number;
  kartu_dicabut_hari_ini: number;
  topup_hari_ini_rp: number | null;
  rekonsiliasi_terakhir: string | null;
  selisih_terakhir: number | null;
  kesejahteraan: number;
  tagihan_menunggu: number;
}

interface Transaksi {
  waktu: string;
  jenis: string;
  siswa: string | null;
  device: string | null;
  total_rp: number;
  layanan: string | null;
  item: string | null;
}

interface Ditolak {
  id: number;
  device: string;
  idempotency_key: string;
  kartu_uid: string | null;
  siswa_id: number | null;
  nama: string | null;
  nominal_rp: number;
  waktu_terminal: string;
  diterima: string;
  alasan_tolak: string | null;
}

interface PinTerkunci {
  siswa_id: number;
  nis: string;
  nama: string;
  terkunci_hingga: string;
  jumlah_kunci: number;
  permanen: boolean;
}

interface KartuDicabut {
  id: number;
  uid: string | null;
  status: string;
  dicabut: string;
  alasan: string | null;
  siswa_id: number;
  nis: string;
  nama: string;
  sudah_ada_pengganti: boolean;
}

interface DeviceBermasalah {
  id: number;
  kode: string;
  nama: string;
  layanan: string;
  lokasi: string | null;
  status: string;
  terakhir_online: string | null;
  antrian_tertunda: number;
}

interface Jam {
  jam: number;
  hitung: number;
  nominal_rp: number;
}

interface Isi {
  kpi: Kpi;
  per_jam: Jam[];
  transaksi_terakhir: Transaksi[];
  perhatian: {
    antrian_ditolak: Ditolak[];
    pin_terkunci: PinTerkunci[];
    kartu_dicabut: KartuDicabut[];
    device_bermasalah: DeviceBermasalah[];
  };
  peran: string[];
}

export default function Bagian() {
  const { data, galat, sedang, muatUlang } = useMuat<Isi>("/api/admin/beranda");
  const [layananFilter, setLayananFilter] = useState<string>("semua");
  const [periodeChart, setPeriodeChart] = useState<"hari_ini" | "7_hari">("hari_ini");
  const [pingingDevice, setPingingDevice] = useState<string | null>(null);

  if (galat) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-sm flex items-center justify-between">
        <div>
          <b>Gagal memuat beranda:</b> {galat}
        </div>
        <button
          type="button"
          onClick={() => void muatUlang()}
          className="px-3 py-1 bg-white border border-rose-300 rounded-xl text-xs font-semibold hover:bg-rose-100"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-medium">{sedang ? "Memuat dashboard admin…" : "Tidak ada data."}</p>
      </div>
    );
  }

  const k = data.kpi;
  const p = data.perhatian;
  const uang = k.omzet_hari_ini_rp !== null;

  // Filter daftar transaksi
  const daftarTransaksi = data.transaksi_terakhir.filter((t) => {
    if (layananFilter === "semua") return true;
    const l = (t.layanan || "").toLowerCase();
    const j = (t.jenis || "").toLowerCase();
    if (layananFilter === "kantin") return l.includes("kantin") || j.includes("kantin");
    if (layananFilter === "laundry") return l.includes("laundry") || j.includes("laundry");
    if (layananFilter === "loker") return l.includes("loker") || j.includes("loker");
    if (layananFilter === "perpus") return l.includes("perpus") || j.includes("perpus");
    if (layananFilter === "vending") return l.includes("vending") || j.includes("vending");
    return true;
  });

  // Perhitungan persentase status terminal
  const onlineCount = k.device_online;
  const totalDevice = Math.max(k.device_total, 1);
  const offlineCount = Math.max(0, k.device_total - k.device_online);
  const terminalPercent = Math.round((onlineCount / totalDevice) * 100);

  // Perhitungan data jam untuk chart
  const jamSlots = [
    { label: "06:00", jam: 6 },
    { label: "09:00", jam: 9 },
    { label: "12:00", jam: 12 },
    { label: "15:00", jam: 15 },
    { label: "18:00", jam: 18 },
    { label: "21:00", jam: 21 },
  ];

  const chartBars = jamSlots.map((slot) => {
    const hits = data.per_jam
      .filter((j) => j.jam >= slot.jam && j.jam < slot.jam + 3)
      .reduce((acc, curr) => acc + curr.hitung, 0);
    return { ...slot, hits };
  });

  const maxHits = Math.max(...chartBars.map((b) => b.hits), 1);
  const peakSlot = chartBars.reduce((prev, curr) => (curr.hits > prev.hits ? curr : prev), chartBars[0]);

  // Simulasi tombol Ping
  function handlePing(kode: string) {
    setPingingDevice(kode);
    setTimeout(() => {
      setPingingDevice(null);
    }, 1200);
  }

  // Tanggal Hari ini & Semester
  const tglFormatted = tanggalHariIni();
  const semesterStr = new Date().getMonth() >= 6 ? "Semester Ganjil" : "Semester Genap";

  return (
    <div className="space-y-5">
      {/* ============================================================ */}
      {/* 1. GREETING BAR & QUICK ACTIONS                              */}
      {/* ============================================================ */}
      <section
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 lg:px-6 lg:py-4 rounded-2xl border border-slate-200/80 shadow-xs"
        data-purpose="dashboard-greeting-bar"
      >
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 tracking-tight">
            Selamat Datang, <span className="text-[#133e2f]">Pak Ilmi</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Sistem Monitoring Terpadu Semesta Billing &amp; Smart Campus
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Semester Selector Pill */}
          <div className="inline-flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 transition">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect height="18" rx="2" strokeWidth="2" width="18" x="3" y="4"></rect>
              <line strokeWidth="2" x1="16" x2="16" y1="2" y2="6"></line>
              <line strokeWidth="2" x1="8" x2="8" y1="2" y2="6"></line>
              <line strokeWidth="2" x1="3" x2="21" y1="10" y2="10"></line>
            </svg>
            <span>{tglFormatted} · {semesterStr}</span>
          </div>

          {/* Top-Up Saldo Siswa Action */}
          <Link
            href="/admin/keuangan"
            className="inline-flex items-center gap-1.5 bg-[#133e2f] hover:bg-[#0b291e] text-emerald-300 font-semibold text-xs px-3.5 py-2 rounded-xl transition shadow-xs active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"></path>
            </svg>
            <span className="text-white">+ Top-Up Saldo Siswa</span>
          </Link>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => void muatUlang()}
            disabled={sedang}
            className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium px-3 py-2 rounded-xl transition active:scale-90"
            title="Muat ulang data"
          >
            <svg
              className={`w-3.5 h-3.5 text-slate-500 ${sedang ? "animate-spin text-emerald-600" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              ></path>
            </svg>
            <span>{sedang ? "Memuat…" : "Muat ulang"}</span>
          </button>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. KEY METRICS GRID                                          */}
      {/* ============================================================ */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5" data-purpose="metrics-and-charts">
        {/* Kolom Kiri: Dompet Kampus Semesta & Smartpass Card (Col 1-4) */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Dompet Kampus Semesta</h2>
                <p className="text-[11px] text-slate-400">Total dana mengendap siswa</p>
              </div>
              <Link
                href="/admin/keuangan"
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition"
                title="Kelola Keuangan"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                </svg>
              </Link>
            </div>

            {/* Smartpass Digital Card */}
            <div className="smartpass-card smartpass-pattern rounded-2xl p-4 text-white shadow-md relative overflow-hidden">
              <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-emerald-500/10 pointer-events-none" />
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black tracking-wider text-emerald-300">SMARTPASS</span>
                  <span className="text-[10px] bg-emerald-700/60 px-1.5 py-0.5 rounded text-emerald-100 font-medium">BBS</span>
                </div>
                {/* Contactless Wave Icon */}
                <svg className="w-5 h-5 text-emerald-300/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M8.5 16.5a5 5 0 010-7m3.5 9a9 9 0 000-11m3.5 13a13 13 0 000-15" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                </svg>
              </div>

              <div className="space-y-0.5 mb-4">
                <div className="text-[10px] tracking-wide text-emerald-200/90 font-medium uppercase">TOTAL SALDO SISWA</div>
                <div className="text-2xl font-bold tracking-tight text-white">
                  {uang ? rp(k.total_float_rp ?? 0) : "Terselubung"}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-700/40 text-emerald-200">
                <span className="tracking-widest font-mono text-[11px]">•••• {ribuan(k.kartu_aktif)} KARTU AKTIF</span>
                <span className="font-medium bg-black/20 px-2 py-0.5 rounded-full text-[10px]">
                  {ribuan(k.siswa_aktif)} Siswa
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Omzet Metric */}
          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">OMZET KANTIN HARI INI</div>
              <div className="text-base font-bold text-slate-900">
                {uang ? rp(k.omzet_hari_ini_rp ?? 0) : "—"}
              </div>
            </div>
            <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-xs font-semibold">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M5 10l7-7m0 0l7 7m-7-7v18" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"></path>
              </svg>
              <span>+12.8%</span>
            </div>
          </div>
        </div>

        {/* Kolom Tengah: Frekuensi Transaksi Per Jam (Col 5-9) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                    </svg>
                  </span>
                  <h2 className="text-sm font-bold text-slate-900">Frekuensi Transaksi</h2>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">Aktivitas ritme per jam terminal</p>
              </div>

              {/* Time toggles */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium text-slate-600">
                <button
                  type="button"
                  onClick={() => setPeriodeChart("7_hari")}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    periodeChart === "7_hari"
                      ? "bg-[#133e2f] text-white shadow-xs font-semibold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  7 Hari
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodeChart("hari_ini")}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    periodeChart === "hari_ini"
                      ? "bg-[#133e2f] text-white shadow-xs font-semibold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Hari Ini
                </button>
              </div>
            </div>

            {/* Custom Bar Graph Visualization */}
            <div className="relative h-44 flex items-end justify-between gap-3 px-2 pt-8 pb-2">
              {/* Grid line guides */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-40">
                <div className="border-b border-dashed border-slate-200 w-full h-0"></div>
                <div className="border-b border-dashed border-slate-200 w-full h-0"></div>
                <div className="border-b border-dashed border-slate-200 w-full h-0"></div>
                <div className="border-b border-dashed border-slate-200 w-full h-0"></div>
              </div>

              {chartBars.map((bar) => {
                const isPeak = bar.hits > 0 && bar.jam === peakSlot.jam;
                const pct = Math.max(14, Math.round((bar.hits / maxHits) * 88));

                return (
                  <div key={bar.label} className="flex-1 flex flex-col items-center gap-1.5 z-10 relative group">
                    {/* Peak Badge */}
                    {isPeak && (
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#133e2f] text-emerald-300 text-[9px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap shadow-xs">
                        +{bar.hits} peak
                      </div>
                    )}
                    <div
                      style={{ height: `${pct}%` }}
                      className={`w-full max-w-[28px] rounded-t-lg transition-all ${
                        isPeak
                          ? "bg-[#133e2f]"
                          : "bg-emerald-200 group-hover:bg-emerald-300"
                      }`}
                      title={`${bar.label}: ${bar.hits} transaksi`}
                    />
                    <span
                      className={`text-[10px] font-mono ${
                        isPeak ? "text-[#133e2f] font-bold" : "text-slate-400"
                      }`}
                    >
                      {bar.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Legend */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[11px]">Respon terminal normal: 12ms</span>
            </div>
            <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
              Pembaruan Realtime
            </span>
          </div>
        </div>

        {/* Kolom Kanan: Rekonsiliasi & Status Terminal (Col 10-12) */}
        <div className="lg:col-span-3 space-y-4 flex flex-col justify-between">
          {/* Mini Card 1: Rekonsiliasi Kas */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  REKONSILIASI KAS
                </span>
              </div>
              <span className="w-6 h-6 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-xs">
                ⏱
              </span>
            </div>

            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-base font-bold text-amber-700">
                {k.rekonsiliasi_terakhir === null ? "Belum Sync" : k.selisih_terakhir === 0 ? "Tersinkron" : "Ada Selisih"}
              </h3>
              {k.rekonsiliasi_terakhir === null ? (
                <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                  Audit Kasir
                </span>
              ) : (
                <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">
                  {waktuSingkat(k.rekonsiliasi_terakhir)}
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-400 mb-3">
              {k.selisih_terakhir !== null && k.selisih_terakhir !== 0
                ? `Selisih kas ${rp(k.selisih_terakhir)}`
                : "Ledger pencatatan kasir & gateway"}
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-[11px] text-slate-500">Ledger audit</span>
              <Link
                href="/admin/keuangan"
                className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-[#0f553e] text-xs font-semibold rounded-lg border border-emerald-200/80 transition"
              >
                Cocokkan
              </Link>
            </div>
          </div>

          {/* Mini Card 2: Status Terminal */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  STATUS TERMINAL
                </span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                {terminalPercent}% Normal
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div className="text-[10px] font-medium text-slate-400 uppercase">ONLINE</div>
                <div className="text-xl font-bold text-emerald-600">{onlineCount}</div>
              </div>
              <div className="bg-rose-50/70 p-2.5 rounded-xl border border-rose-100">
                <div className="text-[10px] font-medium text-rose-500 uppercase">OFFLINE</div>
                <div className="text-xl font-bold text-rose-600">{offlineCount}</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Pembaruan otomatis</span>
              <span className="font-medium text-slate-600">Real-time</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. PERLU PERHATIAN SECTION                                   */}
      {/* ============================================================ */}
      <section className="bg-white rounded-2xl p-4 lg:p-5 border border-slate-200/80 shadow-xs space-y-3" data-purpose="offline-devices-alert">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">Perlu Perhatian</h2>
            {p.device_bermasalah.length > 0 ? (
              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                {p.device_bermasalah.length} OFFLINE
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                SEMUA AMAN
              </span>
            )}
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-400">
              Antrian ditolak: {p.antrian_ditolak.length} · PIN terkunci: {p.pin_terkunci.length}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-semibold">
            <Link href="/admin/perangkat" className="text-[#0f553e] hover:underline flex items-center gap-1">
              Semua Device
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
              </svg>
            </Link>
          </div>
        </div>

        {/* Devices Row / Cards */}
        {p.device_bermasalah.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto no-scrollbar lg:grid lg:grid-cols-6 pt-1 pb-1">
            {p.device_bermasalah.map((d) => (
              <div
                key={d.id}
                className="min-w-[155px] flex-shrink-0 bg-slate-50/90 hover:bg-slate-50 border border-slate-200/90 rounded-xl p-3 flex flex-col justify-between transition"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-slate-800">{d.kode}</span>
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{d.lokasi || d.layanan} (offline)</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {d.terakhir_online ? sejak(d.terakhir_online) : "belum pernah aktif"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handlePing(d.kode)}
                  className="mt-3 w-full py-1 bg-white hover:bg-emerald-50 text-[#0f553e] border border-slate-200 hover:border-emerald-300 rounded-lg text-xs font-medium transition active:scale-95"
                >
                  {pingingDevice === d.kode ? "Pinging…" : "Ping"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 text-emerald-800 text-xs flex items-center gap-2">
            <span>✓</span> Seluruh terminal terhubung normal dan tidak ada antrian transaksi yang macet saat ini.
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* 4. FILTER PILLS LAYANAN MANDIRI                              */}
      {/* ============================================================ */}
      <section className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs" data-purpose="layanan-mandiri-service-filters">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Label Module */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect height="7" width="7" x="3" y="3"></rect>
                <rect height="7" width="7" x="14" y="3"></rect>
                <rect height="7" width="7" x="14" y="14"></rect>
                <rect height="7" width="7" x="3" y="14"></rect>
              </svg>
            </div>
            <div>
              <span className="font-bold text-xs text-slate-900 block">Layanan Mandiri</span>
              <span className="text-[11px] text-slate-400">Filter transaksi unit operasional</span>
            </div>
          </div>

          {/* Service Module Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0 custom-scrollbar">
            {/* 1. Semua Layanan */}
            <button
              type="button"
              onClick={() => setLayananFilter("semua")}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition ${
                layananFilter === "semua"
                  ? "bg-[#133e2f] text-white shadow-xs"
                  : "bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect height="7" width="7" x="3" y="3"></rect>
                <rect height="7" width="7" x="14" y="3"></rect>
                <rect height="7" width="7" x="14" y="14"></rect>
                <rect height="7" width="7" x="3" y="14"></rect>
              </svg>
              <span>Semua Layanan</span>
            </button>

            {/* 2. Kantin */}
            <button
              type="button"
              onClick={() => setLayananFilter("kantin")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition ${
                layananFilter === "kantin"
                  ? "bg-amber-600 text-white shadow-xs font-bold"
                  : "bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700"
              }`}
            >
              <span className={layananFilter === "kantin" ? "text-white" : "text-amber-500"}>🍱</span>
              <span>Kantin</span>
              <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-1.5 py-0.2 rounded-full">2 Pos</span>
            </button>

            {/* 3. Laundry */}
            <button
              type="button"
              onClick={() => setLayananFilter("laundry")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition ${
                layananFilter === "laundry"
                  ? "bg-sky-600 text-white shadow-xs font-bold"
                  : "bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700"
              }`}
            >
              <span className={layananFilter === "laundry" ? "text-white" : "text-sky-500"}>🧺</span>
              <span>Laundry</span>
            </button>

            {/* 4. Loker */}
            <button
              type="button"
              onClick={() => setLayananFilter("loker")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition ${
                layananFilter === "loker"
                  ? "bg-indigo-600 text-white shadow-xs font-bold"
                  : "bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700"
              }`}
            >
              <span className={layananFilter === "loker" ? "text-white" : "text-indigo-500"}>🔐</span>
              <span>Loker</span>
              <span className="text-[9px] bg-slate-200/80 text-slate-600 font-bold px-1.5 py-0.5 rounded">PILOT</span>
            </button>

            {/* 5. Perpustakaan */}
            <button
              type="button"
              onClick={() => setLayananFilter("perpus")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition ${
                layananFilter === "perpus"
                  ? "bg-teal-700 text-white shadow-xs font-bold"
                  : "bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700"
              }`}
            >
              <span className={layananFilter === "perpus" ? "text-white" : "text-teal-600"}>📚</span>
              <span>Perpus</span>
              <span className="text-[9px] bg-slate-200/80 text-slate-600 font-bold px-1.5 py-0.5 rounded">PILOT</span>
            </button>

            {/* 6. Vending Machine */}
            <button
              type="button"
              onClick={() => setLayananFilter("vending")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition ${
                layananFilter === "vending"
                  ? "bg-rose-600 text-white shadow-xs font-bold"
                  : "bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700"
              }`}
            >
              <span className={layananFilter === "vending" ? "text-white" : "text-rose-500"}>🥤</span>
              <span>Vending</span>
              <span className="text-[9px] bg-slate-200/80 text-slate-600 font-bold px-1.5 py-0.5 rounded">PILOT</span>
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. TRANSAKSI TERAKHIR (DESKTOP TABLE + MOBILE CARDS)         */}
      {/* ============================================================ */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden" data-purpose="recent-transactions-table">
        <div className="p-4 sm:p-5 pb-3 flex items-center justify-between border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Transaksi Terakhir</h2>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
                {daftarTransaksi.length} terbaru
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Rekapitulasi transaksi kartu tap &amp; mutasi dompet siswa
            </p>
          </div>
          <Link
            href="/admin/laporan"
            className="text-xs font-semibold text-[#0f553e] hover:text-[#0b291e] flex items-center gap-1"
          >
            Lihat Semua Buku Kas
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
            </svg>
          </Link>
        </div>

        {/* Tampilan Desktop: Tabel Lengkap */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-100">
                <th className="py-3 px-5">SISWA / PELANGGAN</th>
                <th className="py-3 px-4">WAKTU</th>
                <th className="py-3 px-4">LAYANAN &amp; DETAIL ITEM</th>
                <th className="py-3 px-4">STATUS</th>
                <th className="py-3 px-4">TERMINAL</th>
                <th className="py-3 px-5 text-right">NOMINAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {daftarTransaksi.map((t, idx) => {
                const nama = t.siswa || "Akun Siswa";
                const inisialNama = inisial(nama);
                const isTopup = t.jenis?.toLowerCase().includes("topup") || t.total_rp > 0 && t.jenis === "kredit";

                return (
                  <tr key={idx} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-[#0f553e] font-bold flex items-center justify-center text-xs">
                          {inisialNama}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{nama}</div>
                          <div className="text-[10px] text-slate-400">
                            {t.siswa ? "Siswa Aktif" : "Wali Murid"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <div className="font-medium text-slate-800">{waktuSingkat(t.waktu)}</div>
                      <div className="text-[10px] text-slate-400">{sejak(t.waktu)}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            t.layanan?.toLowerCase().includes("kantin")
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : t.layanan?.toLowerCase().includes("laundry")
                              ? "bg-sky-50 text-sky-700 border-sky-200"
                              : isTopup
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-50 text-slate-700 border-slate-200"
                          }`}
                        >
                          {t.layanan ? t.layanan.toUpperCase() : t.jenis}
                        </span>
                        <span className="text-slate-700 text-xs truncate max-w-xs">{t.item || "Transaksi Kartu"}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Berhasil
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {t.device || "GATEWAY"}
                      </span>
                    </td>
                    <td
                      className={`py-3.5 px-5 text-right font-bold ${
                        isTopup ? "text-emerald-700" : "text-slate-900"
                      }`}
                    >
                      {isTopup ? `+${rp(t.total_rp)}` : rp(t.total_rp)}
                    </td>
                  </tr>
                );
              })}

              {daftarTransaksi.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                    Tidak ada transaksi yang cocok dengan filter layanan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Tampilan Mobile: Feed Kartu Elegan */}
        <div className="md:hidden p-3 space-y-2.5">
          {daftarTransaksi.map((t, idx) => {
            const nama = t.siswa || "Akun Siswa";
            const inisialNama = inisial(nama);
            const isTopup = t.jenis?.toLowerCase().includes("topup") || t.total_rp > 0 && t.jenis === "kredit";

            return (
              <div
                key={idx}
                className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-[#0f553e] font-bold text-xs flex items-center justify-center shrink-0">
                      {inisialNama}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 leading-tight">{nama}</h4>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {t.siswa ? "Siswa Aktif" : "Wali Murid"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-xs font-black ${
                        isTopup ? "text-emerald-700" : "text-slate-900"
                      }`}
                    >
                      {isTopup ? `+${rp(t.total_rp)}` : rp(t.total_rp)}
                    </span>
                    <p className="text-[10px] text-slate-400 font-mono">{t.device || "GATEWAY"}</p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-2 border border-slate-100 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-700 overflow-hidden">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                        t.layanan?.toLowerCase().includes("kantin")
                          ? "bg-amber-100/80 text-amber-800"
                          : t.layanan?.toLowerCase().includes("laundry")
                          ? "bg-sky-100/80 text-sky-800"
                          : isTopup
                          ? "bg-emerald-100/80 text-emerald-800"
                          : "bg-slate-200/80 text-slate-700"
                      }`}
                    >
                      {t.layanan ? t.layanan.toUpperCase() : t.jenis}
                    </span>
                    <span className="truncate text-[10px] text-slate-600">{t.item || "Transaksi Kartu"}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 shrink-0 ml-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Berhasil
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                  <span>{waktuSingkat(t.waktu)}</span>
                  <span className="font-mono text-slate-400">{sejak(t.waktu)}</span>
                </div>
              </div>
            );
          })}

          {daftarTransaksi.length === 0 && (
            <div className="py-6 text-center text-slate-400 text-xs">
              Tidak ada transaksi yang cocok dengan filter layanan.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function inisial(x: string): string {
  const bagian = x.split(/[@\s.]+/).filter(Boolean);
  return ((bagian[0]?.[0] ?? "?") + (bagian[1]?.[0] ?? "")).toUpperCase();
}

function tanggalHariIni(): string {
  return new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}
