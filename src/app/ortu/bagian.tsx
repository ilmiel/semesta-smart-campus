"use client";

import { useCallback, useEffect, useState } from "react";
import { useIdentitas } from "@/components/IdentitasProvider";
import KeluarButton from "@/components/KeluarButton";
import LogoSekolah from "@/components/LogoSekolah";
import { api, useMuat, waktuSingkat } from "@/lib/api";
import { rp } from "@/lib/format";

/**
 * Portal orang tua — data sungguhan, hanya anak sendiri.
 *
 * Pemisahan yang ditegakkan server (F-103): setiap endpoint memanggil
 * `wajibWaliDari(siswaId)`, jadi id anak yang datang dari klien selalu
 * diperiksa terhadap tabel `wali`. Layar ini tidak pernah menjadi penjaganya
 * — kalau seorang wali mengetik id anak orang lain di URL, servernya yang
 * menolak, bukan tab yang disembunyikan.
 *
 * Tiga hal yang sengaja dijelaskan apa adanya di layar, karena menyangkut
 * uang orang lain:
 *
 *   - Batas harian: yang berlaku adalah angka TERENDAH di antara dua orang
 *     tua. Tanpa penjelasan ini, satu orang tua menaikkan batas lalu bingung
 *     kenapa tidak berubah.
 *   - Membayar tagihan memotong SALDO ANAK, bukan menagih orang tua lewat
 *     gateway. Kalimatnya harus jelas sebelum tombolnya ditekan.
 *   - Melaporkan kartu hilang memblokir kartunya seketika. Saldo tidak ikut
 *     hilang — itu ketakutan pertama setiap orang tua, dan menjawabnya di
 *     layar lebih murah daripada menjawabnya di telepon.
 */

interface Siswa {
  id: number; nis: string; nama: string; kelas: string | null; jenjang: string;
  boarding: boolean; status: string; kartu: string; saldo_rp: number;
  pin_terkunci: boolean; pin_ada: boolean; limit_harian_rp: number;
}
interface Limit { limit_harian_rp: number; plafon_rp: number; terpakai_rp: number }
interface Tagihan { id: number; sumber: string; keterangan: string | null; nominal_rp: number; dibuat: string }
interface PO { id: number; kode: string; tanggal: string; status: string; total_rp: number; dibuat: string; item: string | null }
interface Pinjaman { id: number; judul: string; pengarang: string | null; dipinjam: string; jatuh_tempo: string; hari_telat: number; diperpanjang: number }
interface Laundry { id: number; kode: string; status: string; total_rp: number; rak: string | null; dibuat: string; siap_pada: string | null; item: string | null }
interface Loker { kode: string; blok: string; nomor: number; lokasi: string | null; kondisi: string; akses_terakhir: string | null }

interface Anak {
  wali_id: number; utama: boolean;
  siswa: Siswa; limit: Limit | null;
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

interface TopupInfo {
  metode: "verifikasi_admin" | "gateway";
  bank: {
    nama: string;
    rekening: string;
    atas_nama: string;
    petunjuk: string;
  };
  topup_min_rp: number;
  topup_max_rp: number;
}

const NOMINAL = [50000, 100000, 200000, 300000, 500000];

function kompresGambar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        const maxDim = 1200;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(e.target?.result as string);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = () => reject(new Error("Gagal membaca file gambar"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsDataURL(file);
  });
}

type TabNav = "beranda" | "keuangan" | "kantin" | "riwayat" | "akun";

export default function Bagian() {
  const { data, galat, sedang, muatUlang } = useMuat<{ anak: Anak[] }>("/api/ortu/anak");
  const [saya, setSaya] = useState<{ nama: string; email: string } | null>(null);
  const [pilih, setPilih] = useState<number | null>(null);
  const [tabAktif, setTabAktif] = useState<TabNav>("beranda");
  const [lembar, setLembar] = useState<"topup" | "limit" | "hilang" | null>(null);
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  const [nominal, setNominal] = useState(100000);
  const [invoice, setInvoice] = useState<{ url: string; topup_id: number; gateway: string } | null>(null);
  const [limitBaru, setLimitBaru] = useState("");

  // State Top-up Verifikasi Manual
  const [topupInfo, setTopupInfo] = useState<TopupInfo | null>(null);
  const [buktiFoto, setBuktiFoto] = useState<string | null>(null);
  const [catatanWali, setCatatanWali] = useState("");
  const [suksesTransfer, setSuksesTransfer] = useState(false);
  const [salinSukses, setSalinSukses] = useState(false);
  const [sedangKompres, setSedangKompres] = useState(false);

  // Jendela PO dimuat saat halaman dibuka, bukan saat "Lihat menu" ditekan —
  // tombol "Batalkan" di daftar pesanan butuh JAM tutup PO, bukan hanya
  // tanggalnya. Lihat `bisaBatal` di bawah.
  const [jendela, setJendela] = useState<Jendela | null>(null);
  const [jendelaSiap, setJendelaSiap] = useState(false);
  const [tampilMenu, setTampilMenu] = useState(false);
  const [qty, setQty] = useState<Record<number, number>>({});

  const [bulan, setBulan] = useState("");
  const [riwayat, setRiwayat] = useState<Riwayat[] | null>(null);
  const [sengketa, setSengketa] = useState<{ transaksi_id: number; catatan: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<{ nama: string; email: string }>("/api/saya");
      if (r.ok) setSaya({ nama: r.data!.nama, email: r.data!.email });
    })();
    void (async () => {
      const r = await api<Jendela>("/api/ortu/po/jendela");
      if (r.ok) setJendela(r.data!);
      setJendelaSiap(true);   // gagal pun harus diketahui: lihat panel di bawah
    })();
    void (async () => {
      const r = await api<TopupInfo>("/api/ortu/topup-info");
      if (r.ok) setTopupInfo(r.data!);
    })();
  }, []);

  const daftar = data?.anak ?? [];
  const a = daftar.find(x => x.siswa.id === pilih) ?? daftar[0] ?? null;

  const muatRiwayat = useCallback(async (siswaId: number, bln: string) => {
    const r = await api<{ riwayat: Riwayat[] }>(
      `/api/ortu/anak/${siswaId}/riwayat${bln ? `?bulan=${bln}` : ""}`);
    setRiwayat(r.ok ? r.data!.riwayat : []);
  }, []);

  // Bergantung pada id-nya, bukan pada objek `a`: kalau suatu saat `daftar`
  // dibangun ulang tiap render, bergantung pada objek akan memicu pemuatan
  // tanpa henti.
  const idAnak = a?.siswa.id;
  useEffect(() => {
    if (idAnak !== undefined) void muatRiwayat(idAnak, bulan);
  }, [idAnak, bulan, muatRiwayat]);

  async function bukaTopup() {
    setPesan(""); setGagal(false); setInvoice(null); setSuksesTransfer(false);
    setBuktiFoto(null); setCatatanWali("");
    const r = await api<TopupInfo>("/api/ortu/topup-info");
    if (r.ok) setTopupInfo(r.data!);
    setTabAktif("keuangan");
  }

  async function kirimTransferManual() {
    if (!a) return;
    if (!buktiFoto) {
      setPesan("Silakan pilih atau foto bukti transfer terlebih dahulu.");
      setGagal(true);
      return;
    }
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api<{ topup_id: number; status: string }>(
      `/api/ortu/anak/${a.siswa.id}/topup`,
      {
        metode: "POST",
        body: {
          nominal_rp: nominal,
          metode: "verifikasi_admin",
          bukti_foto: buktiFoto,
          catatan: catatanWali.trim() || undefined,
        },
      }
    );
    setSibuk(false);
    if (!r.ok) {
      setGagal(true);
      setPesan(r.pesan ?? "Gagal mengirim bukti transfer");
      return;
    }
    setSuksesTransfer(true);
    setPesan(`Permintaan top-up ${rp(nominal)} berhasil dikirim! Menunggu verifikasi staf keuangan.`);
    await muatUlang();
    if (idAnak !== undefined) void muatRiwayat(idAnak, bulan);
  }

  async function buatTopup() {
    if (!a) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api<{ topup_id: number; url: string; gateway: string }>(
      `/api/ortu/anak/${a.siswa.id}/topup`, { metode: "POST", body: { nominal_rp: nominal } });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Gagal membuat tagihan top-up"); return; }
    setInvoice({ url: r.data!.url, topup_id: r.data!.topup_id, gateway: r.data!.gateway });
  }

  async function cekTopup() {
    if (!invoice) return;
    setSibuk(true);
    const r = await api<{ status: string }>(`/api/ortu/topup/${invoice.topup_id}`);
    setSibuk(false);
    if (!r.ok) return;
    if (r.data!.status === "lunas") {
      setInvoice(null); setLembar(null);
      setPesan("Top-up berhasil — saldo sudah bertambah."); setGagal(false);
      await muatUlang();
    } else {
      setPesan(`Status pembayaran: ${r.data!.status}. Kalau sudah membayar, tunggu sebentar lalu cek lagi.`);
      setGagal(false);
    }
  }

  async function simpanLimit() {
    if (!a) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api<{ limit_efektif_rp: number }>(`/api/ortu/anak/${a.siswa.id}/limit`, {
      metode: "PUT", body: { limit_harian_rp: Number(limitBaru) },
    });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Gagal menyimpan batas"); return; }
    setLembar(null);
    setPesan(`Batas harian yang berlaku sekarang ${rp(r.data!.limit_efektif_rp)}.`);
    await muatUlang();
  }

  async function blokirKartu() {
    if (!a) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api(`/api/ortu/anak/${a.siswa.id}/kartu/blokir`, { metode: "POST" });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Gagal memblokir kartu"); return; }
    setLembar(null);
    setPesan("Kartu diblokir. Saldo tetap utuh — hubungi TU untuk kartu pengganti.");
    await muatUlang();
  }

  async function bayarTagihan(id: number) {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api(`/api/ortu/tagihan/${id}/bayar`, { metode: "POST" });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Pembayaran gagal"); return; }
    setPesan("Tagihan lunas — dipotong dari saldo anak.");
    await muatUlang();
  }

  async function kirimPO() {
    if (!a) return;
    const items = Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ menu_id: Number(id), qty: q }));
    if (items.length === 0) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api(`/api/ortu/anak/${a.siswa.id}/po`, { metode: "POST", body: { items } });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Pesanan ditolak"); return; }
    setQty({}); setTampilMenu(false);
    setPesan("Pesanan tercatat dan sudah dibayar dari saldo anak.");
    await muatUlang();
  }

  async function batalPO(poId: number) {
    if (!a) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api(`/api/ortu/anak/${a.siswa.id}/po/${poId}`, { metode: "DELETE" });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Pembatalan ditolak"); return; }
    setPesan("Pesanan dibatalkan — dana dikembalikan ke saldo.");
    await muatUlang();
  }

  async function kirimSengketa() {
    if (!a || !sengketa) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api(`/api/ortu/anak/${a.siswa.id}/vending/sengketa`, {
      metode: "POST", body: { transaksi_id: sengketa.transaksi_id, catatan: sengketa.catatan.trim() },
    });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Laporan ditolak"); return; }
    setSengketa(null);
    setPesan("Laporan diterima. Keuangan akan memeriksanya dan menghubungi Anda.");
  }

  if (galat) {
    return (
      <div className="ortu-shell">
        <div className="ortu-frame">
          <div className="ortu-body" style={{ marginTop: 24 }}>
            <div className="ortu-action-card"><p style={{ margin: 0 }}>{galat}</p><KeluarButton /></div>
          </div>
        </div>
      </div>
    );
  }
  if (!a) {
    return (
      <div className="ortu-shell">
        <div className="ortu-frame">
          <div className="ortu-body" style={{ marginTop: 24 }}>
            <div className="ortu-action-card">
              <p style={{ margin: 0 }}>
                {sedang ? "Memuat data anak…" : "Tidak ada anak yang terhubung ke akun ini. Hubungi TU."}
              </p>
              {!sedang ? <div style={{ marginTop: 12 }}><KeluarButton /></div> : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const s = a.siswa;
  const lim = a.limit;
  const sisa = lim ? Math.max(lim.limit_harian_rp - lim.terpakai_rp, 0) : null;
  const { identitas } = useIdentitas();
  const totalPO = jendela ? jendela.menu.reduce((t, m) => t + (qty[m.id] ?? 0) * m.harga_rp, 0) : 0;
  const totalItemPO = Object.values(qty).reduce((sum, q) => sum + q, 0);
  const poAktif = a.po.filter(p => p.status === "dibayar");
  const totalTagihanRp = a.tagihan.reduce((sum, t) => sum + t.nominal_rp, 0);

  return (
    <div className="ortu-shell">
      <div className="ortu-frame">
        {/* Header Atas Mobile App */}
        <header className="ortu-topbar">
          <div className="ortu-topbar-inner">
            <LogoSekolah tipe="portrait" size={32} />
            <div className="ortu-topbar-brand">
              <b>{identitas.nama_singkat || "Smart Campus"}</b>
              <small>Portal Wali · {saya?.nama || "Orang Tua"}</small>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              <KeluarButton ringkas />
            </div>
          </div>
        </header>

        {/* Instagram-Style Story Circles (Pilih Anak) */}
        {daftar.length > 0 ? (
          <div className="ortu-stories" role="tablist" aria-label="Pilih anak">
            {daftar.map(x => {
              const aktif = x.siswa.id === s.id;
              const inisial = x.siswa.nama.charAt(0).toUpperCase();
              return (
                <button
                  key={x.siswa.id}
                  type="button"
                  role="tab"
                  aria-selected={aktif}
                  className={`ortu-story-item ${aktif ? "active" : ""}`}
                  onClick={() => {
                    setPilih(x.siswa.id);
                    setRiwayat(null);
                    setLembar(null);
                    setQty({});
                    setPesan("");
                  }}
                >
                  <div className="ortu-story-ring">
                    <div className="ortu-story-avatar">
                      {inisial}
                    </div>
                  </div>
                  <span className="ortu-story-name">{x.siswa.nama.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Konten Utama */}
        <main className="ortu-body">
          {pesan && !lembar ? (
            <div className={gagal ? "t-err" : "t-ok"} style={{ marginBottom: 14 }}>
              {pesan}
            </div>
          ) : null}

          {/* ============================================================ */}
          {/* MODAL POP-UP: ATUR BATAS BELANJA HARIAN                      */}
          {/* ============================================================ */}
          {lembar === "limit" ? (
            <div style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.65)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              zIndex: 1000,
              display: "grid",
              placeItems: "center",
              padding: "16px",
              animation: "modalFadeIn 0.15s ease",
            }}>
              <div className="ortu-action-card" style={{
                maxWidth: 400,
                width: "100%",
                margin: 0,
                padding: "20px 18px",
                background: "var(--surface)",
                border: "1px solid var(--rule)",
                borderRadius: 18,
                boxShadow: "0 20px 48px rgba(0, 0, 0, 0.3)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h2 style={{ fontSize: 16, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>⚙️</span> Batas Belanja Harian
                  </h2>
                  <button
                    type="button"
                    onClick={() => { setLembar(null); setPesan(""); }}
                    style={{ background: "none", border: "none", fontSize: 24, color: "var(--ink-3)", cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
                    aria-label="Tutup"
                  >
                    ×
                  </button>
                </div>

                <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--ink-2)" }}>
                  Atur kuota maksimal jajan/belanja untuk <b>{s.nama}</b> per hari.
                </p>

                <div className="field">
                  <label className="f" htmlFor="lim-popup">Batas Maksimal per Hari (Rp)</label>
                  <input
                    id="lim-popup"
                    type="number"
                    min={0}
                    step={1000}
                    autoFocus
                    value={limitBaru}
                    placeholder={String(lim?.limit_harian_rp ?? 50000)}
                    style={{ width: "100%", fontSize: 18, fontWeight: 700, padding: "10px 12px" }}
                    onChange={e => setLimitBaru(e.target.value)}
                  />
                </div>

                {/* Pilihan Cepat / Preset Chips */}
                <div style={{ marginBottom: 12 }}>
                  <div className="p-note" style={{ fontSize: 11, marginBottom: 6 }}>Pilihan Cepat:</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[20000, 30000, 50000, 75000, 100000].map(nom => (
                      <button
                        key={nom}
                        type="button"
                        className="btn sm"
                        style={{
                          fontSize: 11.5,
                          padding: "5px 9px",
                          borderRadius: 999,
                          background: limitBaru === String(nom) ? "var(--accent)" : "var(--surface)",
                          color: limitBaru === String(nom) ? "#ffffff" : "var(--ink)",
                          borderColor: limitBaru === String(nom) ? "var(--accent)" : "var(--rule)",
                          fontWeight: limitBaru === String(nom) ? 700 : 500,
                        }}
                        onClick={() => setLimitBaru(String(nom))}
                      >
                        {rp(nom)}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ background: "var(--surface-sunken, rgba(0,0,0,0.03))", padding: "10px 12px", borderRadius: 10, fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.4, marginBottom: 16, border: "1px solid var(--rule)" }}>
                  ℹ️ Anda hanya bisa <b>menurunkan</b> batas di bawah plafon sekolah ({lim ? rp(lim.plafon_rp) : "—"}). Jika kedua orang tua mengatur angka berbeda, sistem otomatis menerapkan <b>angka terendah</b> demi keamanan anak.
                </div>

                {gagal && pesan ? (
                  <div className="t-err" style={{ marginBottom: 12, fontSize: 12.5 }}>
                    {pesan}
                  </div>
                ) : null}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    type="button"
                    className="btn pri blok"
                    disabled={sibuk || limitBaru === ""}
                    onClick={() => void simpanLimit()}
                  >
                    {sibuk ? "Menyimpan…" : "Simpan Batas Harian"}
                  </button>
                  <button
                    type="button"
                    className="btn blok"
                    disabled={sibuk}
                    onClick={() => { setLembar(null); setPesan(""); }}
                  >
                    Batal
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* ============================================================ */}
          {/* MODAL POP-UP: LAPORKAN KARTU HILANG                          */}
          {/* ============================================================ */}
          {lembar === "hilang" ? (
            <div style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.65)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              zIndex: 1000,
              display: "grid",
              placeItems: "center",
              padding: "16px",
              animation: "modalFadeIn 0.15s ease",
            }}>
              <div className="ortu-action-card" style={{
                maxWidth: 400,
                width: "100%",
                margin: 0,
                padding: "20px 18px",
                background: "var(--surface)",
                border: "2px solid var(--crit-soft)",
                borderRadius: 18,
                boxShadow: "0 20px 48px rgba(0, 0, 0, 0.3)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h2 style={{ fontSize: 16, margin: 0, color: "var(--crit-text)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span>🛡️</span> Laporkan Kartu Hilang
                  </h2>
                  <button
                    type="button"
                    onClick={() => { setLembar(null); setPesan(""); }}
                    style={{ background: "none", border: "none", fontSize: 24, color: "var(--ink-3)", cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
                    aria-label="Tutup"
                  >
                    ×
                  </button>
                </div>

                <div style={{ fontSize: 13, lineHeight: 1.45, color: "var(--ink-2)", marginBottom: 16 }}>
                  Kartu RFID fisik milik <b>{s.nama}</b> akan <b>diblokir seketika</b> agar tidak bisa dipakai belanja atau transaksi oleh siapa pun yang menemukannya.
                  <div style={{ background: "var(--accent-soft)", color: "var(--accent-ink)", padding: "8px 12px", borderRadius: 8, marginTop: 10, fontSize: 12 }}>
                    ✓ <b>Uang &amp; saldo tetap 100% aman.</b> Saldo terikat pada akun siswa, bukan kartu fisik. Kunjungi TU untuk penerbitan kartu pengganti.
                  </div>
                </div>

                {gagal && pesan ? (
                  <div className="t-err" style={{ marginBottom: 12, fontSize: 12.5 }}>
                    {pesan}
                  </div>
                ) : null}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    type="button"
                    className="btn danger blok"
                    style={{ background: "var(--crit)", borderColor: "var(--crit)", color: "#ffffff" }}
                    disabled={sibuk}
                    onClick={() => void blokirKartu()}
                  >
                    {sibuk ? "Memblokir…" : "Ya, Blokir Kartu Sekarang"}
                  </button>
                  <button
                    type="button"
                    className="btn blok"
                    disabled={sibuk}
                    onClick={() => { setLembar(null); setPesan(""); }}
                  >
                    Batal
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* ============================================================ */}
          {/* TAB 1: BERANDA                                               */}
          {/* ============================================================ */}
          {tabAktif === "beranda" ? (
            <div>
              {/* Alert Kartu Tidak Aktif */}
              {s.kartu !== "aktif" ? (
                <div className="stat-hilang" style={{ marginBottom: 14 }}>
                  ⚠️ Kartu RFID {s.nama} <b>{s.kartu === "belum" ? "belum diterbitkan" : s.kartu}</b>.
                  Saldo tetap aman dan utuh — hubungi TU untuk penerbitan kartu.
                </div>
              ) : null}

              {/* Digital E-Money Card */}
              <div className="ortu-digital-card">
                <div className="card-top">
                  <div className="card-chip" />
                  <span className={`badge ${s.kartu === "aktif" ? "good" : s.kartu === "belum" ? "warn" : "crit"}`} style={{ fontSize: 11 }}>
                    {s.kartu === "aktif" ? "Kartu Aktif" : s.kartu === "belum" ? "Belum Terbit" : "Diblokir"}
                  </span>
                </div>

                <div className="card-user">{s.nama}</div>
                <div className="card-sub">NIS: {s.nis} · Kelas {s.kelas ?? s.jenjang}</div>

                <div className="card-saldo-lbl">Saldo Tersedia</div>
                <div className="card-saldo-val">{rp(s.saldo_rp)}</div>

                <div className="card-limit-info">
                  <span>Batas: {lim ? rp(lim.limit_harian_rp) : "—"}</span>
                  <span>Sisa Hari Ini: <b>{lim ? rp(sisa ?? 0) : "—"}</b></span>
                </div>

                {/* Quick Action Grid */}
                <div className="ortu-quick-grid">
                  <button
                    type="button"
                    className="ortu-quick-btn"
                    onClick={() => void bukaTopup()}
                  >
                    <span style={{ fontSize: 16 }}>➕</span>
                    <span>Isi Saldo</span>
                  </button>
                  <button
                    type="button"
                    className="ortu-quick-btn"
                    onClick={() => {
                      setPesan("");
                      setLimitBaru(String(lim?.limit_harian_rp ?? ""));
                      setLembar("limit");
                    }}
                  >
                    <span style={{ fontSize: 16 }}>⚙️</span>
                    <span>Atur Batas</span>
                  </button>
                  <button
                    type="button"
                    className={`ortu-quick-btn ${s.kartu === "aktif" ? "danger" : ""}`}
                    onClick={() => {
                      setPesan("");
                      setLembar("hilang");
                    }}
                  >
                    <span style={{ fontSize: 16 }}>🛡️</span>
                    <span>Kartu Hilang</span>
                  </button>
                </div>
              </div>

              {/* Alert Tagihan Menunggu */}
              {a.tagihan.length > 0 ? (
                <div
                  className="ortu-action-card"
                  style={{
                    borderLeft: "4px solid #fab219",
                    background: "var(--warn-soft)",
                    cursor: "pointer",
                  }}
                  onClick={() => setTabAktif("keuangan")}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <b style={{ fontSize: 13.5, color: "#854d0e" }}>
                        ⚠️ Ada {a.tagihan.length} tagihan menunggu ({rp(totalTagihanRp)})
                      </b>
                      <div style={{ fontSize: 12, color: "#a16207", marginTop: 2 }}>
                        Klik untuk melihat rincian & bayar langsung dari saldo
                      </div>
                    </div>
                    <span style={{ fontSize: 18, color: "#854d0e" }}>➔</span>
                  </div>
                </div>
              ) : null}

              {/* Status Pesanan PO Aktif */}
              {poAktif.length > 0 ? (
                <div
                  className="ortu-action-card"
                  style={{
                    borderLeft: "4px solid var(--accent)",
                    background: "var(--accent-soft)",
                    cursor: "pointer",
                  }}
                  onClick={() => setTabAktif("kantin")}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <b style={{ fontSize: 13.5, color: "var(--accent-ink)" }}>
                        🍱 {poAktif.length} Pesanan PO Kantin Aktif
                      </b>
                      <div style={{ fontSize: 12, color: "var(--accent-ink)", marginTop: 2 }}>
                        {poAktif[0].item ?? poAktif[0].kode} · {rp(poAktif[0].total_rp)}
                      </div>
                    </div>
                    <span style={{ fontSize: 18, color: "var(--accent-ink)" }}>➔</span>
                  </div>
                </div>
              ) : null}

              {/* Quick Shortcuts Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div
                  className="ortu-action-card"
                  style={{ margin: 0, padding: "14px 12px", cursor: "pointer" }}
                  onClick={() => setTabAktif("kantin")}
                >
                  <div style={{ fontSize: 24, marginBottom: 4 }}>🍱</div>
                  <b style={{ fontSize: 13, display: "block" }}>Pra-Pesan Kantin</b>
                  <small style={{ color: "var(--ink-2)", fontSize: 11 }}>
                    {jendela?.buka ? "Menu sedang buka" : "Lihat jadwal PO"}
                  </small>
                </div>
                <div
                  className="ortu-action-card"
                  style={{ margin: 0, padding: "14px 12px", cursor: "pointer" }}
                  onClick={() => setTabAktif("riwayat")}
                >
                  <div style={{ fontSize: 24, marginBottom: 4 }}>📜</div>
                  <b style={{ fontSize: 13, display: "block" }}>Riwayat Belanja</b>
                  <small style={{ color: "var(--ink-2)", fontSize: 11 }}>
                    Kantin, vending, perpus
                  </small>
                </div>
              </div>

              {/* Ringkasan Transaksi Terbaru */}
              <div className="ortu-action-card">
                <div className="ortu-section-title">
                  <span>Transaksi Terbaru</span>
                  <button
                    type="button"
                    className="btn sm"
                    style={{ padding: "3px 8px", fontSize: 11 }}
                    onClick={() => setTabAktif("riwayat")}
                  >
                    Lihat Semua ➔
                  </button>
                </div>

                {riwayat === null ? (
                  <p className="p-note" style={{ margin: 0 }}>Memuat riwayat…</p>
                ) : riwayat.length === 0 ? (
                  <p className="p-note" style={{ margin: 0 }}>Belum ada transaksi.</p>
                ) : (
                  riwayat.slice(0, 3).map(t => (
                    <div key={t.id} className="att" style={{ padding: "8px 0" }}>
                      <span className={`badge ${t.arah_rp > 0 ? "good" : "mute"}`}>{t.jenis}</span>
                      <div className="tx">
                        {t.item ?? t.keterangan ?? t.layanan ?? "—"}<br />
                        <b>{t.arah_rp > 0 ? "+" : "−"}{rp(Math.abs(t.arah_rp))}</b> · {waktuSingkat(t.waktu)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {/* ============================================================ */}
          {/* TAB 2: KEUANGAN (Top-Up & Tagihan)                           */}
          {/* ============================================================ */}
          {tabAktif === "keuangan" ? (
            <div>
              <div className="ortu-action-card">
                <div className="ortu-section-title">
                  <span>Isi Saldo {s.nama}</span>
                  <span className="badge info">{topupInfo?.metode === "gateway" ? "Payment Gateway" : "Transfer Manual"}</span>
                </div>

                {/* Form Topup Mode: Verifikasi Admin (Transfer Bank Manual) */}
                {(!topupInfo || topupInfo.metode === "verifikasi_admin") ? (
                  suksesTransfer ? (
                    <div style={{ textAlign: "center", padding: "14px 0" }}>
                      <div style={{ fontSize: 42, marginBottom: 8 }}>✅</div>
                      <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700 }}>Bukti Pembayaran Terkirim</h3>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--accent)", marginBottom: 12 }}>
                        {rp(nominal)}
                      </div>
                      <div className="stat-hilang" style={{ textAlign: "left", marginBottom: 16 }}>
                        ⏳ <b>Status: Menunggu Verifikasi Admin</b>
                        <br />
                        Staf Keuangan/TU akan memeriksa bukti transfer dan mencocokkan mutasi bank. Saldo siswa otomatis bertambah segera setelah disetujui.
                      </div>
                      <button
                        type="button"
                        className="btn pri blok"
                        onClick={() => { setSuksesTransfer(false); setBuktiFoto(null); }}
                      >
                        Kirim Top-Up Lain
                      </button>
                    </div>
                  ) : (
                    <>
                      <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "0 0 10px" }}>
                        Pilih nominal top-up, transfer ke rekening sekolah, lalu lampirkan foto struk di bawah.
                      </p>

                      {/* Nominal Chips */}
                      <div className="t-items" style={{ marginBottom: 14 }}>
                        {NOMINAL.map(n => (
                          <button
                            key={n}
                            type="button"
                            className={nominal === n ? "on" : undefined}
                            onClick={() => setNominal(n)}
                          >
                            {rp(n)}
                          </button>
                        ))}
                      </div>

                      {/* Rekening Tujuan Box */}
                      <div style={{
                        background: "var(--surface-sunken, #f8fafc)",
                        border: "1px solid var(--rule)",
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 14,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase" }}>
                            Rekening Tujuan
                          </span>
                          <span className="badge info">{topupInfo?.bank.nama || "Bank Central Asia (BCA)"}</span>
                        </div>

                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          background: "var(--surface)",
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid var(--rule)",
                          marginTop: 4,
                        }}>
                          <div>
                            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Nomor Rekening:</div>
                            <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace" }}>
                              {topupInfo?.bank.rekening || "8230918239"}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => {
                              const rek = topupInfo?.bank.rekening || "8230918239";
                              void navigator.clipboard?.writeText(rek);
                              setSalinSukses(true);
                              setTimeout(() => setSalinSukses(false), 2000);
                            }}
                          >
                            {salinSukses ? "✓ Tersalin" : "📋 Salin"}
                          </button>
                        </div>

                        <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink)" }}>
                          Atas Nama: <b>{topupInfo?.bank.atas_nama || "Yayasan Semesta Smart Campus"}</b>
                        </div>

                        {topupInfo?.bank.petunjuk ? (
                          <div className="p-note" style={{ marginTop: 6, fontSize: 11.5 }}>
                            ℹ️ {topupInfo.bank.petunjuk}
                          </div>
                        ) : null}
                      </div>

                      {/* Upload Foto Struk */}
                      <div style={{ marginBottom: 14 }}>
                        <label className="f" style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 12.5 }}>
                          Foto Bukti Transfer <span style={{ color: "#ef4444" }}>*</span>
                        </label>

                        {buktiFoto ? (
                          <div style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: 10, background: "var(--surface)", textAlign: "center" }}>
                            <img
                              src={buktiFoto}
                              alt="Pratinjau struk"
                              style={{ maxHeight: 180, maxWidth: "100%", borderRadius: 6, display: "inline-block", objectFit: "contain" }}
                            />
                            <div style={{ marginTop: 8 }}>
                              <label className="btn sm" style={{ cursor: "pointer", display: "inline-block" }}>
                                📷 Ganti Foto Bukti
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: "none" }}
                                  onChange={async e => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    setSedangKompres(true);
                                    try {
                                      const dataUrl = await kompresGambar(f);
                                      setBuktiFoto(dataUrl);
                                    } finally { setSedangKompres(false); }
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                        ) : (
                          <label
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "20px 14px",
                              border: "2px dashed var(--rule)",
                              borderRadius: 10,
                              cursor: "pointer",
                              background: "var(--surface-sunken, #f8fafc)",
                              textAlign: "center",
                              gap: 6,
                            }}
                          >
                            <span style={{ fontSize: 26 }}>📷</span>
                            <b style={{ fontSize: 13, color: "var(--ink)" }}>
                              {sedangKompres ? "Memproses gambar…" : "Ambil Foto atau Pilih Gambar Bukti Transfer"}
                            </b>
                            <span className="p-note" style={{ margin: 0, fontSize: 11 }}>
                              Format JPG / PNG (otomatis dikompres)
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: "none" }}
                              disabled={sedangKompres}
                              onChange={async e => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                setSedangKompres(true);
                                try {
                                  const dataUrl = await kompresGambar(f);
                                  setBuktiFoto(dataUrl);
                                } catch (err) {
                                  setPesan("Gagal memproses gambar: " + (err instanceof Error ? err.message : String(err)));
                                  setGagal(true);
                                } finally { setSedangKompres(false); }
                              }}
                            />
                          </label>
                        )}
                      </div>

                      {/* Catatan Pengirim */}
                      <div style={{ marginBottom: 14 }}>
                        <label className="f" htmlFor="cat-wali-tab" style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
                          Catatan / Nama Rekening Pengirim (opsional)
                        </label>
                        <input
                          id="cat-wali-tab"
                          type="text"
                          maxLength={100}
                          value={catatanWali}
                          placeholder="mis. BCA an. Budi Santoso"
                          style={{ width: "100%", fontSize: 13 }}
                          onChange={e => setCatatanWali(e.target.value)}
                        />
                      </div>

                      <button
                        type="button"
                        className="btn pri blok"
                        disabled={sibuk || !buktiFoto || sedangKompres}
                        onClick={() => void kirimTransferManual()}
                      >
                        {sibuk ? "Mengirim Bukti…" : `Kirim Bukti Pembayaran ${rp(nominal)}`}
                      </button>
                    </>
                  )
                ) : (
                  /* Mode Payment Gateway */
                  invoice ? (
                    <>
                      {invoice.gateway === "simulasi" ? (
                        <div className="stat-hilang" style={{ marginBottom: 12 }}>
                          💡 <b>Mode Uji Coba:</b> Sekolah menggunakan gateway pembayaran <b>simulasi</b>. Klik tombol di bawah untuk menyelesaikan simulasi pembayaran.
                        </div>
                      ) : null}
                      <p style={{ fontSize: 13.5 }}>
                        Tagihan {rp(nominal)} siap dibayar via online gateway.
                      </p>
                      <a className="btn pri blok" href={invoice.url} target="_blank" rel="noreferrer">
                        Buka Halaman Pembayaran
                      </a>
                      <button
                        type="button"
                        className="btn blok"
                        style={{ marginTop: 8 }}
                        disabled={sibuk}
                        onClick={() => void cekTopup()}
                      >
                        {sibuk ? "Memeriksa…" : "Cek Status Pembayaran"}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="t-items" style={{ marginBottom: 12 }}>
                        {NOMINAL.map(n => (
                          <button
                            key={n}
                            type="button"
                            className={nominal === n ? "on" : undefined}
                            onClick={() => setNominal(n)}
                          >
                            {rp(n)}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="btn pri blok"
                        disabled={sibuk}
                        onClick={() => void buatTopup()}
                      >
                        {sibuk ? "Memproses…" : `Lanjut Bayar ${rp(nominal)}`}
                      </button>
                    </>
                  )
                )}
              </div>

              {/* Tagihan Menunggu */}
              <div className="ortu-action-card">
                <div className="ortu-section-title">
                  <span>Tagihan Sekolah & Denda</span>
                  {a.tagihan.length > 0 ? (
                    <span className="badge warn">{a.tagihan.length} menunggu</span>
                  ) : (
                    <span className="badge good">Lunas</span>
                  )}
                </div>

                {a.tagihan.length === 0 ? (
                  <p className="p-note" style={{ margin: 0 }}>
                    Tidak ada tagihan aktif. Semua biaya sekolah & denda telah lunas.
                  </p>
                ) : (
                  <>
                    {a.tagihan.map(t => (
                      <div key={t.id} className="att" style={{ padding: "8px 0" }}>
                        <span className="badge warn">{t.sumber}</span>
                        <div className="tx">
                          {t.keterangan ?? "—"}<br />
                          <b>{rp(t.nominal_rp)}</b> · {waktuSingkat(t.dibuat)}
                        </div>
                        <span className="act">
                          <button
                            type="button"
                            className="btn sm pri"
                            disabled={sibuk}
                            onClick={() => void bayarTagihan(t.id)}
                          >
                            Bayar
                          </button>
                        </span>
                      </div>
                    ))}
                    <p className="p-note" style={{ marginTop: 10 }}>
                      ℹ️ Membayar tagihan di sini <b>memotong langsung saldo anak</b>. Pastikan saldo anak mencukupi sebelum membayar.
                    </p>
                  </>
                )}
              </div>

              {/* Pengaturan Batas Belanja */}
              <div className="ortu-action-card">
                <div className="ortu-section-title">
                  <span>Batas Belanja Harian</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: "var(--ink-2)" }}>Batas Aktif:</span>
                  <b style={{ fontSize: 15 }}>{lim ? rp(lim.limit_harian_rp) : "Belum diatur"}</b>
                </div>
                <button
                  type="button"
                  className="btn blok"
                  onClick={() => {
                    setPesan("");
                    setLimitBaru(String(lim?.limit_harian_rp ?? ""));
                    setLembar("limit");
                  }}
                >
                  Ubah Batas Belanja Harian
                </button>
              </div>
            </div>
          ) : null}

          {/* ============================================================ */}
          {/* TAB 3: KANTIN & PRA-PESAN (PO)                               */}
          {/* ============================================================ */}
          {tabAktif === "kantin" ? (
            <div>
              {/* Status Jendela PO */}
              <div className="ortu-action-card">
                <div className="ortu-section-title">
                  <span>Status Jendela Pra-Pesan (PO)</span>
                  {jendela?.buka ? (
                    <span className="badge good">Buka</span>
                  ) : (
                    <span className="badge warn">Tutup</span>
                  )}
                </div>

                {jendela ? (
                  jendela.buka ? (
                    <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
                      ⏰ <b>Batas Pesan:</b> sebelum {jam(jendela.jam_tutup)}
                      <br />
                      🍱 <b>Waktu Ambil:</b> {jam(jendela.ambil_mulai)} – {jam(jendela.ambil_selesai)} di kantin sekolah.
                    </div>
                  ) : (
                    <div className="p-note" style={{ margin: 0 }}>
                      {jendela.alasan ?? "Pra-pesan makanan kantin saat ini sedang tutup."}
                    </div>
                  )
                ) : (
                  <p className="p-note" style={{ margin: 0 }}>Memuat informasi jadwal kantin…</p>
                )}
              </div>

              {/* Katalog Menu Makanan */}
              {jendela?.buka && jendela.menu.length > 0 ? (
                <div className="ortu-action-card">
                  <div className="ortu-section-title">
                    <span>Pilih Menu Kantin Hari Ini</span>
                  </div>

                  {jendela.menu.map(m => (
                    <div key={m.id} className="att" style={{ padding: "10px 0" }}>
                      <span className="badge mute">{m.kategori ?? "Menu"}</span>
                      <div className="tx">
                        <b>{m.nama}</b>
                        <br />
                        <span style={{ color: "var(--accent-ink)", fontWeight: 700 }}>{rp(m.harga_rp)}</span>
                      </div>
                      <span className="act">
                        <div className="stepper" style={{ gap: 6 }}>
                          <button
                            type="button"
                            style={{ width: 32, height: 32, fontSize: 16 }}
                            onClick={() => setQty({ ...qty, [m.id]: Math.max((qty[m.id] ?? 0) - 1, 0) })}
                          >
                            −
                          </button>
                          <span className="vv" style={{ minWidth: 26, fontSize: 15 }}>
                            {qty[m.id] ?? 0}
                          </span>
                          <button
                            type="button"
                            style={{ width: 32, height: 32, fontSize: 16 }}
                            onClick={() => setQty({ ...qty, [m.id]: Math.min((qty[m.id] ?? 0) + 1, 10) })}
                          >
                            +
                          </button>
                        </div>
                      </span>
                    </div>
                  ))}

                  {/* Cart Total Box */}
                  {totalPO > 0 ? (
                    <div style={{
                      marginTop: 14,
                      padding: 12,
                      background: "var(--accent-soft)",
                      borderRadius: 10,
                      border: "1px solid var(--accent)",
                    }}>
                      <div className="t-total" style={{ margin: 0, paddingBottom: 8 }}>
                        <span className="l" style={{ fontWeight: 700, color: "var(--accent-ink)" }}>
                          Total Pesanan ({totalItemPO} item)
                        </span>
                        <span className="v" style={{ fontWeight: 800, color: "var(--accent-ink)" }}>
                          {rp(totalPO)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn pri blok"
                        style={{ marginTop: 8 }}
                        disabled={sibuk}
                        onClick={() => void kirimPO()}
                      >
                        {sibuk ? "Memproses…" : "Pesan & Bayar dari Saldo Anak"}
                      </button>
                      <p className="p-note" style={{ margin: "6px 0 0", fontSize: 11 }}>
                        Dana otomatis dipotong dari saldo anak. Setelah jam tutup, pesanan tidak bisa dibatalkan karena dapur sudah memasak.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Daftar Pesanan PO 7 Hari Terakhir */}
              <div className="ortu-action-card">
                <div className="ortu-section-title">
                  <span>Pesanan 7 Hari Terakhir</span>
                </div>

                {a.po.length === 0 ? (
                  <p className="p-note" style={{ margin: 0 }}>Belum ada pesanan PO dalam 7 hari terakhir.</p>
                ) : (
                  a.po.map(p => (
                    <div key={p.id} className="att" style={{ padding: "8px 0" }}>
                      <span className={`badge ${p.status === "diambil" ? "good" : p.status === "dibayar" ? "warn" : "mute"}`}>
                        {p.status}
                      </span>
                      <div className="tx">
                        <b>{p.item ?? p.kode}</b><br />
                        {rp(p.total_rp)} · {p.tanggal}
                      </div>
                      {bisaBatal(p, jendela) ? (
                        <span className="act">
                          <button
                            type="button"
                            className="btn sm danger"
                            disabled={sibuk}
                            onClick={() => void batalPO(p.id)}
                          >
                            Batalkan
                          </button>
                        </span>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {/* ============================================================ */}
          {/* TAB 4: RIWAYAT (Transaksi, Perpustakaan, Laundry, Loker)     */}
          {/* ============================================================ */}
          {tabAktif === "riwayat" ? (
            <div>
              {/* Riwayat Transaksi Card */}
              <div className="ortu-action-card">
                <div className="ortu-section-title">
                  <span>Riwayat Transaksi</span>
                  <input
                    type="month"
                    value={bulan}
                    onChange={e => setBulan(e.target.value)}
                    aria-label="Saring bulan"
                    style={{ fontSize: 11, padding: "2px 6px" }}
                  />
                </div>

                {/* Dispute / Sengketa Box */}
                {sengketa ? (
                  <div className="t-err" style={{ marginBottom: 12 }}>
                    <b>Pelaporan Mesin Vending:</b> Laporkan jika barang tidak keluar agar dana diperiksa & dikembalikan oleh Keuangan.
                    <div className="field" style={{ marginTop: 8 }}>
                      <label className="f" htmlFor="sk-tab">Ceritakan kendala</label>
                      <input
                        id="sk-tab"
                        type="text"
                        maxLength={300}
                        value={sengketa.catatan}
                        style={{ width: "100%", fontSize: 13 }}
                        onChange={e => setSengketa({ ...sengketa, catatan: e.target.value })}
                        placeholder="Contoh: Uang terpotong tapi minuman tersangkut"
                      />
                    </div>
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
                      style={{ marginTop: 6 }}
                      onClick={() => setSengketa(null)}
                    >
                      Batal
                    </button>
                  </div>
                ) : null}

                {riwayat === null ? (
                  <p className="p-note" style={{ margin: 0 }}>Memuat riwayat transaksi…</p>
                ) : riwayat.length === 0 ? (
                  <p className="p-note" style={{ margin: 0 }}>
                    {bulan ? "Tidak ada transaksi pada bulan itu." : "Belum ada transaksi."}
                  </p>
                ) : (
                  riwayat.slice(0, 50).map(t => (
                    <div key={t.id} className="att" style={{ padding: "8px 0" }}>
                      <span className={`badge ${t.arah_rp > 0 ? "good" : "mute"}`}>{t.jenis}</span>
                      <div className="tx">
                        {t.item ?? t.keterangan ?? t.layanan ?? "—"}<br />
                        <b>{t.arah_rp > 0 ? "+" : "−"}{rp(Math.abs(t.arah_rp))}</b> · {waktuSingkat(t.waktu)}
                        {t.offline ? " · offline" : ""}
                        {t.direfund_rp ? <> · dikembalikan {rp(t.direfund_rp)}</> : null}
                      </div>
                      {t.layanan === "vending" && t.jenis === "belanja" && !t.direfund_rp ? (
                        <span className="act">
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => { setPesan(""); setSengketa({ transaksi_id: t.id, catatan: "" }); }}
                          >
                            Kendala
                          </button>
                        </span>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              {/* Pinjaman Perpustakaan Card */}
              {a.pinjaman.length > 0 ? (
                <div className="ortu-action-card">
                  <div className="ortu-section-title">
                    <span>Buku Sedang Dipinjam</span>
                    <span className="badge info">{a.pinjaman.length} buku</span>
                  </div>
                  {a.pinjaman.map(p => (
                    <div key={p.id} className="att" style={{ padding: "8px 0" }}>
                      <span className={`badge ${p.hari_telat > 0 ? "warn" : "mute"}`}>
                        {p.hari_telat > 0 ? `telat ${p.hari_telat} hr` : "aktif"}
                      </span>
                      <div className="tx">
                        <b>{p.judul}</b><br />
                        Kembali sebelum {p.jatuh_tempo}
                      </div>
                    </div>
                  ))}
                  <p className="p-note" style={{ marginTop: 8 }}>
                    Denda keterlambatan otomatis terhitung dan dipotong dari saldo anak saat pengembalian di perpustakaan.
                  </p>
                </div>
              ) : null}

              {/* Laundry Card */}
              {a.laundry.length > 0 ? (
                <div className="ortu-action-card">
                  <div className="ortu-section-title">
                    <span>Layanan Laundry</span>
                  </div>
                  {a.laundry.map(l => (
                    <div key={l.id} className="att" style={{ padding: "8px 0" }}>
                      <span className={`badge ${l.status === "siap" ? "good" : "mute"}`}>{l.status}</span>
                      <div className="tx">
                        <b>{l.item ?? l.kode}</b> · {rp(l.total_rp)}
                        {l.rak ? <> · <b>Rak {l.rak}</b></> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Loker Siswa Card */}
              {a.loker ? (
                <div className="ortu-action-card">
                  <div className="ortu-section-title">
                    <span>Loker Siswa</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    <b>{a.loker.kode}</b> · {a.loker.lokasi ?? `Blok ${a.loker.blok}`} · kondisi {a.loker.kondisi}
                    <br />
                    <span className="p-note">Terakhir dibuka: {waktuSingkat(a.loker.akses_terakhir)}</span>
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ============================================================ */}
          {/* TAB 5: AKUN (Profil Wali & Siswa, Sekolah, Logout)           */}
          {/* ============================================================ */}
          {tabAktif === "akun" ? (
            <div>
              {/* Profil Wali Card */}
              <div className="ortu-action-card">
                <div className="ortu-section-title">
                  <span>Profil Wali Murid</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    background: "var(--accent-soft)",
                    color: "var(--accent-ink)",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    fontSize: 18,
                  }}>
                    {saya?.nama ? saya.nama.charAt(0).toUpperCase() : "W"}
                  </div>
                  <div>
                    <b style={{ fontSize: 14, display: "block" }}>{saya?.nama || "Wali Murid"}</b>
                    <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{saya?.email || "—"}</span>
                    <div style={{ marginTop: 2 }}>
                      <span className="badge good" style={{ fontSize: 10 }}>Wali Terverifikasi</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Profil Siswa Card */}
              <div className="ortu-action-card">
                <div className="ortu-section-title">
                  <span>Data Siswa</span>
                </div>
                <div style={{ fontSize: 13, display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--ink-2)" }}>Nama Lengkap</span>
                    <b>{s.nama}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--ink-2)" }}>NIS</span>
                    <span className="mono">{s.nis}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--ink-2)" }}>Kelas / Jenjang</span>
                    <span>{s.kelas ?? "—"} ({s.jenjang.toUpperCase()})</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--ink-2)" }}>Tipe Siswa</span>
                    <span>{s.boarding ? "Asrama (Boarding)" : "Reguler (Fullday)"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--ink-2)" }}>Status Kartu RFID</span>
                    <span className={`badge ${s.kartu === "aktif" ? "good" : s.kartu === "belum" ? "warn" : "crit"}`}>
                      {s.kartu}
                    </span>
                  </div>
                </div>
              </div>

              {/* Info Sekolah */}
              <div className="ortu-action-card">
                <div className="ortu-section-title">
                  <span>Informasi Sekolah</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <LogoSekolah tipe="portrait" size={40} />
                  <div>
                    <b style={{ fontSize: 13.5, display: "block" }}>{identitas.nama || "Semesta Bilingual School"}</b>
                    <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{identitas.nama_singkat || "Smart Campus"}</span>
                  </div>
                </div>
              </div>

              {/* Bantuan & Hubungi TU */}
              <div className="ortu-action-card">
                <div className="ortu-section-title">
                  <span>Bantuan & Kontak TU</span>
                </div>
                <p style={{ fontSize: 12.5, color: "var(--ink-2)", margin: "0 0 10px", lineHeight: 1.4 }}>
                  Jika kartu RFID anak hilang, ada ketidaksesuaian data transaksi, atau butuh bantuan top-up saldo, silakan hubungi bagian Tata Usaha / Keuangan sekolah.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <a
                    href="tel:02476918888"
                    className="btn sm blok"
                    style={{ justifyContent: "center" }}
                  >
                    📞 Hubungi TU
                  </a>
                </div>
              </div>

              {/* Tombol Keluar Akun */}
              <div style={{ marginTop: 20 }}>
                <KeluarButton />
              </div>
            </div>
          ) : null}
        </main>

        {/* ============================================================ */}
        {/* FLOATING INSTAGRAM-STYLE BOTTOM NAVIGATION DOCK              */}
        {/* ============================================================ */}
        <div className="ortu-dock-wrap">
          <nav className="ortu-dock" aria-label="Navigasi Bawah">
            {/* 1. Beranda */}
            <button
              type="button"
              className={`ortu-dock-btn ${tabAktif === "beranda" ? "active" : ""}`}
              onClick={() => { setTabAktif("beranda"); setLembar(null); }}
              aria-label="Beranda"
            >
              <svg viewBox="0 0 24 24" fill={tabAktif === "beranda" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={tabAktif === "beranda" ? "0" : "2"} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Beranda</span>
            </button>

            {/* 2. Keuangan */}
            <button
              type="button"
              className={`ortu-dock-btn ${tabAktif === "keuangan" ? "active" : ""}`}
              onClick={() => { setTabAktif("keuangan"); setLembar(null); }}
              aria-label="Keuangan"
            >
              <svg viewBox="0 0 24 24" fill={tabAktif === "keuangan" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={tabAktif === "keuangan" ? "0" : "2"} strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              <span>Keuangan</span>
              {a.tagihan.length > 0 ? (
                <span className="ortu-dock-badge">{a.tagihan.length}</span>
              ) : null}
            </button>

            {/* 3. Kantin & PO */}
            <button
              type="button"
              className={`ortu-dock-btn ${tabAktif === "kantin" ? "active" : ""}`}
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
                <span className="ortu-dock-badge">{poAktif.length}</span>
              ) : null}
            </button>

            {/* 4. Riwayat */}
            <button
              type="button"
              className={`ortu-dock-btn ${tabAktif === "riwayat" ? "active" : ""}`}
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
              className={`ortu-dock-btn ${tabAktif === "akun" ? "active" : ""}`}
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
 * Apakah PO ini masih bisa dibatalkan.
 *
 * Batasnya sama dengan `po_batal` di SQL: hari yang sama DAN belum lewat jam
 * tutup PO. Memakai tanggal saja membuat tombol "Batalkan" tetap tampil
 * sepanjang sore — padahal dapur sudah memasak dan server pasti menolak
 * dengan PO_SUDAH_TUTUP. Kalau jendela gagal dimuat, tombolnya tetap
 * ditampilkan dan server yang memutuskan.
 */
function bisaBatal(p: { status: string; tanggal: string }, j: Jendela | null): boolean {
  if (p.status !== "dibayar") return false;
  if (p.tanggal > hariIni()) return true;
  if (p.tanggal < hariIni()) return false;
  if (!j) return true;
  return jamIni() < j.jam_tutup.slice(0, 5);
}
