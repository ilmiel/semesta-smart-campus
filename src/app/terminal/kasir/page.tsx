"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PinPad from "@/components/PinPad";
import { useToast } from "@/components/Toast";
import { rp } from "@/lib/format";
import {
  ambilFoto, ambilKunci, apiTerminal, bacaAntrian, hapusKunci, kirimAntrian,
  kunciIdem, simpanKunci, tambahAntrian, type ItemAntrian,
} from "@/lib/terminal";

/**
 * Terminal kasir kantin — tersambung ke API.
 *
 * Alur yang ditegakkan SERVER, bukan halaman ini:
 *   identitas kartu, saldo, ambang PIN, limit harian, limit offline,
 *   idempotensi, dan siapa yang boleh membatalkan apa.
 * Halaman ini hanya mengirim permintaan dan menampilkan jawabannya. Kalau
 * ada aturan uang yang terasa perlu ditulis di sini, itu tandanya aturan
 * tersebut kurang di server.
 *
 * Mode offline: hanya untuk kasus server BENAR-BENAR tidak terjangkau
 * (fetch gagal). Penolakan dari server — saldo kurang, kartu diblokir,
 * limit — tidak pernah masuk antrian; itu keputusan yang sudah diambil.
 */

const NOMINAL_CEPAT = [8000, 12000, 15000, 19000, 20000, 25000];

type Mode = "nominal" | "menu" | "po";
type Tahap = "beranda" | "tap" | "verifikasi" | "pin" | "tolak" | "selesai";

interface Kebijakan { ambang_pin_rp: number; limit_offline_rp: number; kumulatif_offline_rp: number; limit_harian_rp: number }
interface MenuItem { id: number; nama: string; harga_rp: number; kategori?: string | null }
interface Siswa { id: number; nis: string; nama: string; kelas: string | null; jenjang: string | null }
interface HasilTap { siswa: Siswa; saldo_rp: number; foto_url: string; pin: { ada: boolean; terkunci: boolean; harus_ganti: boolean } }
interface HasilBayar { transaksi_id: number; kode: string; baru: boolean; nama: string; saldo_rp: number; total_rp: number }
interface PoBaris {
  po_id: number; kode: string; siswa_id: number; nama: string; kelas: string | null;
  total_rp: number; status: string; item: string | null; lewat_kartu: boolean;
}

export default function TerminalKasir() {
  const toast = useToast();

  // --- konfigurasi perangkat ---------------------------------------------
  const [kunci, setKunci] = useState<string | null>(null);
  const [kunciDraf, setKunciDraf] = useState("");
  const [device, setDevice] = useState<{ kode: string; nama: string } | null>(null);
  const [kebijakan, setKebijakan] = useState<Kebijakan | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [siap, setSiap] = useState(false);

  // --- keadaan jaringan & antrian ----------------------------------------
  const [terjangkau, setTerjangkau] = useState(true);
  const [antrian, setAntrian] = useState(0);

  // --- transaksi berjalan -------------------------------------------------
  const [mode, setMode] = useState<Mode>("nominal");
  const [tahap, setTahap] = useState<Tahap>("beranda");
  const [nominal, setNominal] = useState(0);
  const [keranjang, setKeranjang] = useState<Record<number, number>>({});
  const [uid, setUid] = useState("");
  const [tap, setTap] = useState<HasilTap | null>(null);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [terakhir, setTerakhir] = useState<{ id: number; total: number } | null>(null);
  // Object URL foto; dibebaskan saat transaksi berganti (§8.1).
  const [foto, setFoto] = useState<string | null>(null);

  // Kunci idempotensi dibuat SEKALI per transaksi dan dipakai ulang saat
  // kirim ulang dengan PIN. Kalau dibuat baru setiap kirim, PIN yang benar
  // akan menghasilkan transaksi kedua (F-14).
  const idem = useRef<string>("");

  // --- PO ------------------------------------------------------------------
  const [po, setPo] = useState<PoBaris[]>([]);
  const [kodePo, setKodePo] = useState("");

  const ambang = kebijakan?.ambang_pin_rp ?? 25000;
  const batasOffline = kebijakan?.limit_offline_rp ?? 0;

  const menuAktif = useMemo(() => menu, [menu]);
  const total = mode === "nominal"
    ? nominal
    : Object.entries(keranjang).reduce((t, [id, q]) => t + (menuAktif.find(m => m.id === Number(id))?.harga_rp ?? 0) * q, 0);
  const nItem = Object.values(keranjang).reduce((a, b) => a + b, 0);

  // ---------------------------------------------------------------- muat awal
  const muat = useCallback(async () => {
    const r = await apiTerminal<{ device: { kode: string; nama: string }; kebijakan: Kebijakan; menu: MenuItem[] }>(
      "/api/terminal/snapshot");
    if (r.putus) { setTerjangkau(false); setSiap(true); return; }
    if (!r.ok) {
      setPesan(r.pesan ?? "Kunci perangkat ditolak server.");
      if (r.kode === "DEVICE_TIDAK_DIKENAL" || r.kode === "DEVICE_NONAKTIF" || r.status === 401) {
        hapusKunci(); setKunci(null);
      }
      setSiap(true);
      return;
    }
    setTerjangkau(true);
    setDevice(r.data!.device);
    setKebijakan(r.data!.kebijakan);
    setMenu(r.data!.menu ?? []);
    setSiap(true);
  }, []);

  useEffect(() => {
    const k = ambilKunci();
    setKunci(k);
    setAntrian(bacaAntrian().length);
    if (k) void muat(); else setSiap(true);
  }, [muat]);

  // Coba kirim antrian saat jaringan pulih.
  const sinkron = useCallback(async () => {
    if (bacaAntrian().length === 0) return;
    const r = await kirimAntrian();
    setAntrian(bacaAntrian().length);
    if (r.putus) return;
    if (!r.ok) { toast(`Sinkron gagal: ${r.pesan ?? r.kode}`); return; }
    const d = r.data!;
    setTerjangkau(true);
    if (d.ditolak > 0) {
      toast(`${d.diproses} transaksi masuk, ${d.ditolak} DITOLAK — cek Perangkat di dashboard`);
    } else {
      toast(`${d.diproses} transaksi offline berhasil disinkronkan`);
    }
  }, [toast]);

  useEffect(() => {
    if (!kunci) return;
    const t = setInterval(() => { void sinkron(); }, 30_000);
    const pulih = () => { setTerjangkau(true); void sinkron(); void muat(); };
    window.addEventListener("online", pulih);
    return () => { clearInterval(t); window.removeEventListener("online", pulih); };
  }, [kunci, sinkron, muat]);

  // ---------------------------------------------------------------- aksi
  const tolak = (t: string) => { setPesan(t); setTahap("tolak"); };
  const transaksiBaru = () => {
    setNominal(0); setKeranjang({}); setUid(""); setTap(null); setPesan("");
    setFoto(f => { if (f) URL.revokeObjectURL(f); return null; });
    idem.current = ""; setTahap("beranda");
  };

  const mulaiTap = () => {
    if (total <= 0) return;
    idem.current = kunciIdem();
    setUid(""); setTap(null);
    setFoto(f => { if (f) URL.revokeObjectURL(f); return null; });
    setTahap("tap");
  };

  /** Tap kartu: identifikasi dulu supaya kasir bisa mencocokkan wajah (F-42). */
  async function identifikasi(uidMentah: string) {
    const u = uidMentah.trim().toUpperCase();
    if (u.length < 8) { toast("UID kartu terlalu pendek"); return; }
    setSibuk(true);
    const r = await apiTerminal<HasilTap>("/api/terminal/tap", { metode: "POST", body: { uid: u } });
    setSibuk(false);
    setUid(u);
    if (r.putus) {
      // Offline: tidak bisa mengidentifikasi. Kasir tetap boleh melanjutkan
      // dalam batas offline; server yang akan memutuskan saat sinkron.
      setTerjangkau(false);
      if (total > batasOffline) {
        tolak(`Server tidak terjangkau. Maksimal ${rp(batasOffline)} per transaksi saat offline — pecah belanjaan atau tunggu koneksi pulih.`);
        return;
      }
      setTap(null); setTahap("verifikasi");
      return;
    }
    if (!r.ok) { tolak(r.pesan ?? "Kartu ditolak."); return; }
    setTerjangkau(true);
    setTap(r.data!);
    setTahap("verifikasi");
    // Foto menyusul; kasir tidak perlu menunggunya untuk melihat nama & kelas.
    void ambilFoto(r.data!.siswa.nis).then(setFoto);
  }

  /** Kirim pembayaran. Dipanggil ulang dengan PIN saat server menjawab 428. */
  async function bayar(pin?: string) {
    setSibuk(true);
    const body: Record<string, unknown> = { idem: idem.current, uid };
    if (mode === "nominal") body.total = total;
    else body.items = Object.entries(keranjang).map(([id, qty]) => ({ menu_id: Number(id), qty }));
    if (pin) body.pin = pin;

    const r = await apiTerminal<HasilBayar>("/api/terminal/bayar", { metode: "POST", body });
    setSibuk(false);

    if (r.putus) { keAntrian(); return; }
    if (r.status === 428 || r.kode === "BUTUH_PIN") { setTahap("pin"); return; }
    if (!r.ok) { tolak(r.pesan ?? "Transaksi ditolak."); return; }

    const d = r.data!;
    setTerakhir({ id: d.transaksi_id, total: d.total_rp });
    setPesan(`✓ ${rp(d.total_rp)} terpotong dari saldo ${d.nama.split(" ")[0]}. Sisa ${rp(d.saldo_rp)}.`);
    setTahap("selesai");
  }

  /** Simpan ke antrian lokal — HANYA saat server tidak terjangkau. */
  function keAntrian() {
    if (total > batasOffline) {
      tolak(`Server tidak terjangkau dan nominal di atas batas offline ${rp(batasOffline)}. Transaksi tidak dicatat.`);
      return;
    }
    const item: ItemAntrian = {
      idempotency_key: idem.current,
      kartu_uid: uid,
      nominal_rp: total,
      waktu_terminal: new Date().toISOString(),
      keterangan: mode === "menu" ? `${nItem} item (offline)` : "Belanja kantin (offline)",
    };
    if (mode === "menu") {
      item.items = Object.entries(keranjang).map(([id, qty]) => {
        const m = menuAktif.find(x => x.id === Number(id))!;
        return { nama: m.nama, harga_rp: m.harga_rp, qty, ref_id: m.id };
      });
    }
    const n = tambahAntrian(item);
    setAntrian(n);
    setTerakhir(null);   // transaksi offline tidak punya id server → tidak bisa dibatalkan di sini
    setPesan(`✓ ${rp(total)} masuk antrian offline (#${n}). Diproses otomatis saat koneksi pulih; kunci idempotensi mencegah potongan dobel.`);
    setTahap("selesai");
  }

  async function batalkan() {
    if (!terakhir) return;
    setSibuk(true);
    const r = await apiTerminal<{ refund_id: number }>("/api/terminal/batal", { metode: "POST", body: { transaksi_id: terakhir.id } });
    setSibuk(false);
    if (!r.ok) { toast(r.pesan ?? "Pembatalan ditolak"); return; }
    toast(`Transaksi ${rp(terakhir.total)} dibatalkan — tercatat sebagai pembatalan kasir`);
    setTerakhir(null);
    transaksiBaru();
  }

  async function cariPo(pakai: { uid?: string; kode?: string }) {
    setSibuk(true);
    const r = await apiTerminal<{ po: PoBaris[] }>("/api/terminal/po/cari", { metode: "POST", body: pakai });
    setSibuk(false);
    if (!r.ok) { toast(r.pesan ?? "PO tidak ditemukan"); setPo([]); return; }
    setPo(r.data!.po);
    if (r.data!.po.length === 0) toast("Tidak ada PO untuk kartu/kode itu");
  }

  async function ambilPo(id: number) {
    setSibuk(true);
    const r = await apiTerminal<{ diambil: number }>("/api/terminal/po/ambil", { metode: "POST", body: { po_ids: [id] } });
    setSibuk(false);
    if (!r.ok) { toast(r.pesan ?? "Gagal menandai PO"); return; }
    toast("PO ditandai sudah diambil");
    setPo(p => p.filter(x => x.po_id !== id));
  }

  const ketikNominal = (aksi: string) => {
    setNominal(v => {
      let n = v;
      if (aksi === "c") n = 0;
      else if (aksi === "000") n = v * 1000;
      else if (aksi === "hapus") n = Math.floor(v / 10);
      else n = v * 10 + Number(aksi);
      if (n > 500000) { toast("Nominal tidak wajar untuk kantin — dikosongkan, cek lagi"); return 0; }
      return n;
    });
  };

  // ---------------------------------------------------------------- tampilan
  if (!siap) {
    return <div className="root"><div className="t-shell"><p className="p-note">Memuat terminal…</p></div></div>;
  }

  if (!kunci) {
    return (
      <div className="root">
        <div className="t-shell" style={{ maxWidth: 560 }}>
          <section className="t-panel">
            <h1 style={{ fontSize: 18, margin: "0 0 6px" }}>Pengaturan terminal</h1>
            <p className="p-note" style={{ marginTop: 0 }}>
              Masukkan kunci perangkat dari dashboard admin (Perangkat → Daftarkan). Kunci hanya
              tampil sekali di sana dan disimpan di penyimpanan lokal terminal ini.
            </p>
            {pesan ? <div className="t-err" style={{ marginBottom: 10 }}>{pesan}</div> : null}
            <div className="field">
              <label className="f" htmlFor="kunci">Kunci perangkat</label>
              <input id="kunci" type="password" style={{ width: "100%" }} value={kunciDraf}
                onChange={e => setKunciDraf(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && kunciDraf.trim()) { simpanKunci(kunciDraf); setKunci(kunciDraf.trim()); setPesan(""); void muat(); } }} />
            </div>
            <button type="button" className="btn pri blok" disabled={!kunciDraf.trim()}
              onClick={() => { simpanKunci(kunciDraf); setKunci(kunciDraf.trim()); setPesan(""); void muat(); }}>
              Simpan &amp; hubungkan
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="root">
      <div className="t-shell" style={{ maxWidth: 1020 }}>
        <div className="t-head">
          <span className="id">{device?.kode ?? "…"}</span> · {device?.nama ?? ""} ·{" "}
          <span className={`ks-status ${terjangkau ? "on" : "off"}`}>● {terjangkau ? "Online" : "Offline"}</span>
          {antrian > 0 ? <span className="badge warn">antrian offline: <b>{antrian}</b></span> : null}
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {antrian > 0 ? <button type="button" className="btn sm" onClick={() => void sinkron()}>Sinkron sekarang</button> : null}
            <button type="button" className="btn sm" onClick={() => { hapusKunci(); setKunci(null); setKunciDraf(""); }}>Ganti kunci</button>
          </span>
        </div>

        <div className="t-tabs" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 14 }}>
          <button type="button" role="tab" aria-selected={mode === "nominal"} className={mode === "nominal" ? "on" : undefined}
            onClick={() => { setMode("nominal"); transaksiBaru(); }}>⌨ Nominal</button>
          <button type="button" role="tab" aria-selected={mode === "menu"} className={mode === "menu" ? "on" : undefined}
            onClick={() => { setMode("menu"); transaksiBaru(); }}>▤ Menu</button>
          <button type="button" role="tab" aria-selected={mode === "po"} className={mode === "po" ? "on" : undefined}
            onClick={() => { setMode("po"); transaksiBaru(); setPo([]); }}>🧾 PO</button>
        </div>

        <div className="ks-wrap">
          <div>
            {mode === "nominal" ? (
              <section className="t-panel">
                <div className="t-total" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
                  <span className="l">Total belanja</span>
                  <button type="button" onClick={() => ketikNominal("hapus")} aria-label="Hapus digit"
                    style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid var(--rule)", background: "var(--surface)", cursor: "pointer", fontSize: 16 }}>⌫</button>
                  <span className="v">{rp(nominal)}</span>
                </div>
                <div className="nom-grid" style={{ marginTop: 12 }}>
                  {NOMINAL_CEPAT.map(n => <button key={n} type="button" onClick={() => setNominal(n)}>{n.toLocaleString("id-ID")}</button>)}
                </div>
                <div className="keypad" style={{ maxWidth: 340, margin: "6px auto 0" }}>
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => <button key={d} type="button" onClick={() => ketikNominal(d)}>{d}</button>)}
                  <button type="button" className="fn" onClick={() => ketikNominal("c")}>C</button>
                  <button type="button" onClick={() => ketikNominal("0")}>0</button>
                  <button type="button" className="fn" onClick={() => ketikNominal("000")}>000</button>
                </div>
                <button type="button" className="btn pri blok" style={{ marginTop: 14, minHeight: 56, fontSize: 16 }}
                  disabled={nominal === 0 || tahap !== "beranda"} onClick={mulaiTap}>Tap kartu →</button>
                {!terjangkau && nominal > batasOffline
                  ? <p className="p-note" style={{ margin: "10px 0 0" }}>Offline: maksimal {rp(batasOffline)} per transaksi.</p>
                  : nominal > ambang ? <p className="p-note" style={{ margin: "10px 0 0" }}>Di atas {rp(ambang)} — siswa akan diminta PIN.</p> : null}
              </section>
            ) : mode === "menu" ? (
              <section className="t-panel">
                {menuAktif.length === 0 ? (
                  <p className="p-note" style={{ margin: 0 }}>
                    Menu belum dimuat{terjangkau ? " — belum ada menu aktif di dashboard admin." : " (offline)."}
                  </p>
                ) : (
                  <div className="ks-menu">
                    {menuAktif.map(m => (
                      <button key={m.id} type="button" onClick={() => setKeranjang(k => ({ ...k, [m.id]: (k[m.id] ?? 0) + 1 }))}>
                        <span className="em">🍽</span>{m.nama}
                        <span className="hg">{rp(m.harga_rp)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="p-note" style={{ margin: "12px 0 0" }}>
                  Menu &amp; harga dari dashboard admin — kasir tidak bisa mengubahnya (F-41). Harga
                  dihitung ulang di server saat pembayaran.
                </p>
              </section>
            ) : (
              <section className="t-panel">
                <p className="t-big" style={{ margin: "0 0 4px" }}><b>Pesanan PO</b></p>
                <p className="p-note" style={{ margin: "0 0 10px" }}>
                  Sudah dibayar saat pesan — tidak ada pembayaran di sini. Tap kartu siswa, atau cari
                  pakai kode PO kalau kartunya diblokir (F-48).
                </p>
                <div className="field">
                  <label className="f" htmlFor="po-uid">Tap kartu (UID)</label>
                  <input id="po-uid" style={{ width: "100%" }} placeholder="tempelkan kartu / ketik UID"
                    onKeyDown={e => { if (e.key === "Enter") void cariPo({ uid: (e.target as HTMLInputElement).value.trim().toUpperCase() }); }} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="po-kode">atau kode PO</label>
                  <input id="po-kode" style={{ width: "100%" }} value={kodePo} onChange={e => setKodePo(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === "Enter" && kodePo.trim()) void cariPo({ kode: kodePo.trim() }); }} />
                </div>
                <button type="button" className="btn pri blok" disabled={sibuk || !kodePo.trim()} onClick={() => void cariPo({ kode: kodePo.trim() })}>
                  Cari PO
                </button>
                {po.map(p => (
                  <div className="att" key={p.po_id}>
                    <span className={`badge ${p.status === "dibayar" ? "good" : "mute"}`}>{p.status}</span>
                    <div className="tx">
                      <b>{p.kode} · {p.nama}</b> {p.kelas ? `(${p.kelas})` : ""}
                      <div className="d">
                        {p.item ?? ""} · lunas {rp(p.total_rp)}
                        {!p.lewat_kartu ? " · dicari lewat kode PO" : ""}
                      </div>
                    </div>
                    {p.status === "dibayar" ? (
                      <button type="button" className="btn sm pri" disabled={sibuk} onClick={() => void ambilPo(p.po_id)}>Serahkan</button>
                    ) : null}
                  </div>
                ))}
              </section>
            )}
          </div>

          <div>
            {mode === "menu" && tahap === "beranda" ? (
              <section className="t-panel">
                <div className="hd" style={{ marginBottom: 8 }}>
                  <h2 style={{ fontSize: 15 }}>Keranjang</h2>
                  <div className="r"><button type="button" className="btn sm" onClick={() => setKeranjang({})}>Kosongkan</button></div>
                </div>
                {nItem === 0 ? <p className="p-note" style={{ margin: "6px 0" }}>Ketuk menu untuk menambahkan.</p> :
                  Object.entries(keranjang).map(([id, q]) => {
                    const m = menuAktif.find(x => x.id === Number(id));
                    if (!m) return null;
                    return (
                      <div className="ks-cartrow" key={id}>
                        <button type="button" className="qbtn" onClick={() => setKeranjang(k => {
                          const nk = { ...k }; nk[Number(id)] -= 1; if (nk[Number(id)] <= 0) delete nk[Number(id)]; return nk;
                        })}>−</button>
                        <span className="mono">{q}</span>
                        <button type="button" className="qbtn" onClick={() => setKeranjang(k => ({ ...k, [Number(id)]: k[Number(id)] + 1 }))}>+</button>
                        <span className="nm">{m.nama}</span><b>{(m.harga_rp * q).toLocaleString("id-ID")}</b>
                      </div>
                    );
                  })}
                <div className="t-total"><span className="l">Total</span><span className="v">{rp(total)}</span></div>
                <button type="button" className="btn pri blok" style={{ marginTop: 12, minHeight: 56, fontSize: 16 }}
                  disabled={total === 0} onClick={mulaiTap}>Tap kartu →</button>
              </section>
            ) : null}

            {tahap === "tap" ? (
              <section className="t-panel">
                <div className="t-total" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
                  <span className="l">Total</span><span className="v">{rp(total)}</span>
                </div>
                <p className="t-big" style={{ margin: "10px 0 6px" }}><b>Tap kartu siswa.</b></p>
                <div className="field">
                  <label className="f" htmlFor="uid">UID kartu</label>
                  {/* Reader USB mengetikkan UID lalu menekan Enter — sama seperti mengetik manual. */}
                  <input id="uid" autoFocus style={{ width: "100%", fontFamily: "var(--mono, monospace)" }}
                    placeholder="tempelkan kartu ke reader"
                    onKeyDown={e => { if (e.key === "Enter") void identifikasi((e.target as HTMLInputElement).value); }} />
                </div>
                {sibuk ? <p className="p-note" style={{ margin: 0 }}>Memeriksa kartu…</p> : null}
                <button type="button" className="btn blok" style={{ marginTop: 10 }} onClick={transaksiBaru}>← Batal</button>
              </section>
            ) : null}

            {tahap === "verifikasi" ? (
              <section className="t-panel">
                {tap ? (
                  <>
                    {foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={foto} alt="" className="ks-foto" style={{ objectFit: "cover" }} />
                    ) : (
                      <div className="ks-foto">{tap.siswa.nama.split(" ").map(x => x[0]).slice(0, 2).join("")}</div>
                    )}
                    <p style={{ textAlign: "center", margin: 0 }}>
                      <b style={{ fontSize: 18 }}>{tap.siswa.nama}</b><br />
                      <span style={{ color: "var(--ink-2)", fontSize: 13 }}>{tap.siswa.kelas ?? "—"} · {tap.siswa.nis}</span>
                    </p>
                    <p style={{ textAlign: "center", margin: "10px 0 0" }}>
                      <span className={`badge ${tap.saldo_rp >= total ? "good" : "warn"}`}>
                        {tap.saldo_rp >= total ? "saldo cukup ✓" : "saldo kurang"}
                      </span>
                      {tap.pin.terkunci ? <span className="badge warn" style={{ marginLeft: 6 }}>PIN terkunci</span> : null}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="ks-foto">?</div>
                    <p style={{ textAlign: "center", margin: 0 }}>
                      <b style={{ fontSize: 16 }}>Offline — identitas tidak bisa diperiksa</b><br />
                      <span style={{ color: "var(--ink-2)", fontSize: 13 }}>{uid}</span>
                    </p>
                  </>
                )}
                <p className="p-note" style={{ textAlign: "center", margin: "8px 0 0" }}>
                  Cocokkan wajah dengan foto — ini penahan utama kartu pinjaman/kloning (F-42).
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button type="button" className="btn pri" style={{ flex: 1, justifyContent: "center", minHeight: 52 }}
                    disabled={sibuk} onClick={() => (terjangkau ? void bayar() : keAntrian())}>
                    {sibuk ? "Memproses…" : "✓ Benar orangnya"}
                  </button>
                  <button type="button" className="btn danger" style={{ flex: 1, justifyContent: "center", minHeight: 52 }}
                    disabled={sibuk} onClick={() => { toast("Dibatalkan — kartu bukan milik pemegangnya"); transaksiBaru(); }}>
                    ✕ Bukan
                  </button>
                </div>
              </section>
            ) : null}

            {tahap === "pin" ? (
              <section className="t-panel">
                <p className="t-big" style={{ margin: 0, textAlign: "center" }}>
                  <b>Siswa masukkan PIN</b> — total di atas {rp(ambang)}.
                </p>
                <PinPad sibuk={sibuk} onLengkap={(pin) => void bayar(pin)} onBatal={transaksiBaru} />
              </section>
            ) : null}

            {tahap === "tolak" ? (
              <section className="t-panel">
                <div className="t-err">{pesan}</div>
                <button type="button" className="btn blok" style={{ marginTop: 12 }} onClick={transaksiBaru}>Kembali</button>
              </section>
            ) : null}

            {tahap === "selesai" ? (
              <section className="t-panel">
                <div className="t-ok">{pesan}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="button" className="btn pri" style={{ flex: 1.4, justifyContent: "center", minHeight: 52 }}
                    onClick={transaksiBaru}>Transaksi baru</button>
                  {terakhir ? (
                    <button type="button" className="btn" style={{ flex: 1, justifyContent: "center" }}
                      disabled={sibuk} onClick={() => void batalkan()}>Batalkan</button>
                  ) : null}
                </div>
                {!terakhir ? (
                  <p className="p-note" style={{ margin: "10px 0 0" }}>
                    Transaksi offline belum punya nomor dari server, jadi belum bisa dibatalkan di sini.
                    Setelah tersinkron, pembatalan lewat keuangan.
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
