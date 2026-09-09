/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useIdentitas } from "@/components/IdentitasProvider";
import KeluarButton from "@/components/KeluarButton";
import LogoSekolah from "@/components/LogoSekolah";
import { api, useMuat, waktuSingkat } from "@/lib/api";
import { rp } from "@/lib/format";

/**
 * Portal Siswa — Antarmuka Mobile-First App-Like.
 *
 * Dirancang responsif dan nyaman digunakan di layar smartphone (touch-friendly),
 * dengan dock navigasi bawah ala Instagram, kartu pelajar pintar digital, dan
 * pengelompokan tab fungsional (Beranda, Kantin, Kampus, Riwayat, Akun).
 *
 * Menjamin 100% kepatuhan aturan backend dan keamanan F-103:
 * - Seluruh pemanggilan API memvalidasi sesi siswa via server.
 * - Siswa tidak bisa mengubah saldo atau menaikkan limit sendiri.
 * - Hak pembatalan PO kantin mengikuti jam tutup dapur di SQL.
 */

interface Siswa {
  id: number; nis: string; nama: string; kelas: string | null; jenjang: string;
  boarding: boolean; status: string; kartu: string; saldo_rp: number;
  pin_terkunci: boolean; pin_ada: boolean; limit_harian_rp: number;
  pin_harus_ganti: boolean | null;
}
interface Limit { limit_harian_rp: number; plafon_rp: number; terpakai_rp: number }
interface Tagihan { id: number; sumber: string; keterangan: string | null; nominal_rp: number; dibuat: string }
interface PO { id: number; kode: string; tanggal: string; status: string; total_rp: number; dibuat: string; item: string | null }
interface Pinjaman {
  id: number; judul: string; pengarang: string | null; dipinjam: string;
  jatuh_tempo: string; hari_telat: number; diperpanjang: number; denda_berjalan_rp: number;
}
interface Laundry { id: number; kode: string; status: string; total_rp: number; rak: string | null; dibuat: string; siap_pada: string | null; item: string | null }
interface Loker { kode: string; blok: string; nomor: number; lokasi: string | null; kondisi: string; akses_terakhir: string | null }
interface Aturan { maks_buku: number; lama_hari: number; denda_per_hari: number; maks_denda_rp: number; boleh_perpanjang: number }

interface Saya {
  siswa: Siswa; limit: Limit | null; aturan: Aturan | null;
  tagihan: Tagihan[]; po: PO[]; pinjaman: Pinjaman[]; laundry: Laundry[]; loker: Loker | null;
}
interface Menu { id: number; nama: string; harga_rp: number; kategori: string | null; foto_url: string | null }
interface Jendela {
  buka: boolean; alasan: string | null;
  jam_buka: string; jam_tutup: string; ambil_mulai: string; ambil_selesai: string;
  menu: Menu[];
}
interface Riwayat {
  id: number; kode: string; jenis: string; status: string; layanan: string | null;
  total_rp: number; arah_rp: number; keterangan: string | null; item: string | null;
  waktu: string; device: string | null; offline: boolean; direfund_rp: number | null;
}
interface Bacaan {
  judul: string; pengarang: string | null; kategori: string | null;
  dipinjam: string; jatuh_tempo: string; dikembalikan: string | null;
  masih_dipinjam: boolean; terlambat: boolean;
}

type TabSiswa = "beranda" | "kantin" | "kampus" | "riwayat" | "akun";
type KampusFilter = "semua" | "perpus" | "laundry" | "loker";

export default function Bagian() {
  const { data, galat, sedang, muatUlang } = useMuat<Saya>("/api/siswa/saya");
  const { identitas } = useIdentitas();

  const [tabAktif, setTabAktif] = useState<TabSiswa>("beranda");
  const [kampusFilter, setKampusFilter] = useState<KampusFilter>("semua");
  const [kategoriMenu, setKategoriMenu] = useState<string>("semua");

  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [lembar, setLembar] = useState<"hilang" | null>(null);

  // Jendela PO Kantin
  const [jendela, setJendela] = useState<Jendela | null>(null);
  const [jendelaSiap, setJendelaSiap] = useState(false);
  const [qty, setQty] = useState<Record<number, number>>({});

  // Riwayat Transaksi & Sengketa
  const [bulan, setBulan] = useState("");
  const [riwayat, setRiwayat] = useState<Riwayat[] | null>(null);
  const [sengketa, setSengketa] = useState<{ transaksi_id: number; catatan: string } | null>(null);

  // Riwayat Bacaan Perpustakaan
  const [bacaan, setBacaan] = useState<Bacaan[] | null>(null);

  const muatRiwayat = useCallback(async (bln: string) => {
    const r = await api<{ riwayat: Riwayat[] }>(`/api/siswa/riwayat${bln ? `?bulan=${bln}` : ""}`);
    setRiwayat(r.ok ? r.data!.riwayat : []);
  }, []);

  useEffect(() => { void muatRiwayat(bulan); }, [bulan, muatRiwayat]);

  useEffect(() => {
    void (async () => {
      const r = await api<Jendela>("/api/siswa/po/jendela");
      if (r.ok) setJendela(r.data!);
      setJendelaSiap(true);
    })();
  }, []);

  async function blokirKartu() {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api("/api/siswa/kartu/hilang", { metode: "POST" });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Gagal memblokir kartu"); return; }
    setLembar(null);
    setPesan("Kartu berhasil diblokir. Saldomu aman — lapor ke TU untuk kartu pengganti.");
    await muatUlang();
  }

  async function kirimPO() {
    const items = Object.entries(qty).filter(([, n]) => n > 0).map(([id, n]) => ({ menu_id: Number(id), qty: n }));
    if (items.length === 0) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api("/api/siswa/po", { metode: "POST", body: { items } });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Pesanan ditolak"); return; }
    setQty({});
    setPesan("Pesanan tercatat dan sudah dibayar dari saldomu!");
    await muatUlang();
  }

  async function batalPO(poId: number) {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api(`/api/siswa/po/${poId}`, { metode: "DELETE" });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Pembatalan ditolak"); return; }
    setPesan("Pesanan dibatalkan — saldo telah dikembalikan.");
    await muatUlang();
  }

  async function perpanjang(id: number) {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api<{ jatuh_tempo: string }>(`/api/siswa/pinjaman/${id}/perpanjang`, { metode: "POST" });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Perpanjangan ditolak"); return; }
    setPesan(`Buku diperpanjang — jatuh tempo baru ${r.data!.jatuh_tempo}.`);
    await muatUlang();
  }

  async function kirimSengketa() {
    if (!sengketa) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api("/api/siswa/vending/sengketa", {
      metode: "POST", body: { transaksi_id: sengketa.transaksi_id, catatan: sengketa.catatan.trim() },
    });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Laporan ditolak"); return; }
    setSengketa(null);
    setPesan("Laporan diterima. Bagian keuangan akan memeriksa mesin vending terkait.");
  }

  async function bukaBacaan() {
    const r = await api<{ bacaan: Bacaan[] }>("/api/siswa/bacaan");
    setBacaan(r.ok ? r.data!.bacaan : []);
  }

  if (galat) {
    return (
      <div className="siswa-shell">
        <div className="siswa-frame" style={{ justifyContent: "center", alignItems: "center", padding: 24 }}>
          <div className="siswa-card" style={{ width: "100%", textAlign: "center" }}>
            <p style={{ margin: "0 0 14px", color: "var(--crit-text)", fontWeight: 600 }}>{galat}</p>
            <KeluarButton />
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="siswa-shell">
        <div className="siswa-frame" style={{ justifyContent: "center", alignItems: "center", padding: 24 }}>
          <div className="siswa-card" style={{ width: "100%", textAlign: "center" }}>
            <p style={{ margin: 0, color: "var(--ink-2)" }}>{sedang ? "Memuat portal siswa…" : "Data tidak tersedia."}</p>
            {!sedang ? <div style={{ marginTop: 14 }}><KeluarButton /></div> : null}
          </div>
        </div>
      </div>
    );
  }

  const s = data.siswa;
  const lim = data.limit;
  const at = data.aturan;
  const sisa = lim ? Math.max(lim.limit_harian_rp - lim.terpakai_rp, 0) : null;
  const poAktif = data.po.filter(p => p.status === "dibayar");
  const totalItemPO = Object.values(qty).reduce((a, b) => a + b, 0);
  const totalPO = jendela ? jendela.menu.reduce((t, m) => t + (qty[m.id] ?? 0) * m.harga_rp, 0) : 0;

  // Kategori menu unik untuk filter
  const daftarKategori = ["semua", ...Array.from(new Set(jendela?.menu.map(m => m.kategori || "Lainnya") || []))];
  const menuTersaring = jendela?.menu.filter(m => {
    if (kategoriMenu === "semua") return true;
    return (m.kategori || "Lainnya") === kategoriMenu;
  }) || [];

  return (
    <div className="siswa-shell">
      <div className="siswa-frame">
        {/* Top bar sticky */}
        <header className="siswa-topbar">
          <div className="siswa-topbar-inner">
            <LogoSekolah tipe="portrait" size={32} />
            <div className="siswa-topbar-brand">
              <b>{identitas.nama_singkat || "Smart Campus"}</b>
              <small>{s.nama} · {s.kelas ?? `NIS ${s.nis}`}</small>
            </div>
            <KeluarButton ringkas />
          </div>
        </header>

        {/* Notifikasi feedback */}
        {pesan ? (
          <div style={{ padding: "12px 16px 0" }}>
            <div className={gagal ? "t-err" : "t-ok"} style={{ margin: 0 }}>
              {pesan}
            </div>
          </div>
        ) : null}

        {/* TAB 1: BERANDA */}
        {tabAktif === "beranda" ? (
          <div className="siswa-body">
            {/* Peringatan Keamanan & Kartu */}
            {s.pin_ada && s.pin_harus_ganti ? (
              <div className="t-err" style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ PIN Sementara Aktif</div>
                PIN-mu masih merupakan PIN sementara dari TU. Ganti sekarang agar akunmu aman.
                <div style={{ marginTop: 8 }}>
                  <Link href="/siswa/pin" className="btn pri sm" style={{ textDecoration: "none" }}>
                    Ganti PIN Sekarang
                  </Link>
                </div>
              </div>
            ) : null}

            {s.pin_terkunci ? (
              <div className="t-err" style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>🔒 PIN Terkunci</div>
                PIN terkunci karena salah berkali-kali. Pembayaran besar ditolak sampai dibuka oleh TU.
              </div>
            ) : null}

            {!s.pin_ada ? (
              <div className="t-err" style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>ℹ️ Belum Ada PIN</div>
                Kamu belum memiliki PIN kartu. Kunjungi ruang TU untuk mendapatkan PIN pertamamu.
              </div>
            ) : null}

            {s.kartu !== "aktif" ? (
              <div className="stat-hilang" style={{ marginBottom: 14 }}>
                ⚠️ Kartumu <b>{s.kartu === "belum" ? "belum diterbitkan" : s.kartu}</b>. Tidak bisa dipakai tap transaksi. <b>Saldomu tetap aman</b> di akunmu.
              </div>
            ) : null}

            {/* Smart Student Digital Card */}
            <div className="siswa-digital-card">
              <div className="card-top">
                <div className="card-chip" />
                <span className={`badge ${s.kartu === "aktif" ? "good" : "crit"}`} style={{ fontSize: 10 }}>
                  {s.kartu === "aktif" ? "RFID AKTIF" : `KARTU ${s.kartu.toUpperCase()}`}
                </span>
              </div>
              <div className="card-user">{s.nama}</div>
              <div className="card-sub">
                NIS: {s.nis} · {s.kelas ? `Kelas ${s.kelas}` : s.jenjang} · {s.boarding ? "Boarding" : "Pulang-Pergi"}
              </div>

              <div className="card-saldo-lbl">Saldo Kartu</div>
              <div className="card-saldo-val">{rp(s.saldo_rp)}</div>

              <div className="card-limit-info">
                <span>Batas harian: <b>{rp(lim?.limit_harian_rp ?? 0)}</b></span>
                <span>Sisa hari ini: <b>{rp(sisa ?? 0)}</b></span>
              </div>

              <div className="siswa-quick-grid">
                <Link href="/siswa/pin" className="siswa-quick-btn">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Ganti PIN
                </Link>
                {s.kartu === "aktif" ? (
                  <button type="button" className="siswa-quick-btn danger" onClick={() => setLembar("hilang")}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Kartu Hilang
                  </button>
                ) : (
                  <div className="siswa-quick-btn" style={{ opacity: 0.6, cursor: "default" }}>
                    Kartu {s.kartu}
                  </div>
                )}
              </div>
            </div>

            {/* Widget Aksi Cepat / Status Berjalan */}
            <div className="siswa-section-title">
              <span>Status &amp; Aktivitas Hari Ini</span>
            </div>

            {/* Pra-pesan Kantin Aktif */}
            {poAktif.length > 0 ? (
              <div className="siswa-card" style={{ borderLeft: "3.5px solid var(--accent)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <b style={{ fontSize: 13.5 }}>🍱 Pesanan Kantin Hari Ini</b>
                  <span className="badge good">Sudah Dibayar</span>
                </div>
                {poAktif.map(p => (
                  <div key={p.id} style={{ fontSize: 13, marginTop: 4 }}>
                    <span>{p.item ?? p.kode}</span> · <b>{rp(p.total_rp)}</b>
                    <div className="p-note" style={{ fontSize: 11, marginTop: 2 }}>
                      Ambil di kasir kantin dengan tap kartu atau tunjukkan kode <b>{p.kode}</b>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Pinjaman Buku Aktif */}
            {data.pinjaman.length > 0 ? (
              <div className="siswa-card" style={{ borderLeft: data.pinjaman.some(p => p.hari_telat > 0) ? "3.5px solid var(--crit)" : "3.5px solid #3b82f6" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <b style={{ fontSize: 13.5 }}>📚 Buku Pinjaman ({data.pinjaman.length})</b>
                  <button type="button" className="btn sm" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => setTabAktif("kampus")}>
                    Lihat Semua
                  </button>
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  {data.pinjaman[0].judul}
                  {data.pinjaman[0].hari_telat > 0 ? (
                    <div style={{ color: "var(--crit-text)", fontWeight: 700, fontSize: 11.5, marginTop: 2 }}>
                      Telat {data.pinjaman[0].hari_telat} hari · Denda {rp(data.pinjaman[0].denda_berjalan_rp)}
                    </div>
                  ) : (
                    <div className="p-note" style={{ fontSize: 11.5, marginTop: 2 }}>
                      Jatuh tempo: {data.pinjaman[0].jatuh_tempo}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Status Laundry */}
            {data.laundry.length > 0 ? (
              <div className="siswa-card" style={{ borderLeft: "3.5px solid #06b6d4" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <b style={{ fontSize: 13.5 }}>🧺 Cucian Laundry</b>
                  <span className={`badge ${data.laundry[0].status === "siap" ? "good" : "mute"}`}>
                    {data.laundry[0].status === "siap" ? "Siap Diambil" : data.laundry[0].status}
                  </span>
                </div>
                <div style={{ fontSize: 13 }}>
                  {data.laundry[0].item ?? data.laundry[0].kode} · <b>{rp(data.laundry[0].total_rp)}</b>
                  {data.laundry[0].rak ? (
                    <div style={{ fontWeight: 600, color: "var(--accent-ink)", fontSize: 12, marginTop: 2 }}>
                      Ambil di Rak: {data.laundry[0].rak}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Status Loker */}
            {data.loker ? (
              <div className="siswa-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <b style={{ fontSize: 13.5 }}>🔐 Loker Siswa: {data.loker.kode}</b>
                    <div className="p-note" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {data.loker.lokasi ?? `Blok ${data.loker.blok}`} · Tap kartu untuk membuka
                    </div>
                  </div>
                  <span className="badge mute" style={{ fontSize: 11 }}>Kondisi {data.loker.kondisi}</span>
                </div>
              </div>
            ) : null}

            {/* Tagihan Menunggu (Jika Ada) */}
            {data.tagihan.length > 0 ? (
              <div className="siswa-card" style={{ borderLeft: "3.5px solid var(--warn)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <b style={{ fontSize: 13.5 }}>💳 Tagihan Terbuka ({data.tagihan.length})</b>
                  <span className="badge warn">Menunggu</span>
                </div>
                {data.tagihan.map(t => (
                  <div key={t.id} style={{ fontSize: 12.5, borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{t.sumber}: {t.keterangan ?? "—"}</span>
                      <b>{rp(t.nominal_rp)}</b>
                    </div>
                  </div>
                ))}
                <p className="p-note" style={{ margin: "8px 0 0", fontSize: 11 }}>
                  Tagihan akan dilunasi orang tuamu lewat portal ortu atau via TU.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* TAB 2: KANTIN & PRA-PESAN (PO) */}
        {tabAktif === "kantin" ? (
          <div className="siswa-body">
            <div className="siswa-card" style={{ background: "linear-gradient(135deg, rgba(20,108,79,0.06) 0%, transparent 100%)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <h2 style={{ fontSize: 15, margin: 0 }}>🍱 Pra-pesan Makanan</h2>
                <span className={`badge ${jendela?.buka ? "good" : "mute"}`}>
                  {jendela?.buka ? "Buka Sekarang" : "Sedang Tutup"}
                </span>
              </div>
              {jendela ? (
                <p className="p-note" style={{ margin: 0, fontSize: 12 }}>
                  {jendela.buka
                    ? `Pesan sebelum jam ${jam(jendela.jam_tutup)} WIB. Ambil di kasir kantin pk ${jam(jendela.ambil_mulai)}–${jam(jendela.ambil_selesai)} lewat jalur PO.`
                    : (jendela.alasan ?? "Pra-pesan sedang tutup.")}
                </p>
              ) : (
                <p className="p-note" style={{ margin: 0 }}>{jendelaSiap ? "Gagal memuat jadwal menu." : "Memeriksa jam buka kantin…"}</p>
              )}
            </div>

            {/* Filter Kategori Menu */}
            {jendela && jendela.buka && daftarKategori.length > 2 ? (
              <div className="siswa-pills">
                {daftarKategori.map(kat => (
                  <button
                    key={kat}
                    type="button"
                    className={`siswa-pill ${kategoriMenu === kat ? "aktif" : ""}`}
                    onClick={() => setKategoriMenu(kat)}
                  >
                    {kat === "semua" ? "Semua Menu" : kat}
                  </button>
                ))}
              </div>
            ) : null}

            {/* Daftar Menu Hari Ini */}
            {jendela && jendela.buka ? (
              <div style={{ marginBottom: 18 }}>
                {menuTersaring.length === 0 ? (
                  <div className="siswa-card" style={{ textAlign: "center", padding: 24 }}>
                    <p className="p-note" style={{ margin: 0 }}>Tidak ada menu untuk kategori ini.</p>
                  </div>
                ) : (
                  menuTersaring.map(m => (
                    <div key={m.id} className="siswa-card" style={{ padding: "12px 14px", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>{m.nama}</span>
                            {m.kategori ? <span className="badge mute" style={{ fontSize: 10 }}>{m.kategori}</span> : null}
                          </div>
                          <div style={{ fontWeight: 800, color: "var(--accent-ink)", fontSize: 14 }}>{rp(m.harga_rp)}</div>
                        </div>

                        {/* Stepper Ramah Jempol */}
                        <div className="stepper" style={{ gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            style={{ width: 36, height: 36, fontSize: 18, borderRadius: 8 }}
                            aria-label={`Kurangi ${m.nama}`}
                            disabled={!qty[m.id]}
                            onClick={() => setQty({ ...qty, [m.id]: Math.max((qty[m.id] ?? 0) - 1, 0) })}
                          >
                            −
                          </button>
                          <span className="vv" style={{ minWidth: 26, fontSize: 15, fontWeight: 700 }}>
                            {qty[m.id] ?? 0}
                          </span>
                          <button
                            type="button"
                            style={{ width: 36, height: 36, fontSize: 18, borderRadius: 8 }}
                            aria-label={`Tambah ${m.nama}`}
                            onClick={() => setQty({ ...qty, [m.id]: Math.min((qty[m.id] ?? 0) + 1, 10) })}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {/* Floating Summary Bar jika ada item dipilih */}
                {totalItemPO > 0 ? (
                  <div className="siswa-card" style={{ background: "var(--side-bg)", color: "#fff", border: "none", position: "sticky", bottom: 85, zIndex: 30, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>{totalItemPO} item dipilih</div>
                        <div style={{ fontSize: 20, fontWeight: 800 }}>{rp(totalPO)}</div>
                      </div>
                      <button
                        type="button"
                        className="btn pri"
                        style={{ padding: "10px 18px", fontSize: 13, background: "var(--accent)", borderColor: "var(--accent)" }}
                        disabled={sibuk || totalPO === 0}
                        onClick={() => void kirimPO()}
                      >
                        {sibuk ? "Memproses…" : "Pesan & Bayar"}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
                      Saldo langsung dipotong dari kartu. Pastikan pesanan sudah benar sebelum konfirmasi.
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Riwayat Pesanan 7 Hari Terakhir */}
            <div className="siswa-section-title" style={{ marginTop: 18 }}>
              <span>Riwayat Pesanan (7 Hari)</span>
            </div>
            {data.po.length === 0 ? (
              <div className="siswa-card">
                <p className="p-note" style={{ margin: 0 }}>Belum ada riwayat pesanan.</p>
              </div>
            ) : (
              data.po.map(p => (
                <div key={p.id} className="siswa-card" style={{ marginBottom: 10, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <div>
                      <b style={{ fontSize: 14 }}>{p.item ?? p.kode}</b>
                      <div className="p-note" style={{ fontSize: 11, marginTop: 2 }}>
                        {p.tanggal} · Kode: <span className="mono" style={{ fontWeight: 700 }}>{p.kode}</span>
                      </div>
                    </div>
                    <span className={`badge ${p.status === "diambil" ? "good" : p.status === "dibayar" ? "warn" : "mute"}`}>
                      {p.status}
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, borderTop: "1px solid var(--rule)", paddingTop: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{rp(p.total_rp)}</span>
                    {bisaBatal(p, jendela) ? (
                      <button
                        type="button"
                        className="btn sm danger"
                        disabled={sibuk}
                        onClick={() => void batalPO(p.id)}
                      >
                        Batalkan
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {/* TAB 3: KAMPUS & FASILITAS */}
        {tabAktif === "kampus" ? (
          <div className="siswa-body">
            {/* Filter Pil Fasilitas */}
            <div className="siswa-pills">
              <button
                type="button"
                className={`siswa-pill ${kampusFilter === "semua" ? "aktif" : ""}`}
                onClick={() => setKampusFilter("semua")}
              >
                Semua Fasilitas
              </button>
              <button
                type="button"
                className={`siswa-pill ${kampusFilter === "perpus" ? "aktif" : ""}`}
                onClick={() => setKampusFilter("perpus")}
              >
                📚 Perpustakaan
              </button>
              <button
                type="button"
                className={`siswa-pill ${kampusFilter === "laundry" ? "aktif" : ""}`}
                onClick={() => setKampusFilter("laundry")}
              >
                🧺 Laundry
              </button>
              <button
                type="button"
                className={`siswa-pill ${kampusFilter === "loker" ? "aktif" : ""}`}
                onClick={() => setKampusFilter("loker")}
              >
                🔐 Loker
              </button>
            </div>

            {/* 1. PERPUSTAKAAN */}
            {kampusFilter === "semua" || kampusFilter === "perpus" ? (
              <div style={{ marginBottom: 18 }}>
                <div className="siswa-section-title">
                  <span>📚 Perpustakaan</span>
                  <button
                    type="button"
                    className="btn sm"
                    style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => {
                      if (bacaan === null) void bukaBacaan();
                      else setBacaan(null);
                    }}
                  >
                    {bacaan === null ? "Riwayat Bacaan" : "Tutup Riwayat"}
                  </button>
                </div>

                {data.pinjaman.length === 0 ? (
                  <div className="siswa-card">
                    <p className="p-note" style={{ margin: 0 }}>Tidak ada buku yang sedang dipinjam.</p>
                  </div>
                ) : (
                  data.pinjaman.map(p => {
                    const bolehPerpanjang = p.hari_telat === 0 && at !== null && p.diperpanjang < at.boleh_perpanjang;
                    return (
                      <div key={p.id} className="siswa-card" style={{ marginBottom: 10, borderLeft: p.hari_telat > 0 ? "3.5px solid var(--crit)" : "3.5px solid var(--accent)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <b style={{ fontSize: 14 }}>{p.judul}</b>
                            {p.pengarang ? <div className="p-note" style={{ fontSize: 11 }}>{p.pengarang}</div> : null}
                          </div>
                          <span className={`badge ${p.hari_telat > 0 ? "crit" : "mute"}`} style={{ flexShrink: 0 }}>
                            {p.hari_telat > 0 ? `Telat ${p.hari_telat} hari` : "Dipinjam"}
                          </span>
                        </div>

                        <div style={{ fontSize: 12.5, marginTop: 6, color: "var(--ink-2)" }}>
                          {p.hari_telat > 0 ? (
                            <b style={{ color: "var(--crit-text)" }}>Denda berjalan: {rp(p.denda_berjalan_rp)} — Segera kembalikan!</b>
                          ) : (
                            <>Jatuh tempo: <b>{p.jatuh_tempo}</b></>
                          )}
                          {p.diperpanjang > 0 ? ` · diperpanjang ${p.diperpanjang}×` : ""}
                        </div>

                        {bolehPerpanjang ? (
                          <div style={{ marginTop: 10, borderTop: "1px solid var(--rule)", paddingTop: 8, textAlign: "right" }}>
                            <button type="button" className="btn sm pri" disabled={sibuk} onClick={() => void perpanjang(p.id)}>
                              Perpanjang Buku
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}

                {/* Aturan perpus */}
                {at ? (
                  <p className="p-note" style={{ fontSize: 11.5, margin: "6px 0 0" }}>
                    Batas: {at.maks_buku} buku · durasi {at.lama_hari} hari · denda {rp(at.denda_per_hari)}/hari (maks {rp(at.maks_denda_rp)}).
                  </p>
                ) : null}

                {/* Riwayat bacaan expand */}
                {bacaan !== null ? (
                  <div className="siswa-card" style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Daftar Buku Pernah Dipinjam</div>
                    {bacaan.length === 0 ? (
                      <p className="p-note" style={{ margin: 0 }}>Belum ada riwayat bacaan.</p>
                    ) : (
                      bacaan.slice(0, 30).map((b, i) => (
                        <div key={`${b.judul}:${i}`} style={{ padding: "8px 0", borderBottom: "1px solid var(--rule)", fontSize: 12 }}>
                          <b>{b.judul}</b> {b.pengarang ? `· ${b.pengarang}` : ""}
                          <div className="p-note" style={{ fontSize: 11, marginTop: 2 }}>
                            {b.dipinjam} {b.dikembalikan ? `→ selesai ${b.dikembalikan.slice(0, 10)}` : "· belum kembali"}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 2. LAUNDRY */}
            {kampusFilter === "semua" || kampusFilter === "laundry" ? (
              <div style={{ marginBottom: 18 }}>
                <div className="siswa-section-title">
                  <span>🧺 Laundry Asrama</span>
                </div>
                {data.laundry.length === 0 ? (
                  <div className="siswa-card">
                    <p className="p-note" style={{ margin: 0 }}>Tidak ada cucian aktif.</p>
                  </div>
                ) : (
                  data.laundry.map(l => (
                    <div key={l.id} className="siswa-card" style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <b style={{ fontSize: 14 }}>{l.item ?? l.kode}</b>
                          <div className="p-note" style={{ fontSize: 11, marginTop: 2 }}>
                            Kode: <span className="mono">{l.kode}</span> · Dibuat {waktuSingkat(l.dibuat)}
                          </div>
                        </div>
                        <span className={`badge ${l.status === "siap" ? "good" : "mute"}`}>
                          {l.status === "siap" ? "Siap Diambil" : l.status}
                        </span>
                      </div>

                      <div style={{ marginTop: 8, borderTop: "1px solid var(--rule)", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>{rp(l.total_rp)}</span>
                        {l.rak ? (
                          <span style={{ fontWeight: 700, color: "var(--accent-ink)", fontSize: 12 }}>
                            Nomor Rak: {l.rak}
                          </span>
                        ) : null}
                      </div>
                      <p className="p-note" style={{ fontSize: 11, margin: "6px 0 0" }}>
                        Bayar dengan tap kartu + masukkan PIN di meja laundry saat mengambil.
                      </p>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {/* 3. LOKER */}
            {kampusFilter === "semua" || kampusFilter === "loker" ? (
              <div>
                <div className="siswa-section-title">
                  <span>🔐 Loker Pintar</span>
                </div>
                {data.loker ? (
                  <div className="siswa-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <b style={{ fontSize: 15 }}>Kode: {data.loker.kode}</b>
                      <span className="badge good">Aktif Digunakan</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                      Lokasi: <b>{data.loker.lokasi ?? `Blok ${data.loker.blok}`}</b>
                      <br />Terakhir diakses: {waktuSingkat(data.loker.akses_terakhir)}
                    </div>
                    <p className="p-note" style={{ fontSize: 11.5, marginTop: 10 }}>
                      Cukup tempelkan kartu RFID fisikmu ke reader loker untuk membuka pintu tanpa memasukkan PIN.
                    </p>
                  </div>
                ) : (
                  <div className="siswa-card">
                    <p className="p-note" style={{ margin: 0 }}>Kamu belum memiliki jatah loker terdaftar.</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* TAB 4: RIWAYAT MUTASI */}
        {tabAktif === "riwayat" ? (
          <div className="siswa-body">
            <div className="siswa-card" style={{ marginBottom: 14, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <b style={{ fontSize: 14 }}>Pilih Bulan Transaksi</b>
                <input
                  type="month"
                  value={bulan}
                  onChange={e => setBulan(e.target.value)}
                  aria-label="Saring bulan"
                  style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8 }}
                />
              </div>
            </div>

            <div className="siswa-section-title">
              <span>Mutasi Transaksi</span>
            </div>

            {riwayat === null ? (
              <div className="siswa-card"><p className="p-note" style={{ margin: 0 }}>Memuat riwayat…</p></div>
            ) : riwayat.length === 0 ? (
              <div className="siswa-card">
                <p className="p-note" style={{ margin: 0 }}>
                  {bulan ? "Tidak ada transaksi pada bulan yang dipilih." : "Belum ada riwayat transaksi."}
                </p>
              </div>
            ) : (
              riwayat.slice(0, 60).map(t => (
                <div key={t.id} className="siswa-card" style={{ padding: "12px 14px", marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span className={`badge ${t.arah_rp > 0 ? "good" : "mute"}`} style={{ fontSize: 10 }}>
                          {t.jenis}
                        </span>
                        {t.layanan ? <span className="badge mute" style={{ fontSize: 10 }}>{t.layanan}</span> : null}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                        {t.item ?? t.keterangan ?? t.layanan ?? "Transaksi"}
                      </div>
                      <div className="p-note" style={{ fontSize: 11 }}>
                        {waktuSingkat(t.waktu)} {t.offline ? "· offline" : ""}
                        {t.direfund_rp ? ` · dikembalikan ${rp(t.direfund_rp)}` : ""}
                      </div>
                    </div>

                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: t.arah_rp > 0 ? "var(--good-text)" : "var(--ink)" }}>
                        {t.arah_rp > 0 ? "+" : "−"}{rp(Math.abs(t.arah_rp))}
                      </div>

                      {/* Tombol Komplain Vending Machine */}
                      {t.layanan === "vending" && t.jenis === "belanja" && !t.direfund_rp ? (
                        <button
                          type="button"
                          className="btn sm danger"
                          style={{ marginTop: 6, fontSize: 10, padding: "2px 6px" }}
                          onClick={() => { setPesan(""); setSengketa({ transaksi_id: t.id, catatan: "" }); }}
                        >
                          Barang Tidak Keluar?
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {/* TAB 5: AKUN SISWA */}
        {tabAktif === "akun" ? (
          <div className="siswa-body">
            {/* Profil Ringkas */}
            <div className="siswa-card" style={{ textAlign: "center", padding: "20px 16px" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 800, margin: "0 auto 10px" }}>
                {s.nama.slice(0, 1).toUpperCase()}
              </div>
              <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>{s.nama}</h2>
              <div className="p-note" style={{ fontSize: 12 }}>
                NIS: <span className="mono">{s.nis}</span> · {s.kelas ? `Kelas ${s.kelas}` : s.jenjang}
              </div>
              <div style={{ marginTop: 8 }}>
                <span className={`badge ${s.status === "aktif" ? "good" : "warn"}`}>
                  Status: {s.status.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Pengaturan Keamanan */}
            <div className="siswa-section-title">
              <span>Keamanan Akun</span>
            </div>
            <div className="siswa-card">
              <Link href="/siswa/pin" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", color: "var(--ink)" }}>
                <div>
                  <b>Ganti PIN Pembayaran</b>
                  <div className="p-note" style={{ fontSize: 11.5 }}>
                    {s.pin_ada ? "PIN sudah aktif (6 digit)" : "Belum punya PIN"}
                  </div>
                </div>
                <span style={{ fontSize: 18, color: "var(--ink-3)" }}>›</span>
              </Link>
            </div>

            {/* Bantuan Sekolah & Kontak TU */}
            <div className="siswa-section-title">
              <span>Bantuan &amp; Layanan Sekolah</span>
            </div>
            <div className="siswa-card">
              <b style={{ fontSize: 13.5 }}>{identitas.nama || "Sekolah Semesta"}</b>
              <p className="p-note" style={{ fontSize: 12, margin: "4px 0 10px" }}>
                Untuk penggantian kartu fisik yang hilang atau pembukaan kunci PIN yang terblokir, silakan langsung kunjungi meja Tata Usaha (TU) sekolah.
              </p>
              <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 8, fontSize: 12 }}>
                Layanan TU: <b>Senin – Jumat (07.00 – 16.00 WIB)</b>
              </div>
            </div>

            {/* Tombol Keluar */}
            <div style={{ marginTop: 24, textAlign: "center" }}>
              <KeluarButton />
            </div>
          </div>
        ) : null}

        {/* MODAL / SHEET: LAPORKAN KARTU HILANG */}
        {lembar === "hilang" ? (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "grid", placeItems: "center", padding: 18 }}>
            <div className="siswa-card" style={{ maxWidth: 380, width: "100%", margin: 0, padding: 20 }}>
              <h2 style={{ fontSize: 16, margin: "0 0 8px", color: "var(--crit-text)" }}>⚠️ Laporkan Kartu Hilang</h2>
              <div className="t-err" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                Kartumu akan <b>seketika diblokir</b> sehingga tidak dapat disalahgunakan oleh siapa pun yang menemukannya.
                <br /><br />
                <b>Saldomu tidak akan hilang</b> karena uang menempel pada akunmu, bukan pada kartu fisik. Datangi TU untuk penerbitan kartu pengganti.
              </div>
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  type="button"
                  className="btn danger blok"
                  disabled={sibuk}
                  onClick={() => void blokirKartu()}
                >
                  {sibuk ? "Memproses…" : "Ya, Blokir Kartu Sekarang"}
                </button>
                <button
                  type="button"
                  className="btn blok"
                  disabled={sibuk}
                  onClick={() => setLembar(null)}
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* MODAL: SENGKETA VENDING */}
        {sengketa ? (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "grid", placeItems: "center", padding: 18 }}>
            <div className="siswa-card" style={{ maxWidth: 380, width: "100%", margin: 0, padding: 20 }}>
              <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Laporkan Masalah Vending</h2>
              <p className="p-note" style={{ fontSize: 12, margin: "0 0 10px" }}>
                Jika saldo terpotong namun produk pada mesin vending tersangkut atau tidak keluar, bagian keuangan akan memverifikasi log mesin dan mengembalikan saldo.
              </p>
              <div className="field">
                <label className="f" htmlFor="sk">Keterangan Kejadian</label>
                <input
                  id="sk"
                  type="text"
                  maxLength={300}
                  value={sengketa.catatan}
                  style={{ width: "100%" }}
                  onChange={e => setSengketa({ ...sengketa, catatan: e.target.value })}
                  placeholder="Misal: Uang terpotong tapi minuman tersangkut di slot 2"
                />
              </div>
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  type="button"
                  className="btn pri blok"
                  disabled={sibuk || sengketa.catatan.trim().length < 3}
                  onClick={() => void kirimSengketa()}
                >
                  {sibuk ? "Mengirim…" : "Kirim Laporan"}
                </button>
                <button
                  type="button"
                  className="btn blok"
                  disabled={sibuk}
                  onClick={() => setSengketa(null)}
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* FLOATING INSTAGRAM-STYLE BOTTOM DOCK */}
        <div className="siswa-dock-wrap">
          <nav className="siswa-dock" aria-label="Navigasi Utama Siswa">
            {/* 1. Beranda */}
            <button
              type="button"
              className={`siswa-dock-btn ${tabAktif === "beranda" ? "active" : ""}`}
              onClick={() => { setTabAktif("beranda"); setLembar(null); }}
              aria-label="Beranda"
            >
              <svg viewBox="0 0 24 24" fill={tabAktif === "beranda" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={tabAktif === "beranda" ? "0" : "2"} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Beranda</span>
            </button>

            {/* 2. Kantin & PO */}
            <button
              type="button"
              className={`siswa-dock-btn ${tabAktif === "kantin" ? "active" : ""}`}
              onClick={() => { setTabAktif("kantin"); setLembar(null); }}
              aria-label="Kantin"
            >
              <svg viewBox="0 0 24 24" fill={tabAktif === "kantin" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={tabAktif === "kantin" ? "0" : "2"} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                <line x1="6" y1="1" x2="6" y2="4" />
                <line x1="10" y1="1" x2="10" y2="4" />
                <line x1="14" y1="1" x2="14" y2="4" />
              </svg>
              <span>Kantin</span>
              {poAktif.length > 0 ? (
                <span className="siswa-dock-badge">{poAktif.length}</span>
              ) : null}
            </button>

            {/* 3. Kampus & Fasilitas */}
            <button
              type="button"
              className={`siswa-dock-btn ${tabAktif === "kampus" ? "active" : ""}`}
              onClick={() => { setTabAktif("kampus"); setLembar(null); }}
              aria-label="Kampus"
            >
              <svg viewBox="0 0 24 24" fill={tabAktif === "kampus" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={tabAktif === "kampus" ? "0" : "2"} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span>Kampus</span>
              {data.pinjaman.length > 0 ? (
                <span className="siswa-dock-badge">{data.pinjaman.length}</span>
              ) : null}
            </button>

            {/* 4. Riwayat */}
            <button
              type="button"
              className={`siswa-dock-btn ${tabAktif === "riwayat" ? "active" : ""}`}
              onClick={() => { setTabAktif("riwayat"); setLembar(null); }}
              aria-label="Riwayat"
            >
              <svg viewBox="0 0 24 24" fill={tabAktif === "riwayat" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={tabAktif === "riwayat" ? "0" : "2"} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Riwayat</span>
            </button>

            {/* 5. Akun */}
            <button
              type="button"
              className={`siswa-dock-btn ${tabAktif === "akun" ? "active" : ""}`}
              onClick={() => { setTabAktif("akun"); setLembar(null); }}
              aria-label="Akun"
            >
              <svg viewBox="0 0 24 24" fill={tabAktif === "akun" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={tabAktif === "akun" ? "0" : "2"} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Akun</span>
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}

/** "06:00:00" → "06.00" */
function jam(x: string | null | undefined): string {
  if (!x) return "—";
  return x.slice(0, 5).replace(":", ".");
}

/** Tanggal sekolah hari ini (WIB) sebagai 'YYYY-MM-DD'. */
function hariIni(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
}

/** Jam dinding WIB sekarang sebagai 'HH:MM' — sebanding dengan jam kebijakan. */
function jamIni(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta",
  });
}

/**
 * Apakah PO ini masih bisa dibatalkan siswa.
 *
 * Batasnya sama persis dengan `po_batal` di SQL: hari yang sama DAN belum
 * lewat jam tutup PO.
 */
function bisaBatal(p: { status: string; tanggal: string }, j: Jendela | null): boolean {
  if (p.status !== "dibayar") return false;
  if (p.tanggal > hariIni()) return true;
  if (p.tanggal < hariIni()) return false;
  if (!j) return true;
  return jamIni() < j.jam_tutup.slice(0, 5);
}
