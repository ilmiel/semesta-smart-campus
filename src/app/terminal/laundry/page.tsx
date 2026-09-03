"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PinPad from "@/components/PinPad";
import TerminalShell from "@/components/TerminalShell";
import { rp } from "@/lib/format";
import { apiTerminal, kunciIdem } from "@/lib/terminal";

/**
 * Terminal laundry asrama.
 *
 * Dua alur: TERIMA (petugas menimbang, sistem menghitung, tiket terbit) dan
 * AMBIL & BAYAR (kartu pemilik + PIN wajib, F-51).
 *
 * Tidak ada mode offline di sini — pembayaran laundry selalu butuh PIN, dan
 * PIN hanya bisa diverifikasi server (F-33).
 */

interface Tarif { kode: string; nama: string; jenis: string; harga_rp: number }
interface Hitung { total_rp: number; berat_kg: number; items: { nama: string; harga_rp: number; qty: number }[] }
interface Order {
  id: number; kode: string; status: string; siswa_id: number; nama: string; kelas: string | null;
  berat_kg: number | null; express: boolean; total_rp: number; rak: string | null; item: string | null;
}

export default function TerminalLaundry() {
  return (
    <TerminalShell judul="Terminal Laundry" layanan="laundry" anak={({ snap }) => (
      <Isi tarif={(snap.tarif as unknown as Tarif[]) ?? []} />
    )} />
  );
}

function Isi({ tarif }: { tarif: Tarif[] }) {
  const [tab, setTab] = useState<"terima" | "bayar">("terima");

  // --- terima -------------------------------------------------------------
  const [uid, setUid] = useState("");
  const [berat, setBerat] = useState("");
  const [satuan, setSatuan] = useState<Record<string, number>>({});
  const [express, setExpress] = useState(false);
  const [petugas, setPetugas] = useState("");
  const [rak, setRak] = useState("");
  const [estimasi, setEstimasi] = useState<Hitung | null>(null);
  const [tiket, setTiket] = useState<{ kode: string; total_rp: number; nama: string } | null>(null);

  // --- ambil & bayar ------------------------------------------------------
  const [order, setOrder] = useState<Order[]>([]);
  const [pilih, setPilih] = useState<Order | null>(null);
  const [uidBayar, setUidBayar] = useState("");
  const [tahapBayar, setTahapBayar] = useState<"pilih" | "kartu" | "pin" | "selesai">("pilih");
  const [hasilBayar, setHasilBayar] = useState<{ total_rp: number; saldo_rp: number; rak: string | null } | null>(null);
  // Satu kunci idempotensi per order, dipakai ulang saat kirim ulang dengan PIN.
  const idem = useRef("");

  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  const itemsUntukServer = Object.entries(satuan)
    .filter(([, q]) => q > 0)
    .map(([kode, qty]) => ({ kode, qty }));

  // Estimasi dihitung ULANG di server setiap kali input berubah — halaman ini
  // tidak pernah menghitung harga sendiri.
  const hitung = useCallback(async () => {
    const bk = Number(berat.replace(",", "."));
    if (!bk && itemsUntukServer.length === 0) { setEstimasi(null); return; }
    const r = await apiTerminal<Hitung>("/api/terminal/laundry/hitung", {
      metode: "POST",
      body: { berat_kg: Number.isFinite(bk) ? bk : 0, items: itemsUntukServer.length ? itemsUntukServer : undefined, express },
    });
    if (r.ok) { setEstimasi(r.data!); setGalat(""); } else { setEstimasi(null); setGalat(r.pesan ?? ""); }
  }, [berat, express, JSON.stringify(itemsUntukServer)]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setTimeout(() => void hitung(), 350); return () => clearTimeout(t); }, [hitung]);

  const muatOrder = useCallback(async () => {
    const r = await apiTerminal<{ order: Order[] }>("/api/terminal/laundry/order?status=siap");
    if (r.ok) setOrder(r.data!.order);
  }, []);

  useEffect(() => { if (tab === "bayar") void muatOrder(); }, [tab, muatOrder]);

  async function terima() {
    const bk = Number(berat.replace(",", "."));
    setSibuk(true); setGalat("");
    const r = await apiTerminal<{ order_id: number; kode: string; total_rp: number; nama: string }>(
      "/api/terminal/laundry/terima", {
        metode: "POST",
        body: {
          uid: uid.trim().toUpperCase(),
          berat_kg: Number.isFinite(bk) && bk > 0 ? bk : undefined,
          items: itemsUntukServer.length ? itemsUntukServer : undefined,
          express, petugas: petugas || undefined, rak: rak || undefined,
        },
      });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan ?? "Gagal menerima cucian"); return; }
    setTiket({ kode: r.data!.kode, total_rp: r.data!.total_rp, nama: r.data!.nama });
    setUid(""); setBerat(""); setSatuan({}); setExpress(false); setRak(""); setEstimasi(null);
  }

  async function bayar(pin?: string) {
    if (!pilih) return;
    if (!idem.current) idem.current = kunciIdem();
    setSibuk(true); setGalat("");
    const r = await apiTerminal<{ total_rp: number; saldo_rp: number; rak: string | null }>(
      "/api/terminal/laundry/bayar", {
        metode: "POST",
        body: { order_id: pilih.id, uid: uidBayar.trim().toUpperCase(), pin, idem: idem.current },
      });
    setSibuk(false);
    if (r.status === 428 || r.kode === "BUTUH_PIN") { setTahapBayar("pin"); return; }
    if (!r.ok) { setGalat(r.pesan ?? "Pembayaran ditolak"); setTahapBayar("kartu"); return; }
    setHasilBayar(r.data!);
    setTahapBayar("selesai");
    void muatOrder();
  }

  function ulangBayar() {
    setPilih(null); setUidBayar(""); setHasilBayar(null); setGalat("");
    idem.current = ""; setTahapBayar("pilih");
  }

  return (
    <>
      <div className="t-tabs" style={{ gridTemplateColumns: "repeat(2,1fr)", marginBottom: 14 }}>
        <button type="button" role="tab" aria-selected={tab === "terima"} className={tab === "terima" ? "on" : undefined}
          onClick={() => { setTab("terima"); setTiket(null); setGalat(""); }}>⚖ Terima cucian</button>
        <button type="button" role="tab" aria-selected={tab === "bayar"} className={tab === "bayar" ? "on" : undefined}
          onClick={() => { setTab("bayar"); ulangBayar(); }}>💳 Ambil &amp; bayar</button>
      </div>

      {galat ? <div className="t-err" style={{ marginBottom: 12 }}>{galat}</div> : null}

      {tab === "terima" ? (
        tiket ? (
          <section className="t-panel">
            <div className="t-ok">
              ✓ Tiket <b>{tiket.kode}</b> — {tiket.nama}<br />
              Total <b>{rp(tiket.total_rp)}</b>, dibayar saat pengambilan.
            </div>
            <button type="button" className="btn pri blok" style={{ marginTop: 12 }} onClick={() => setTiket(null)}>
              Terima cucian berikutnya
            </button>
          </section>
        ) : (
          <section className="t-panel">
            <div className="field">
              <label className="f" htmlFor="uid">Kartu siswa (UID)</label>
              <input id="uid" autoFocus style={{ width: "100%", fontFamily: "monospace" }} value={uid}
                onChange={e => setUid(e.target.value.toUpperCase())} placeholder="tempelkan kartu ke reader" />
            </div>
            <div className="field">
              <label className="f" htmlFor="berat">Berat (kg)</label>
              <input id="berat" inputMode="decimal" style={{ width: "100%" }} value={berat}
                onChange={e => setBerat(e.target.value)} placeholder="mis. 2.5" />
            </div>

            {tarif.filter(t => t.jenis === "satuan").length > 0 ? (
              <>
                <p className="f" style={{ marginBottom: 6 }}>Satuan</p>
                {tarif.filter(t => t.jenis === "satuan").map(t => (
                  <div className="ks-cartrow" key={t.kode}>
                    <button type="button" className="qbtn"
                      onClick={() => setSatuan(s => ({ ...s, [t.kode]: Math.max(0, (s[t.kode] ?? 0) - 1) }))}>−</button>
                    <span className="mono">{satuan[t.kode] ?? 0}</span>
                    <button type="button" className="qbtn"
                      onClick={() => setSatuan(s => ({ ...s, [t.kode]: (s[t.kode] ?? 0) + 1 }))}>+</button>
                    <span className="nm">{t.nama}</span><b>{rp(t.harga_rp)}</b>
                  </div>
                ))}
              </>
            ) : null}

            <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0" }}>
              <input type="checkbox" checked={express} onChange={e => setExpress(e.target.checked)} />
              Express (biaya tambahan sesuai kebijakan)
            </label>

            <div className="field">
              <label className="f" htmlFor="rak">Rak (opsional)</label>
              <input id="rak" style={{ width: "100%" }} value={rak} onChange={e => setRak(e.target.value)} placeholder="mis. B-14" />
            </div>
            <div className="field">
              <label className="f" htmlFor="petugas">Petugas (opsional)</label>
              <input id="petugas" style={{ width: "100%" }} value={petugas} onChange={e => setPetugas(e.target.value)} />
            </div>

            <div className="t-total">
              <span className="l">Estimasi{estimasi?.berat_kg ? ` · ditagih ${estimasi.berat_kg} kg` : ""}</span>
              <span className="v">{estimasi ? rp(estimasi.total_rp) : "—"}</span>
            </div>
            <p className="p-note" style={{ margin: "6px 0 0" }}>
              Harga dihitung server dari tarif yang berlaku — petugas tidak bisa mengubahnya (F-41).
            </p>
            <button type="button" className="btn pri blok" style={{ marginTop: 12, minHeight: 52 }}
              disabled={sibuk || uid.trim().length < 8 || !estimasi} onClick={() => void terima()}>
              {sibuk ? "Menyimpan…" : "Terima & cetak tiket"}
            </button>
          </section>
        )
      ) : (
        <section className="t-panel">
          {tahapBayar === "selesai" && hasilBayar ? (
            <>
              <div className="t-ok">
                ✓ Lunas {rp(hasilBayar.total_rp)}. Sisa saldo {rp(hasilBayar.saldo_rp)}.
                {hasilBayar.rak ? <> Ambil di rak <b>{hasilBayar.rak}</b>.</> : null}
              </div>
              <button type="button" className="btn pri blok" style={{ marginTop: 12 }} onClick={ulangBayar}>Order berikutnya</button>
            </>
          ) : tahapBayar === "pin" && pilih ? (
            <>
              <p className="t-big" style={{ margin: 0, textAlign: "center" }}>
                <b>{pilih.nama}</b> masukkan PIN — semua pembayaran laundry wajib PIN.
              </p>
              <PinPad sibuk={sibuk} onLengkap={(pin) => void bayar(pin)} onBatal={ulangBayar} />
            </>
          ) : tahapBayar === "kartu" && pilih ? (
            <>
              <p className="t-big" style={{ margin: "0 0 4px" }}>
                <b>{pilih.kode}</b> · {pilih.nama} · {rp(pilih.total_rp)}
              </p>
              <p className="p-note" style={{ margin: "0 0 10px" }}>
                Kartu harus milik pemesan sendiri — kartu orang lain ditolak server (F-51).
              </p>
              <div className="field">
                <label className="f" htmlFor="uid-bayar">Kartu siswa (UID)</label>
                <input id="uid-bayar" autoFocus style={{ width: "100%", fontFamily: "monospace" }} value={uidBayar}
                  onChange={e => setUidBayar(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter" && uidBayar.trim().length >= 8) void bayar(); }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn pri" style={{ flex: 1, justifyContent: "center", minHeight: 52 }}
                  disabled={sibuk || uidBayar.trim().length < 8} onClick={() => void bayar()}>
                  {sibuk ? "Memproses…" : "Bayar"}
                </button>
                <button type="button" className="btn" style={{ flex: 1, justifyContent: "center" }} onClick={ulangBayar}>Batal</button>
              </div>
            </>
          ) : (
            <>
              <div className="hd" style={{ marginBottom: 8 }}>
                <h2 style={{ fontSize: 15 }}>Siap diambil</h2>
                <div className="r"><button type="button" className="btn sm" onClick={() => void muatOrder()}>Muat ulang</button></div>
              </div>
              {order.length === 0 ? <p className="p-note" style={{ margin: 0 }}>Belum ada cucian berstatus siap.</p> : null}
              {order.map(o => (
                <div className="att" key={o.id}>
                  <span className="badge good">{o.rak ?? "—"}</span>
                  <div className="tx">
                    <b>{o.kode} · {o.nama}</b> {o.kelas ? `(${o.kelas})` : ""}
                    <div className="d">{o.item ?? ""}{o.express ? " · express" : ""} · {rp(o.total_rp)}</div>
                  </div>
                  <button type="button" className="btn sm pri" onClick={() => { setPilih(o); setTahapBayar("kartu"); }}>Bayar</button>
                </div>
              ))}
            </>
          )}
        </section>
      )}
    </>
  );
}
