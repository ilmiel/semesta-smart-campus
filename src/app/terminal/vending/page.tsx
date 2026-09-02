"use client";

import { useState } from "react";
import { rp } from "@/lib/format";

const PRODUK = [
  { slot: "A1", nama: "Air mineral", harga: 4000 },
  { slot: "A2", nama: "Susu kotak", harga: 6000 },
  { slot: "A3", nama: "Roti cokelat", harga: 8000 },
  { slot: "A4", nama: "Yogurt drink", harga: 7000 },
  { slot: "B1", nama: "Isotonik", harga: 7000, habis: true },
  { slot: "B2", nama: "Keripik", harga: 5000 },
];

type Tahap = "pilih" | "tap" | "proses" | "sukses" | "gagal";

export default function MesinVending() {
  const [tahap, setTahap] = useState<Tahap>("pilih");
  const [pilihan, setPilihan] = useState<(typeof PRODUK)[number] | null>(null);
  const [langkah, setLangkah] = useState("");

  const jalan = (sukses: boolean) => {
    setTahap("proses");
    setLangkah("Menahan saldo…");
    setTimeout(() => setLangkah("Motor slot berputar…"), 500);
    setTimeout(() => setLangkah("Menunggu sensor jatuh…"), 1000);
    setTimeout(() => setTahap(sukses ? "sukses" : "gagal"), 1600);
  };

  return (
    <div className="root">
      <div className="t-shell">
        <div className="t-head">
          <span className="id">VEND-01</span> · Gd. Akademik lt. 1 · <span className="on">● Online</span>
          <span style={{ marginLeft: "auto" }}>Jam aktif 06.00–17.00 · Selasa 2 Sep, 09.55</span>
        </div>

        {tahap === "pilih" ? (
          <div className="t-panel">
            <p className="t-big" style={{ margin: "0 0 12px" }}><b>Pilih produk</b> — lalu tap kartu.</p>
            <div className="t-items">
              {PRODUK.map(p => (
                <button key={p.slot} type="button" disabled={p.habis} style={p.habis ? { opacity: 0.45 } : undefined}
                  onClick={() => { setPilihan(p); setTahap("tap"); }}>
                  {p.slot} · {p.nama}<br /><b>{p.habis ? "habis" : rp(p.harga)}</b>
                </button>
              ))}
            </div>
            <p className="p-note" style={{ margin: "12px 0 0" }}>
              Server tidak terjangkau → mesin menolak semua transaksi (F-110). Batas vending: 3 transaksi /
              Rp 20.000 per kartu per hari (F-112).
            </p>
          </div>
        ) : null}

        {tahap === "tap" && pilihan ? (
          <div className="t-panel">
            <div className="t-total" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
              <span className="l">{pilihan.nama}</span><span className="v">{rp(pilihan.harga)}</span>
            </div>
            <p className="t-big" style={{ margin: "12px 0 6px" }}><b>Tap kartu</b> untuk membayar.</p>
            <button type="button" className="tapbtn" onClick={() => jalan(true)}>💳 &nbsp;Simulasi: tap kartu Aisha — barang keluar normal</button>
            <button type="button" className="tapbtn alt" onClick={() => jalan(false)}>💳 Simulasi: tap kartu Aisha — barang NYANGKUT</button>
            <button type="button" className="btn blok" style={{ marginTop: 10 }} onClick={() => setTahap("pilih")}>← Pilih produk lain</button>
          </div>
        ) : null}

        {tahap === "proses" ? (
          <div className="t-panel">
            <p className="t-big" style={{ textAlign: "center", margin: "8px 0" }}>{langkah}</p>
            <p className="p-note" style={{ textAlign: "center", margin: 0 }}>
              Saldo <b>ditahan</b> (pending), belum terpotong — menunggu sensor jatuh mengonfirmasi (F-111).
            </p>
          </div>
        ) : null}

        {tahap === "sukses" && pilihan ? (
          <div className="t-panel">
            <div className="t-ok">
              ✓ <b>{pilihan.nama}</b> keluar — {rp(pilihan.harga)} terpotong dari saldo Aisha
              (sisa {rp(86500 - pilihan.harga)}).
            </div>
            <p className="p-note" style={{ margin: "12px 0 0" }}>
              Transaksi <span className="mono">pending → selesai</span> setelah sensor jatuh mengonfirmasi.
              Muncul di riwayat portal seperti belanja kantin.
            </p>
            <button type="button" className="btn blok" style={{ marginTop: 12 }} onClick={() => setTahap("pilih")}>Beli lagi</button>
          </div>
        ) : null}

        {tahap === "gagal" && pilihan ? (
          <div className="t-panel">
            <div className="t-err">
              ✕ Sensor tidak mendeteksi barang jatuh.<br /><br />
              Transaksi <b>dibatalkan otomatis</b> — saldo Aisha <b>tidak terpotong</b> (tetap Rp 86.500).<br />
              Slot {pilihan.slot} dinonaktifkan &amp; IT diberi tahu. Silakan pilih produk lain.
            </div>
            <p className="p-note" style={{ margin: "12px 0 0" }}>
              Uang tidak pernah terpotong tanpa barang (F-111). Kalau siswa merasa tetap terpotong, ada
              tombol lapor di portal (F-116) — dicocokkan dengan log sensor.
            </p>
            <button type="button" className="btn blok" style={{ marginTop: 12 }} onClick={() => setTahap("pilih")}>Pilih produk lain</button>
          </div>
        ) : null}

        <p className="p-note" style={{ marginTop: 16, textAlign: "center" }}>
          Di produksi ini controller mesin + reader, tanpa layar sentuh besar: pilih lewat keypad angka
          mesin, status lewat layar kecil 2 baris.
        </p>
      </div>
    </div>
  );
}
