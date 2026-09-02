"use client";

import { useState } from "react";
import PinPad from "@/components/PinPad";
import { useToast } from "@/components/Toast";
import { rp } from "@/lib/format";

const SATUAN = [
  { k: "seragam", label: "Seragam · 6rb", harga: 6000 },
  { k: "jas", label: "Jas · 15rb", harga: 15000 },
  { k: "sepatu", label: "Sepatu · 20rb", harga: 20000 },
  { k: "bedcover", label: "Bed cover · 25rb", harga: 25000 },
];

export default function TerminalLaundry() {
  const toast = useToast();
  const [tab, setTab] = useState<"terima" | "ambil">("terima");

  // Terima cucian
  const [tahapTerima, setTahapTerima] = useState<"tap" | "form" | "selesai">("tap");
  const [kg, setKg] = useState(3);
  const [item, setItem] = useState<Record<string, boolean>>({});
  const [express, setExpress] = useState(false);

  // Ambil & bayar
  const [tahapAmbil, setTahapAmbil] = useState<"daftar" | "tap" | "bayar" | "selesai">("daftar");
  const [salahKartu, setSalahKartu] = useState(false);
  const [pesanSelesai, setPesanSelesai] = useState("");

  let totalTerima = Math.max(kg, 2) * 7000 + SATUAN.filter(s => item[s.k]).reduce((a, s) => a + s.harga, 0);
  if (express) totalTerima = Math.round((totalTerima * 1.5) / 500) * 500;

  const gantiKg = (d: number) => setKg(v => {
    const n = Math.min(6, Math.max(2, v + d));
    if (n >= 6) toast("Maksimal 6 kg per order — lebih dari itu dipecah jadi 2 order");
    return n;
  });

  const bayarSelesai = () => {
    setPesanSelesai("✓ Lunas — Rp 24.500 dipotong dari saldo Rafif (sisa Rp 175.500). Serahkan cucian dari rak B-14.");
    setTahapAmbil("selesai");
  };

  return (
    <div className="root">
      <div className="t-shell">
        <div className="t-head">
          <span className="id">LNDRY-01</span> · Asrama Putra · <span className="on">● Online</span>
          <span style={{ marginLeft: "auto" }}>Petugas: Pak Slamet · Senin 1 Sep, 16.12</span>
        </div>
        <div className="t-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "terima"} className={tab === "terima" ? "on" : undefined} onClick={() => setTab("terima")}>📥 Terima cucian</button>
          <button type="button" role="tab" aria-selected={tab === "ambil"} className={tab === "ambil" ? "on" : undefined} onClick={() => setTab("ambil")}>📤 Ambil &amp; bayar</button>
        </div>

        {tab === "terima" ? (
          tahapTerima === "tap" ? (
            <div className="t-panel">
              <p className="t-big" style={{ margin: "0 0 14px" }}><b>Langkah 1.</b> Tap kartu siswa di reader.</p>
              <button type="button" className="tapbtn" onClick={() => setTahapTerima("form")}>💳 &nbsp;Simulasi: tap kartu Keenan</button>
              <p className="p-note" style={{ margin: "12px 0 0" }}>
                Di terminal asli: reader USB mode keyboard mengetik UID otomatis. Terima cucian{" "}
                <b>tetap bisa saat offline</b> — belum ada uang berpindah (F-50).
              </p>
            </div>
          ) : tahapTerima === "form" ? (
            <div className="t-panel">
              <div className="t-siswa">
                <div className="foto">KA</div>
                <div><b>Keenan Alvaro</b><small>8.B · Asrama Putra · jadwal setor: hari ini ✓</small></div>
                <span className="badge good" style={{ marginLeft: "auto" }}>kartu aktif</span>
              </div>
              <p className="t-big" style={{ margin: "0 0 8px" }}><b>Langkah 2.</b> Timbang &amp; catat isi.</p>
              <label className="f" style={{ fontSize: 13 }}>Kiloan — dibulatkan naik ke 0,5 kg (maks 6 kg/order)</label>
              <div className="stepper">
                <button type="button" onClick={() => gantiKg(-0.5)} aria-label="Kurangi berat">−</button>
                <div className="vv">{kg.toLocaleString("id-ID", { minimumFractionDigits: 1 })} kg</div>
                <button type="button" onClick={() => gantiKg(0.5)} aria-label="Tambah berat">+</button>
              </div>
              <label className="f" style={{ fontSize: 13, marginTop: 16 }}>Satuan (ketuk untuk tambah)</label>
              <div className="t-items">
                {SATUAN.map(s => (
                  <button key={s.k} type="button" className={item[s.k] ? "on" : undefined}
                    onClick={() => setItem(v => ({ ...v, [s.k]: !v[s.k] }))}>{s.label}</button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
                <label className="switch"><input type="checkbox" checked={express} onChange={e => setExpress(e.target.checked)} /><i /></label>
                <div><b>Express</b> — selesai besok, +50% <span className="p-note">(sisa kuota hari ini: 3)</span></div>
              </div>
              <div className="t-total"><span className="l">Estimasi tagihan (bayar saat ambil)</span><span className="v">{rp(totalTerima)}</span></div>
              <button type="button" className="btn pri blok" style={{ marginTop: 14, minHeight: 56, fontSize: 16 }}
                onClick={() => setTahapTerima("selesai")}>Terima &amp; cetak tiket</button>
            </div>
          ) : (
            <div className="t-panel">
              <div className="t-ok">
                ✓ Order <span className="mono">LDY-0922</span> diterima — tiket tercetak 2 rangkap (1 ditempel
                di kantong cucian, 1 untuk siswa).
              </div>
              <p className="p-note" style={{ margin: "12px 0 0" }}>
                Tagihan otomatis muncul di portal siswa &amp; ortu. Notifikasi &quot;siap diambil&quot; terkirim
                begitu status diubah petugas.
              </p>
              <button type="button" className="btn blok" style={{ marginTop: 12 }}
                onClick={() => { setTahapTerima("tap"); setKg(3); setItem({}); setExpress(false); }}>
                Terima order berikutnya
              </button>
            </div>
          )
        ) : (
          tahapAmbil === "daftar" ? (
            <div className="t-panel t-orders">
              <p className="t-big" style={{ margin: "0 0 10px" }}><b>Langkah 1.</b> Pilih order yang mau diambil.</p>
              <div className="att">
                <span className="badge good">B-14</span>
                <div className="tx"><b>LDY-0912 · Rafif G. Wisanggeni</b> (7.A)<div className="d">3,5 kg kiloan · masuk 30 Agu · Rp 24.500</div></div>
                <button type="button" className="btn pri pilih" onClick={() => setTahapAmbil("tap")}>Pilih</button>
              </div>
              <div className="att">
                <span className="badge good">B-09</span>
                <div className="tx"><b>LDY-0907 · Alfian Pratama</b> (10.A)<div className="d">2,5 kg + sepatu · masuk 29 Agu · Rp 37.500</div></div>
                <button type="button" className="btn pri pilih" onClick={() => toast("Demo memakai order LDY-0912 — pilih yang atas")}>Pilih</button>
              </div>
            </div>
          ) : tahapAmbil === "tap" ? (
            <div className="t-panel">
              <p className="t-big" style={{ margin: "0 0 6px" }}><b>Langkah 2.</b> Tap kartu siswa — harus kartu <b>pemilik order</b>.</p>
              <p className="p-note" style={{ margin: "0 0 12px" }}>Order LDY-0912 milik Rafif G. Wisanggeni · Rp 24.500</p>
              <button type="button" className="tapbtn" onClick={() => { setSalahKartu(false); setTahapAmbil("bayar"); }}>💳 &nbsp;Simulasi: tap kartu Rafif (pemilik)</button>
              <button type="button" className="tapbtn alt" onClick={() => setSalahKartu(true)}>💳 Simulasi: tap kartu Aisha — bukan pemilik</button>
              {salahKartu ? (
                <div className="t-err" style={{ marginTop: 12 }}>
                  ✕ Kartu milik <b>Aishabilla Piliang</b> — bukan pemilik order LDY-0912. Pengambilan ditolak
                  dan tercatat. Titip-ambil hanya lewat pembina asrama.
                </div>
              ) : null}
            </div>
          ) : tahapAmbil === "bayar" ? (
            <div className="t-panel">
              <div className="t-siswa">
                <div className="foto">RW</div>
                <div><b>Rafif Gamma Wisanggeni</b><small>7.A · saldo Rp 200.000 · LDY-0912 · rak B-14</small></div>
                <span className="badge good" style={{ marginLeft: "auto" }}>pemilik ✓</span>
              </div>
              <div className="t-total" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}><span className="l">Tagihan</span><span className="v">Rp 24.500</span></div>
              <p className="t-big" style={{ margin: "14px 0 0", textAlign: "center" }}><b>Langkah 3.</b> Siswa memasukkan PIN.</p>
              <PinPad onLengkap={bayarSelesai} onBatal={() => { setTahapAmbil("daftar"); setSalahKartu(false); }} />
              <p className="p-note" style={{ textAlign: "center", margin: "12px 0 0" }}>
                Semua pembayaran laundry wajib PIN (F-31) — PIN dicek di server, jadi pembayaran hanya bisa
                saat online (F-33). Salah 5× = terkunci 30 menit.
              </p>
            </div>
          ) : (
            <div className="t-panel">
              <div className="t-ok">{pesanSelesai}</div>
              <p className="p-note" style={{ margin: "12px 0 0" }}>
                Struk digital masuk ke portal siswa &amp; ortu. Transaksi memakai idempotency key — kirim ulang
                karena koneksi putus tidak memotong dua kali (F-14).
              </p>
              <button type="button" className="btn blok" style={{ marginTop: 12 }}
                onClick={() => { setTahapAmbil("daftar"); setSalahKartu(false); }}>Kembali ke daftar order</button>
            </div>
          )
        )}

        <p className="p-note" style={{ marginTop: 16, textAlign: "center" }}>
          Terminal PWA layar sentuh — target sentuh ≥ 48 px, jalan di mini-PC/Chromebook + reader USB.
        </p>
      </div>
    </div>
  );
}
