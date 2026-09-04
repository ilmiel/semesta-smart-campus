"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { AksiContoh, TautanContoh } from "@/components/Mock";
import { rp } from "@/lib/format";

const ANAK = {
  rafif: { nama: "Rafif", saldo: 200000, pakai: 0, bar: 0, kartuHilang: true },
  aisha: { nama: "Aisha", saldo: 86500, pakai: 15000, bar: 30, kartuHilang: false },
} as const;
type KunciAnak = keyof typeof ANAK;

const NOMINAL_TOPUP = [50000, 100000, 200000, 300000, 500000];

export default function PortalOrtu() {
  const toast = useToast();
  const [anak, setAnak] = useState<KunciAnak>("rafif");
  const [sheet, setSheet] = useState<"topup" | "limit" | null>(null);
  const [nominal, setNominal] = useState(100000);
  const [poAktif, setPoAktif] = useState(false);
  const d = ANAK[anak];

  return (
    <div className="root portal">
      <div className="p-top">
        <div className="inner">
          <div className="bar">
            <div className="logo">S</div>
            <div className="t"><b>Smart Campus</b><small>Portal Orang Tua · Ibu Ratna</small></div>
            <span className="bell" title="Notifikasi" role="button" tabIndex={0}
              onClick={() => toast("Notifikasi contoh")}>🔔<span className="n">1</span></span>
          </div>
          <div className="anak" role="tablist" aria-label="Pilih anak">
            {(Object.keys(ANAK) as KunciAnak[]).map(k => (
              <button key={k} type="button" role="tab" aria-selected={anak === k}
                className={anak === k ? "on" : undefined} onClick={() => setAnak(k)}>
                {ANAK[k].nama} · 7.A
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-wrap">
        {/* Data di bawah ini masih CONTOH (Fase 1.3), ditandai terang-terangan:
            halaman ini kini di balik penjaga login, jadi yang membacanya adalah
            orang tua sungguhan — dan angka saldo karangan tanpa label akan
            dipercaya. */}
        <div className="demo">Saldo, riwayat, dan tagihan di halaman ini masih data contoh — belum tersambung ke data anak Anda yang sebenarnya.</div>

        {d.kartuHilang ? (
          <div className="stat-hilang" style={{ marginBottom: 14 }}>
            ⚠ Kartu {d.nama} <b>diblokir</b> — dilaporkan hilang tadi pagi lewat portal siswa. Kartu baru
            diterbitkan TU hari ini. Saldo aman, tidak berubah.
          </div>
        ) : null}

        <div className="saldo-card">
          <div className="l">Saldo {d.nama}</div>
          <div className="v">{rp(d.saldo)}</div>
          <div className="u">Limit harian Rp 50.000 · dipakai hari ini <b>{rp(d.pakai)}</b></div>
          <div className="limitbar" aria-hidden="true"><i style={{ width: `${d.bar}%` }} /></div>
          <div className="acts">
            <button type="button" className="btn pri" onClick={() => setSheet(s => s === "topup" ? null : "topup")}>+ Isi saldo</button>
            <button type="button" className="btn" onClick={() => setSheet(s => s === "limit" ? null : "limit")}>Atur limit</button>
          </div>
        </div>

        {sheet === "topup" ? (
          <div className="pcard">
            <h2>Isi saldo {d.nama}</h2>
            <div className="nom-grid">
              {NOMINAL_TOPUP.map(n => (
                <button key={n} type="button" className={nominal === n ? "on" : undefined}
                  onClick={() => setNominal(n)}>{n.toLocaleString("id-ID")}</button>
              ))}
              <AksiContoh kelas="">Lainnya…</AksiContoh>
            </div>
            <button type="button" className="btn pri blok"
              onClick={() => toast("Di aplikasi asli: membuka halaman pembayaran mayar.id")}>
              Bayar {rp(nominal)} via mayar.id →
            </button>
            <p className="p-note" style={{ marginTop: 10 }}>
              Kamu akan diarahkan ke halaman pembayaran mayar.id (QRIS, VA bank, e-wallet). Saldo masuk
              otomatis setelah pembayaran — biasanya kurang dari 1 menit. Min Rp 20.000, maks Rp 500.000 per transaksi.
            </p>
          </div>
        ) : null}

        {sheet === "limit" ? (
          <div className="pcard">
            <h2>Limit belanja harian {d.nama}</h2>
            <div className="nom-grid">
              <button type="button">30.000</button>
              <button type="button" className="on">50.000 <small>(saat ini)</small></button>
              <button type="button" disabled title="Maksimal plafon sekolah">75.000 ✕</button>
            </div>
            <p className="p-note">
              Limit bisa diturunkan di bawah default sekolah (Rp 50.000), tidak bisa dinaikkan melebihinya.
              Kalau dua wali mengatur berbeda, yang terendah yang berlaku.
            </p>
            <AksiContoh kelas="btn pri blok" gaya={{ marginTop: 8 }}>Simpan limit</AksiContoh>
          </div>
        ) : null}

        <div className="pcard">
          <div className="hd2"><h2>Pra-pesan kantin</h2><span className="badge good">buka · tutup 10.30</span></div>
          {!poAktif ? (
            <div>
              <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
                {d.nama} belum pesan makan siang hari ini. Kamu bisa memesankan — dibayar dari saldonya.
              </p>
              <button type="button" className="btn pri blok"
                onClick={() => { setPoAktif(true); toast(`Dipesankan — Rp 15.000 terpotong dari saldo ${d.nama}`); }}>
                Pesankan Paket ayam + teh — Rp 15.000
              </button>
            </div>
          ) : (
            <div>
              <div className="txr">
                <div className="ic b">🍱</div>
                <div className="tt"><b>PO-109 · Paket ayam + teh ×1</b><small>dipesankan olehmu · diterima kantin · ambil 11.30–13.30</small></div>
                <div className="amt">−15.000</div>
              </div>
              <button type="button" className="btn blok" style={{ marginTop: 10 }}
                onClick={() => { setPoAktif(false); toast("PO dibatalkan — dana kembali otomatis"); }}>
                Batalkan — dana kembali otomatis
              </button>
            </div>
          )}
          <p className="p-note" style={{ margin: "10px 0 0" }}>
            Siswa dan ortu sama-sama bisa memesan; portal menandai kalau sudah ada pesanan aktif supaya tidak dobel.
          </p>
        </div>

        <div className="pcard">
          <div className="hd2"><h2>Bacaan {d.nama}</h2></div>
          <div className="txr"><div className="ic r">📗</div>
            <div className="tt"><b>Bumi — Tere Liye</b><small style={{ color: "var(--crit-text)" }}>telat 3 hari · denda berjalan Rp 3.000</small></div></div>
          <div className="txr"><div className="ic b">📘</div>
            <div className="tt"><b>Wonder — R.J. Palacio</b><small>jatuh tempo 5 Sep</small></div></div>
          <p className="p-note" style={{ margin: "10px 0 0" }}>
            11 buku selesai dibaca semester ini — di atas rata-rata kelasnya. Denda telat dipotong dari
            saldo saat buku dikembalikan.
          </p>
        </div>

        <div className="pcard">
          <div className="hd2"><h2>Laundry berjalan</h2></div>
          <div className="txr"><div className="ic b">👕</div>
            <div className="tt"><b>LDY-0912 · 3,5 kg</b><small>siap diambil sejak kemarin · dibayar {d.nama} saat ambil (kartu + PIN)</small></div>
            <div className="amt">Rp 24.500</div></div>
          <p className="p-note" style={{ margin: "8px 0 0" }}>Pastikan saldonya cukup — kalau kurang, kamu dapat notifikasi minta top-up.</p>
        </div>

        <div className="pcard">
          <div className="hd2"><h2>Riwayat {d.nama}</h2><TautanContoh>Semua →</TautanContoh></div>
          <div className="tx-day">Hari ini · 1 Sep</div>
          <div className="txr"><div className="ic t">↧</div><div className="tt"><b>Isi saldo via mayar.id</b><small>12.41 · INV-001</small></div><div className="amt plus">+200.000</div></div>
          <div className="tx-day">Kemarin · 31 Agu</div>
          <div className="txr"><div className="ic b">▤</div><div className="tt"><b>Nasi ayam + teh</b><small>12.10 · Kantin Utama</small></div><div className="amt">−15.000</div></div>
          <div className="txr"><div className="ic b">▤</div><div className="tt"><b>Roti + susu</b><small>09.35 · Kantin Utama</small></div><div className="amt">−8.000</div></div>
          <div className="txr"><div className="ic b">⛁</div><div className="tt"><b>Vending — Air mineral</b><small>15.20 · Gd. Akademik</small></div><div className="amt">−4.000</div></div>
          <div className="tx-day">Sabtu · 30 Agu</div>
          <div className="txr"><div className="ic b">👕</div><div className="tt"><b>Laundry 2,5 kg — lunas</b><small>16.40 · LDY-0863 · Asrama Putra</small></div><div className="amt">−17.500</div></div>
          <div className="txr"><div className="ic r">↩</div><div className="tt"><b>Refund: pesanan dibatalkan</b><small>12.14 · disetujui keuangan</small></div><div className="amt plus">+15.000</div></div>
          <p className="p-note" style={{ margin: "10px 0 0" }}>Yang tampil nama menunya, bukan cuma angka — supaya jelas uangnya jadi apa (F-101).</p>
        </div>

        <div className="pcard">
          <div className="hd2"><h2>Laporan bulanan</h2></div>
          <div className="txr"><div className="ic b">⎙</div><div className="tt"><b>Agustus 2026</b><small>PDF berkop sekolah · ID + EN</small></div><span className="amt"><TautanContoh>Unduh</TautanContoh></span></div>
          <div className="txr"><div className="ic b">⎙</div><div className="tt"><b>Juli 2026</b><small>PDF berkop sekolah</small></div><span className="amt"><TautanContoh>Unduh</TautanContoh></span></div>
        </div>

        <p className="p-note" style={{ textAlign: "center" }}>
          Semesta Bilingual Boarding School · butuh bantuan? <TautanContoh>Hubungi TU</TautanContoh>
        </p>
      </div>
    </div>
  );
}
