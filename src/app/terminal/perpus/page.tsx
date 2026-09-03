"use client";

import { useState } from "react";
import PinPad from "@/components/PinPad";
import TerminalShell from "@/components/TerminalShell";
import { rp } from "@/lib/format";
import { apiTerminal } from "@/lib/terminal";

/**
 * Meja sirkulasi perpustakaan.
 *
 * Alur: scan barcode → server menjawab status eksemplar → pinjam (tap kartu)
 * atau kembalikan.
 *
 * Aturan pengembalian (F-71) yang ditegakkan server: buku SELALU diterima,
 * bahkan kalau saldo siswa kosong. Denda keterlambatan boleh dipotong dari
 * wallet kalau siswa memasukkan PIN; kalau tidak, denda jadi tagihan yang
 * dibayar orang tua lewat portal. Halaman ini tidak pernah menahan buku.
 */

interface Scan {
  eksemplar_id: number; buku_id: number; judul: string; pengarang: string | null;
  kategori: string | null; rak: string | null; nomor: number; total_eksemplar: number;
  status: string; bisa_dipinjam: boolean; alasan: string | null;
  peminjam: string | null; pinjaman_id: number | null;
}
interface HasilPinjam { judul: string; nama: string; jatuh_tempo: string; pinjaman_aktif: number; maks_buku: number }
interface HasilKembali {
  judul: string; nama: string; hari_telat: number; denda_rp: number;
  denda_status: string | null; saldo_rp: number | null; rak: string | null; pinjaman_aktif: number;
}

export default function TerminalPerpus() {
  return <TerminalShell judul="Meja Sirkulasi" layanan="perpustakaan" anak={() => <Isi />} />;
}

function Isi() {
  const [barcode, setBarcode] = useState("");
  const [scan, setScan] = useState<Scan | null>(null);
  const [uid, setUid] = useState("");
  const [petugas, setPetugas] = useState("");
  const [tahap, setTahap] = useState<"scan" | "pinjam" | "pin" | "hasil">("scan");
  const [pinjam, setPinjam] = useState<HasilPinjam | null>(null);
  const [kembali, setKembali] = useState<HasilKembali | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  function ulang() {
    setBarcode(""); setScan(null); setUid(""); setPinjam(null); setKembali(null);
    setGalat(""); setTahap("scan");
  }

  async function lakukanScan(kode: string) {
    const b = kode.trim();
    if (b.length < 2) return;
    setSibuk(true); setGalat("");
    const r = await apiTerminal<Scan>("/api/terminal/perpus/scan", { metode: "POST", body: { barcode: b } });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan ?? "Barcode tidak dikenal"); setScan(null); return; }
    setScan(r.data!);
    setBarcode(b);
  }

  async function lakukanPinjam() {
    if (!scan) return;
    setSibuk(true); setGalat("");
    const r = await apiTerminal<HasilPinjam>("/api/terminal/perpus/pinjam", {
      metode: "POST", body: { barcode, uid: uid.trim().toUpperCase(), petugas: petugas || undefined },
    });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan ?? "Peminjaman ditolak"); return; }
    setPinjam(r.data!); setTahap("hasil");
  }

  async function lakukanKembali(pin?: string) {
    setSibuk(true); setGalat("");
    const r = await apiTerminal<HasilKembali>("/api/terminal/perpus/kembali", {
      metode: "POST", body: { barcode, pin, petugas: petugas || undefined },
    });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan ?? "Pengembalian gagal"); setTahap("scan"); return; }
    setKembali(r.data!); setTahap("hasil");
  }

  return (
    <>
      {galat ? <div className="t-err" style={{ marginBottom: 12 }}>{galat}</div> : null}

      {tahap === "hasil" ? (
        <section className="t-panel">
          {pinjam ? (
            <div className="t-ok">
              ✓ <b>{pinjam.judul}</b> dipinjam <b>{pinjam.nama}</b><br />
              Kembali paling lambat <b>{pinjam.jatuh_tempo}</b>. Pinjaman aktif: {pinjam.pinjaman_aktif}/{pinjam.maks_buku}.
            </div>
          ) : kembali ? (
            <div className={kembali.denda_rp > 0 ? "t-err" : "t-ok"}>
              ✓ <b>{kembali.judul}</b> diterima kembali dari <b>{kembali.nama}</b>.<br />
              {kembali.hari_telat > 0 ? <>Terlambat {kembali.hari_telat} hari — denda {rp(kembali.denda_rp)}.<br /></> : "Tepat waktu, tanpa denda.\n"}
              {kembali.denda_rp > 0 ? (
                kembali.denda_status === "lunas"
                  ? <>Denda dipotong dari saldo. Sisa {kembali.saldo_rp !== null ? rp(kembali.saldo_rp) : "—"}.</>
                  : <>Denda menjadi <b>tagihan</b> — dibayar orang tua lewat portal. Buku tetap diterima.</>
              ) : null}
              {kembali.rak ? <><br />Kembalikan ke rak <b>{kembali.rak}</b>.</> : null}
            </div>
          ) : null}
          <button type="button" className="btn pri blok" style={{ marginTop: 12 }} onClick={ulang}>Scan berikutnya</button>
        </section>
      ) : tahap === "pin" ? (
        <section className="t-panel">
          <p className="t-big" style={{ margin: 0, textAlign: "center" }}>
            <b>Siswa masukkan PIN</b> untuk memotong denda dari saldo.
          </p>
          <p className="p-note" style={{ textAlign: "center", margin: "6px 0 0" }}>
            Kalau siswa tidak ingat PIN, tekan batal — bukunya tetap diterima dan
            dendanya jadi tagihan untuk orang tua.
          </p>
          <PinPad sibuk={sibuk} onLengkap={(pin) => void lakukanKembali(pin)}
            onBatal={() => void lakukanKembali()} labelBatal="tanpa PIN" />
        </section>
      ) : (
        <>
          <section className="t-panel">
            <div className="field">
              <label className="f" htmlFor="barcode">Scan barcode buku</label>
              <input id="barcode" autoFocus style={{ width: "100%", fontFamily: "monospace" }} value={barcode}
                onChange={e => setBarcode(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") void lakukanScan((e.target as HTMLInputElement).value); }}
                placeholder="arahkan pemindai, atau ketik lalu Enter" />
            </div>
            <div className="field">
              <label className="f" htmlFor="petugas">Petugas (opsional)</label>
              <input id="petugas" style={{ width: "100%" }} value={petugas} onChange={e => setPetugas(e.target.value)} />
            </div>
            <button type="button" className="btn blok" disabled={sibuk || barcode.trim().length < 2}
              onClick={() => void lakukanScan(barcode)}>{sibuk ? "Memeriksa…" : "Scan"}</button>
          </section>

          {scan ? (
            <section className="t-panel" style={{ marginTop: 12 }}>
              <p className="t-big" style={{ margin: "0 0 4px" }}><b>{scan.judul}</b></p>
              <p className="p-note" style={{ margin: 0 }}>
                {scan.pengarang ?? "—"} · {scan.kategori ?? "—"} · rak {scan.rak ?? "—"} ·
                eksemplar #{scan.nomor} dari {scan.total_eksemplar}
              </p>
              <p style={{ margin: "10px 0 0" }}>
                <span className={`badge ${scan.bisa_dipinjam ? "good" : "warn"}`}>{scan.status}</span>
                {scan.peminjam ? <span className="badge" style={{ marginLeft: 6 }}>dipinjam {scan.peminjam}</span> : null}
              </p>
              {scan.alasan ? <p className="p-note" style={{ margin: "6px 0 0" }}>{scan.alasan}</p> : null}

              {scan.pinjaman_id ? (
                <>
                  <p className="p-note" style={{ margin: "12px 0 6px" }}>
                    Buku selalu diterima kembali. Kalau ada denda, siswa boleh memotongnya dari
                    saldo dengan PIN — kalau tidak, denda jadi tagihan untuk orang tua (F-71).
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn pri" style={{ flex: 1, justifyContent: "center", minHeight: 52 }}
                      disabled={sibuk} onClick={() => void lakukanKembali()}>
                      Kembalikan (tanpa PIN)
                    </button>
                    <button type="button" className="btn" style={{ flex: 1, justifyContent: "center", minHeight: 52 }}
                      disabled={sibuk} onClick={() => setTahap("pin")}>
                      Kembalikan + potong denda
                    </button>
                  </div>
                </>
              ) : scan.bisa_dipinjam ? (
                <>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label className="f" htmlFor="uid">Kartu siswa (UID)</label>
                    <input id="uid" style={{ width: "100%", fontFamily: "monospace" }} value={uid}
                      onChange={e => setUid(e.target.value.toUpperCase())}
                      onKeyDown={e => { if (e.key === "Enter" && uid.trim().length >= 8) void lakukanPinjam(); }}
                      placeholder="tempelkan kartu ke reader" />
                  </div>
                  <button type="button" className="btn pri blok" style={{ minHeight: 52 }}
                    disabled={sibuk || uid.trim().length < 8} onClick={() => void lakukanPinjam()}>
                    {sibuk ? "Memproses…" : "Pinjamkan"}
                  </button>
                </>
              ) : (
                <p className="p-note" style={{ margin: "12px 0 0" }}>Eksemplar ini tidak bisa dipinjam sekarang.</p>
              )}
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
