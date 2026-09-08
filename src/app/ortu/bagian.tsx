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

export default function Bagian() {
  const { data, galat, sedang, muatUlang } = useMuat<{ anak: Anak[] }>("/api/ortu/anak");
  const [saya, setSaya] = useState<{ nama: string; email: string } | null>(null);
  const [pilih, setPilih] = useState<number | null>(null);
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
    setBuktiFoto(null); setCatatanWali(""); setLembar("topup");
    const r = await api<TopupInfo>("/api/ortu/topup-info");
    if (r.ok) setTopupInfo(r.data!);
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
      <div className="root portal">
        <div className="p-wrap" style={{ marginTop: 24 }}>
          <div className="pcard"><p style={{ margin: 0 }}>{galat}</p><KeluarButton /></div>
        </div>
      </div>
    );
  }
  if (!a) {
    return (
      <div className="root portal">
        <div className="p-wrap" style={{ marginTop: 24 }}>
          <div className="pcard">
            <p style={{ margin: 0 }}>
              {sedang ? "Memuat data anak…" : "Tidak ada anak yang terhubung ke akun ini. Hubungi TU."}
            </p>
            {!sedang ? <KeluarButton /> : null}
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

  return (
    <div className="root portal">
      <div className="p-top">
        <div className="inner">
          <div className="bar">
            <LogoSekolah tipe="portrait" size={32} />
            <div className="t">
              <b>{identitas.nama_singkat || "Smart Campus"}</b>
              <small>Portal Orang Tua{saya ? ` · ${saya.nama}` : ""}</small>
            </div>
            <span style={{ marginLeft: "auto" }}><KeluarButton ringkas /></span>
          </div>
          {daftar.length > 1 ? (
            <div className="anak" role="tablist" aria-label="Pilih anak">
              {daftar.map(x => (
                <button key={x.siswa.id} type="button" role="tab" aria-selected={x.siswa.id === s.id}
                  className={x.siswa.id === s.id ? "on" : undefined}
                  onClick={() => {
                    // riwayat ikut dikosongkan: tanpa ini, tabel transaksi anak
                    // sebelumnya tetap tampil di bawah nama anak yang baru
                    // dipilih sampai permintaannya selesai — persis jenis
                    // kebohongan kecil yang tidak boleh ada di layar ini.
                    setPilih(x.siswa.id); setRiwayat(null);
                    setLembar(null); setTampilMenu(false); setQty({}); setPesan("");
                  }}>
                  {x.siswa.nama} · {x.siswa.kelas ?? x.siswa.nis}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="p-wrap">
        {pesan ? <div className={gagal ? "t-err" : "t-ok"} style={{ marginBottom: 14 }}>{pesan}</div> : null}

        {s.kartu !== "aktif" ? (
          <div className="stat-hilang" style={{ marginBottom: 14 }}>
            ⚠ Kartu {s.nama} <b>{s.kartu === "belum" ? "belum diterbitkan" : s.kartu}</b>. Saldo tetap
            aman dan tidak berkurang — hubungi TU untuk kartu pengganti.
          </div>
        ) : null}

        <div className="saldo-card">
          <div className="l">Saldo {s.nama}</div>
          <div className="v">{rp(s.saldo_rp)}</div>
          <div className="u">
            {lim ? <>Batas harian {rp(lim.limit_harian_rp)} · sisa hari ini {rp(sisa ?? 0)}</> : null}
          </div>
          <div className="acts">
            <button type="button" className="btn pri" onClick={() => void bukaTopup()}>+ Isi saldo</button>
            <button type="button" className="btn" onClick={() => {
              setPesan(""); setLimitBaru(String(lim?.limit_harian_rp ?? "")); setLembar("limit");
            }}>Atur batas</button>
          </div>
          {s.kartu === "aktif" ? (
            <div className="acts" style={{ marginTop: 8 }}>
              <button type="button" className="btn danger" onClick={() => { setPesan(""); setLembar("hilang"); }}>
                Kartu hilang
              </button>
            </div>
          ) : null}
        </div>

        {lembar === "topup" ? (
          <div className="pcard">
            <h2>Isi saldo {s.nama}</h2>

            {/* Jika mode verifikasi admin (transfer manual) */}
            {(!topupInfo || topupInfo.metode === "verifikasi_admin") ? (
              suksesTransfer ? (
                <div style={{ textAlign: "center", padding: "12px 0" }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                  <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>Bukti Transfer Berhasil Dikirim</h3>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "var(--brand-pri, #10b981)", marginBottom: 12 }}>
                    {rp(nominal)}
                  </div>
                  <div className="stat-hilang" style={{ textAlign: "left", marginBottom: 16 }}>
                    ⏳ <b>Status: Menunggu Verifikasi Admin</b>
                    <br />
                    Staf Keuangan/TU akan memeriksa bukti transfer dan mutasi bank. Saldo siswa akan otomatis bertambah setelah disetujui.
                  </div>
                  <button type="button" className="btn pri blok" onClick={() => { setLembar(null); setSuksesTransfer(false); }}>
                    Selesai & Tutup
                  </button>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 13.5, color: "#475569", margin: "0 0 12px" }}>
                    Pilih nominal, transfer ke rekening sekolah, lalu unggah foto bukti transfer di bawah.
                  </p>

                  {/* Pilihan Nominal */}
                  <div className="t-items">
                    {NOMINAL.map(n => (
                      <button key={n} type="button" className={nominal === n ? "on" : undefined}
                        onClick={() => setNominal(n)}>{rp(n)}</button>
                    ))}
                  </div>

                  {/* Rekening Bank Tujuan Card */}
                  <div style={{
                    background: "var(--surface-sunken, #f8fafc)",
                    border: "1px solid var(--border, #e2e8f0)",
                    borderRadius: 12,
                    padding: 14,
                    marginTop: 14,
                    marginBottom: 14,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Tujuan Transfer
                      </span>
                      <span className="badge info">{topupInfo?.bank.nama || "Bank Central Asia (BCA)"}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", marginTop: 4 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>Nomor Rekening:</div>
                        <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "monospace", letterSpacing: 1 }}>
                          {topupInfo?.bank.rekening || "8230918239"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn sm"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => {
                          const rek = topupInfo?.bank.rekening || "8230918239";
                          void navigator.clipboard?.writeText(rek);
                          setSalinSukses(true);
                          setTimeout(() => setSalinSukses(false), 2000);
                        }}
                      >
                        {salinSukses ? "✓ Tersalin!" : "📋 Salin"}
                      </button>
                    </div>

                    <div style={{ marginTop: 8, fontSize: 12.5, color: "#334155" }}>
                      Atas Nama: <b>{topupInfo?.bank.atas_nama || "Yayasan Semesta Smart Campus"}</b>
                    </div>

                    {topupInfo?.bank.petunjuk ? (
                      <div className="p-note" style={{ marginTop: 6, fontSize: 12, fontStyle: "italic" }}>
                        ℹ️ {topupInfo.bank.petunjuk}
                      </div>
                    ) : null}
                  </div>

                  {/* Unggah Bukti Pembayaran */}
                  <div style={{ marginBottom: 14 }}>
                    <label className="f" style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                      Unggah Bukti Transfer / Struk <span style={{ color: "#ef4444" }}>*</span>
                    </label>

                    {buktiFoto ? (
                      <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "#f8fafc", textAlign: "center" }}>
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
                          border: "2px dashed #cbd5e1",
                          borderRadius: 10,
                          cursor: "pointer",
                          background: "#f8fafc",
                          textAlign: "center",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 26 }}>📷</span>
                        <b style={{ fontSize: 13.5, color: "#1e293b" }}>
                          {sedangKompres ? "Memproses gambar…" : "Ambil Foto atau Pilih Gambar Bukti Transfer"}
                        </b>
                        <span className="p-note" style={{ margin: 0, fontSize: 11.5 }}>
                          Format JPG / PNG / WEBP (otomatis dikompres)
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

                  {/* Catatan Tambahan (Opsional) */}
                  <div style={{ marginBottom: 14 }}>
                    <label className="f" htmlFor="cat-wali" style={{ display: "block", marginBottom: 4, fontSize: 12.5 }}>
                      Catatan / Nama Pengirim (opsional)
                    </label>
                    <input
                      id="cat-wali"
                      type="text"
                      maxLength={100}
                      value={catatanWali}
                      placeholder="Contoh: Transfer dari rekening Budi / m-BCA"
                      style={{ width: "100%" }}
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

                  <button
                    type="button"
                    className="btn blok"
                    style={{ marginTop: 8 }}
                    onClick={() => setLembar(null)}
                  >
                    Batal
                  </button>
                </>
              )
            ) : (
              /* Alur Payment Gateway Online */
              invoice ? (
                <>
                  {invoice.gateway === "simulasi" ? (
                    <div className="stat-hilang" style={{ marginBottom: 12 }}>
                      💡 <b>Mode Uji Coba:</b> Sekolah saat ini menggunakan gateway pembayaran <b>simulasi</b>. Klik tombol <b>Buka halaman pembayaran</b> di bawah untuk menyelesaikan simulasi pembayaran agar saldo langsung bertambah.
                    </div>
                  ) : null}
                  <p style={{ fontSize: 13.5 }}>
                    Tagihan {rp(nominal)} dibuat. Buka halaman pembayaran, selesaikan, lalu tekan
                    &ldquo;Cek status&rdquo;.
                  </p>
                  <a className="btn pri blok" href={invoice.url} target="_blank" rel="noreferrer">
                    Buka halaman pembayaran
                  </a>
                  <button type="button" className="btn blok" style={{ marginTop: 8 }} disabled={sibuk}
                    onClick={() => void cekTopup()}>{sibuk ? "Memeriksa…" : "Cek status"}</button>
                  <p className="p-note" style={{ marginTop: 10 }}>
                    Saldo bertambah setelah pembayaran dikonfirmasi penyedia pembayaran, bukan saat
                    Anda menekan bayar. Kalau uang sudah terpotong tapi saldo belum bertambah dalam
                    15 menit, hubungi TU dengan menyebut nomor tagihan.
                  </p>
                </>
              ) : (
                <>
                  <div className="t-items">
                    {NOMINAL.map(n => (
                      <button key={n} type="button" className={nominal === n ? "on" : undefined}
                        onClick={() => setNominal(n)}>{rp(n)}</button>
                    ))}
                  </div>
                  <button type="button" className="btn pri blok" style={{ marginTop: 12 }} disabled={sibuk}
                    onClick={() => void buatTopup()}>{sibuk ? "Memproses…" : `Isi ${rp(nominal)}`}</button>
                  <button type="button" className="btn blok" style={{ marginTop: 8 }}
                    onClick={() => setLembar(null)}>Batal</button>
                </>
              )
            )}
          </div>
        ) : null}

        {lembar === "limit" ? (
          <div className="pcard">
            <h2>Batas belanja harian</h2>
            <div className="field">
              <label className="f" htmlFor="lim">Batas per hari (Rp)</label>
              <input id="lim" type="number" min={0} step={1000} value={limitBaru} style={{ width: "100%" }}
                onChange={e => setLimitBaru(e.target.value)} />
            </div>
            <p className="p-note">
              Anda hanya bisa <b>menurunkan</b> batas, tidak menaikkannya di atas plafon sekolah
              ({lim ? rp(lim.plafon_rp) : "—"}). Kalau ayah dan ibu mengisi angka berbeda, yang
              berlaku adalah <b>yang terendah</b>.
            </p>
            <button type="button" className="btn pri blok" disabled={sibuk || limitBaru === ""}
              onClick={() => void simpanLimit()}>{sibuk ? "Menyimpan…" : "Simpan batas"}</button>
            <button type="button" className="btn blok" style={{ marginTop: 8 }}
              onClick={() => setLembar(null)}>Batal</button>
          </div>
        ) : null}

        {lembar === "hilang" ? (
          <div className="pcard">
            <h2>Laporkan kartu hilang</h2>
            <div className="t-err">
              Kartu {s.nama} akan <b>diblokir seketika</b> dan tidak bisa dipakai membayar apa pun,
              termasuk oleh orang yang menemukannya.
              <br /><br />
              <b>Saldo tidak ikut hilang.</b> Uang menempel pada anak, bukan pada kartu — kartu
              pengganti dari TU langsung bisa memakai saldo yang sama.
            </div>
            <button type="button" className="btn danger blok" style={{ marginTop: 12 }} disabled={sibuk}
              onClick={() => void blokirKartu()}>{sibuk ? "Memblokir…" : "Ya, blokir sekarang"}</button>
            <button type="button" className="btn blok" style={{ marginTop: 8 }}
              onClick={() => setLembar(null)}>Batal</button>
          </div>
        ) : null}

        {a.tagihan.length > 0 ? (
          <div className="pcard">
            <h2>Tagihan menunggu</h2>
            {a.tagihan.map(t => (
              <div key={t.id} className="att">
                <span className="badge warn">{t.sumber}</span>
                <div className="tx">
                  {t.keterangan ?? "—"}<br />
                  <b>{rp(t.nominal_rp)}</b> · {waktuSingkat(t.dibuat)}
                </div>
                <span className="act">
                  <button type="button" className="btn sm" disabled={sibuk}
                    onClick={() => void bayarTagihan(t.id)}>Bayar</button>
                </span>
              </div>
            ))}
            <p className="p-note" style={{ marginTop: 10 }}>
              Membayar di sini <b>memotong saldo anak</b>, bukan menagih Anda lewat pembayaran
              online. Kalau saldonya tidak cukup, isi saldo dulu.
            </p>
          </div>
        ) : null}

        <div className="pcard">
          <div className="hd2">
            <h2>Pra-pesan kantin</h2>
            <button type="button" className="btn sm" style={{ marginLeft: "auto" }}
              onClick={() => { setPesan(""); setGagal(false); setQty({}); setTampilMenu(!tampilMenu); }}>
              {tampilMenu ? "Tutup menu" : "Lihat menu"}
            </button>
          </div>

          {tampilMenu && !jendela ? (
            <p className="p-note" style={{ margin: 0 }}>
              {jendelaSiap
                ? "Menu belum bisa dimuat. Coba muat ulang halaman."
                : "Memuat menu…"}
            </p>
          ) : null}

          {tampilMenu && jendela ? (
            jendela.buka ? (
              <>
                <p className="p-note" style={{ marginTop: 0 }}>
                  Pesan sebelum {jam(jendela.jam_tutup)} · diambil {jam(jendela.ambil_mulai)}–{jam(jendela.ambil_selesai)}
                </p>
                {jendela.menu.map(m => (
                  <div key={m.id} className="att">
                    <span className="badge mute">{m.kategori ?? "—"}</span>
                    <div className="tx">{m.nama}<br /><b>{rp(m.harga_rp)}</b></div>
                    <span className="act">
                      <div className="stepper" style={{ gap: 8 }}>
                        <button type="button" style={{ width: 34, height: 34, fontSize: 18 }}
                          onClick={() => setQty({ ...qty, [m.id]: Math.max((qty[m.id] ?? 0) - 1, 0) })}>−</button>
                        <span className="vv" style={{ minWidth: 28, fontSize: 16 }}>{qty[m.id] ?? 0}</span>
                        <button type="button" style={{ width: 34, height: 34, fontSize: 18 }}
                          onClick={() => setQty({ ...qty, [m.id]: Math.min((qty[m.id] ?? 0) + 1, 10) })}>+</button>
                      </div>
                    </span>
                  </div>
                ))}
                <div className="t-total">
                  <span className="l">Total</span><span className="v">{rp(totalPO)}</span>
                </div>
                <button type="button" className="btn pri blok" style={{ marginTop: 10 }}
                  disabled={sibuk || totalPO === 0} onClick={() => void kirimPO()}>
                  {sibuk ? "Memesan…" : "Pesan & bayar dari saldo"}
                </button>
                <p className="p-note" style={{ marginTop: 10 }}>
                  Setelah jam tutup, pesanan <b>tidak bisa dibatalkan</b> — dapur sudah memasak
                  berdasarkan jumlah itu.
                </p>
              </>
            ) : (
              <p className="p-note" style={{ margin: 0 }}>{jendela.alasan ?? "Pra-pesan sedang tutup."}</p>
            )
          ) : null}

          {a.po.length > 0 ? (
            <div style={{ marginTop: tampilMenu ? 14 : 0 }}>
              <div className="p-note" style={{ marginBottom: 6 }}>Pesanan 7 hari terakhir</div>
              {a.po.map(p => (
                <div key={p.id} className="att">
                  <span className={`badge ${p.status === "diambil" ? "good" : p.status === "dibayar" ? "warn" : "mute"}`}>
                    {p.status}
                  </span>
                  <div className="tx">
                    {p.item ?? p.kode}<br />{rp(p.total_rp)} · {p.tanggal}
                  </div>
                  {bisaBatal(p, jendela) ? (
                    <span className="act">
                      <button type="button" className="btn sm" disabled={sibuk}
                        onClick={() => void batalPO(p.id)}>Batalkan</button>
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {a.pinjaman.length > 0 ? (
          <div className="pcard">
            <h2>Buku yang sedang dipinjam</h2>
            {a.pinjaman.map(p => (
              <div key={p.id} className="att">
                <span className={`badge ${p.hari_telat > 0 ? "warn" : "mute"}`}>
                  {p.hari_telat > 0 ? `telat ${p.hari_telat} hari` : "aktif"}
                </span>
                <div className="tx">{p.judul}<br />kembali sebelum {p.jatuh_tempo}</div>
              </div>
            ))}
            <p className="p-note" style={{ marginTop: 10 }}>
              Buku selalu diterima kembali walau terlambat — tidak pernah ditahan. Denda
              keterlambatan <b>dipotong dari saldo anak</b> di meja perpustakaan saat buku
              dikembalikan (kalau PIN dimasukkan dan saldonya cukup); kalau tidak, denda itu
              menjadi tagihan yang muncul di daftar di atas.
            </p>
          </div>
        ) : null}

        {a.laundry.length > 0 ? (
          <div className="pcard">
            <h2>Laundry</h2>
            {a.laundry.map(l => (
              <div key={l.id} className="att">
                <span className={`badge ${l.status === "siap" ? "good" : "mute"}`}>{l.status}</span>
                <div className="tx">
                  {l.item ?? l.kode}<br />{rp(l.total_rp)}
                  {l.rak ? <> · rak {l.rak}</> : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {a.loker ? (
          <div className="pcard">
            <h2>Loker</h2>
            <p style={{ margin: 0, fontSize: 13.5 }}>
              <b>{a.loker.kode}</b> · {a.loker.lokasi ?? `blok ${a.loker.blok}`} · kondisi {a.loker.kondisi}
              <br /><span className="p-note">terakhir dibuka {waktuSingkat(a.loker.akses_terakhir)}</span>
            </p>
          </div>
        ) : null}

        <div className="pcard">
          <div className="hd2">
            <h2>Riwayat</h2>
            <span style={{ marginLeft: "auto" }}>
              <input type="month" value={bulan} onChange={e => setBulan(e.target.value)}
                aria-label="Saring bulan" style={{ fontSize: 12 }} />
            </span>
          </div>

          {sengketa ? (
            <div className="t-err" style={{ marginBottom: 12 }}>
              Laporkan transaksi vending yang barangnya tidak keluar. Keuangan akan memeriksanya
              dan mengembalikan uangnya kalau memang tidak keluar.
              <div className="field" style={{ marginTop: 10 }}>
                <label className="f" htmlFor="sk">Ceritakan apa yang terjadi</label>
                <input id="sk" type="text" maxLength={300} value={sengketa.catatan} style={{ width: "100%" }}
                  onChange={e => setSengketa({ ...sengketa, catatan: e.target.value })}
                  placeholder="mis. uang terpotong tapi minumannya tersangkut" />
              </div>
              <button type="button" className="btn pri blok" disabled={sibuk || sengketa.catatan.trim().length < 3}
                onClick={() => void kirimSengketa()}>{sibuk ? "Mengirim…" : "Kirim laporan"}</button>
              <button type="button" className="btn blok" style={{ marginTop: 8 }}
                onClick={() => setSengketa(null)}>Batal</button>
            </div>
          ) : null}

          {riwayat === null ? (
            <p className="p-note" style={{ margin: 0 }}>Memuat riwayat…</p>
          ) : riwayat.length === 0 ? (
            <p className="p-note" style={{ margin: 0 }}>
              {bulan ? "Tidak ada transaksi pada bulan itu." : "Belum ada transaksi."}
            </p>
          ) : riwayat.slice(0, 60).map(t => (
            <div key={t.id} className="att">
              <span className={`badge ${t.arah_rp > 0 ? "good" : "mute"}`}>{t.jenis}</span>
              <div className="tx">
                {t.item ?? t.keterangan ?? t.layanan ?? "—"}<br />
                <b>{t.arah_rp > 0 ? "+" : "−"}{rp(Math.abs(t.arah_rp))}</b> · {waktuSingkat(t.waktu)}
                {t.offline ? " · offline" : ""}
                {t.direfund_rp ? <> · dikembalikan {rp(t.direfund_rp)}</> : null}
              </div>
              {t.layanan === "vending" && t.jenis === "belanja" && !t.direfund_rp ? (
                <span className="act">
                  <button type="button" className="btn sm"
                    onClick={() => { setPesan(""); setSengketa({ transaksi_id: t.id, catatan: "" }); }}>
                    Barang tidak keluar
                  </button>
                </span>
              ) : null}
            </div>
          ))}

          <p className="p-note" style={{ marginTop: 10 }}>
            Riwayat ini hanya milik {s.nama}. Setiap layar dan setiap permintaan diperiksa server
            terhadap daftar anak Anda — bukan disaring di ponsel.
          </p>
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
