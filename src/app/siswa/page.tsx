"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { TautanContoh } from "@/components/Mock";
import PinBanner from "@/components/PinBanner";
import { rp } from "@/lib/format";

const HARGA_PO = { paket: 15000, susu: 6000 } as const;

export default function PortalSiswa() {
  const toast = useToast();
  const [hilangSiap, setHilangSiap] = useState(false);
  const [kartuDiblokir, setKartuDiblokir] = useState(false);
  const [qty, setQty] = useState({ paket: 1, susu: 0 });
  const [poAktif, setPoAktif] = useState<null | { isi: string; total: number }>(null);

  const totalPo = qty.paket * HARGA_PO.paket + qty.susu * HARGA_PO.susu;

  const laporHilang = () => {
    if (!hilangSiap) {
      setHilangSiap(true);
      setTimeout(() => setHilangSiap(false), 4000);
      return;
    }
    setKartuDiblokir(true);
    toast("Kartu diblokir sementara — TU dan orang tuamu diberi tahu");
  };

  return (
    <div className="root portal">
      <div className="p-top">
        <div className="inner">
          <div className="bar">
            <div className="logo">S</div>
            <div className="t"><b>Smart Campus</b><small>Rafif Gamma W. · 7.A · rafif.26@semesta.sch.id</small></div>
          </div>
        </div>
      </div>

      <div className="p-wrap">
        {/* Satu-satunya bagian halaman ini yang sungguhan. Sisanya masih
            contoh (Fase 1.3) dan berlabel demikian. */}
        <PinBanner />

        {/* Data di bawah ini masih CONTOH (Fase 1.3), ditandai terang-terangan:
            halaman ini kini di balik penjaga login, jadi yang membacanya adalah
            siswa sungguhan — dan angka saldo karangan tanpa label akan
            dipercaya. */}
        <div className="demo">Saldo, riwayat, dan pesanan di halaman ini masih data contoh — belum tersambung ke datamu yang sebenarnya.</div>

        <div className="saldo-card">
          <div className="l">Saldo kamu</div>
          <div className="v">Rp 200.000</div>
          <div className="u">Limit harian Rp 50.000 · sisa hari ini Rp 50.000</div>
          <div className="acts">
            <Link href="/siswa/pin" className="btn">Ganti PIN</Link>
            <button type="button" className="btn danger" disabled={kartuDiblokir} onClick={laporHilang}>
              {kartuDiblokir ? "Kartu diblokir ✓" : hilangSiap ? "Yakin? Blokir kartu sekarang" : "Kartuku hilang"}
            </button>
          </div>
        </div>

        {kartuDiblokir ? (
          <div className="pcard">
            <div className="stat-hilang">
              ⚠ Kartu kamu <b>diblokir sementara</b> (lapor hilang). Kalau ketemu, bawa ke TU untuk
              diaktifkan lagi. Kalau tidak, TU akan menerbitkan kartu baru — saldo kamu aman.
            </div>
          </div>
        ) : null}

        <div className="pcard">
          <div className="hd2"><h2>Pra-pesan kantin</h2><span className="badge good">buka · tutup 10.30</span></div>
          {!poAktif ? (
            <div>
              {([
                { k: "paket" as const, nama: "Paket ayam + teh", harga: HARGA_PO.paket },
                { k: "susu" as const, nama: "Susu kotak", harga: HARGA_PO.susu },
              ]).map(item => (
                <div className="txr" key={item.k}>
                  <button type="button" className="qbtn" style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid var(--rule)", background: "var(--surface)", cursor: "pointer", fontWeight: 700 }}
                    onClick={() => setQty(q => ({ ...q, [item.k]: Math.max(0, q[item.k] - 1) }))}>−</button>
                  <span className="mono">{qty[item.k]}</span>
                  <button type="button" className="qbtn" style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid var(--rule)", background: "var(--surface)", cursor: "pointer", fontWeight: 700 }}
                    onClick={() => setQty(q => ({ ...q, [item.k]: Math.min(5, q[item.k] + 1) }))}>+</button>
                  <div className="tt" style={{ flex: 1 }}><b>{item.nama}</b><small>{rp(item.harga)}</small></div>
                </div>
              ))}
              <button type="button" className="btn pri blok" style={{ marginTop: 12 }} disabled={totalPo === 0}
                onClick={() => {
                  const isi = [
                    qty.paket ? `Paket ayam + teh ×${qty.paket}` : "",
                    qty.susu ? `Susu kotak ×${qty.susu}` : "",
                  ].filter(Boolean).join(" · ");
                  setPoAktif({ isi, total: totalPo });
                  toast("Pesanan dikirim ke kantin — saldo terpotong, muncul di riwayat");
                }}>
                Pesan &amp; bayar dari saldo — {rp(totalPo)}
              </button>
              <p className="p-note" style={{ margin: "10px 0 0" }}>
                Ambil 11.30–13.30 di kasir dengan tap kartu — lewat jalur PO, tanpa antri kasir. Kartumu
                diblokir? Tunjukkan kode PO ke kasir. Batal sebelum 10.30 → dana kembali otomatis.
              </p>
            </div>
          ) : (
            <div>
              <div className="stat-hilang" style={{ borderColor: "var(--good)", background: "var(--good-soft)", color: "var(--good-text)" }}>
                ✓ <b>PO-108</b> — {poAktif.isi}<br />{rp(poAktif.total)} terpotong dari saldo · status: diterima kantin
              </div>
              <button type="button" className="btn blok" style={{ marginTop: 10 }}
                onClick={() => { setPoAktif(null); toast("PO dibatalkan — dana kembali otomatis (sebelum jam tutup PO)"); }}>
                Batalkan — dana kembali otomatis
              </button>
            </div>
          )}
        </div>

        <div className="pcard">
          <div className="hd2"><h2>Buku pinjamanmu</h2><TautanContoh>Riwayat bacaan →</TautanContoh></div>
          <div className="txr"><div className="ic r">📗</div>
            <div className="tt"><b>Bumi — Tere Liye</b><small style={{ color: "var(--crit-text)", fontWeight: 600 }}>telat 3 hari · denda berjalan Rp 3.000 — kembalikan hari ini</small></div></div>
          <div className="txr"><div className="ic b">📘</div>
            <div className="tt"><b>Wonder — R.J. Palacio</b><small>jatuh tempo 5 Sep</small></div>
            <span className="amt"><TautanContoh>Perpanjang</TautanContoh></span></div>
          <p className="p-note" style={{ margin: "10px 0 0" }}>
            2 dari 3 pinjaman (batas SMP). Perpanjang 1× kalau tidak ada antrean. Denda Rp 1.000/hari,
            dipotong dari saldo saat buku dikembalikan.
          </p>
        </div>

        <div className="pcard">
          <div className="hd2"><h2>Loker kamu</h2></div>
          <div className="txr"><div className="ic b">▦</div>
            <div className="tt"><b>A-117 · Asrama Putra, lantai 1</b><small>buka terakhir hari ini 06.31 · TA 2026/2027</small></div>
            <span className="amt"><TautanContoh>Lapor masalah</TautanContoh></span></div>
          <p className="p-note" style={{ margin: "10px 0 0" }}>
            Buka cukup tap kartu, tanpa PIN. Kartu diblokir = loker ikut tidak bisa dibuka sampai kartu baru
            terbit; kalau butuh barang mendesak, hubungi pembina (buka darurat tercatat).
          </p>
        </div>

        <div className="pcard">
          <div className="hd2"><h2>Laundry kamu</h2></div>
          <div className="txr"><div className="ic b">👕</div>
            <div className="tt"><b>LDY-0912 · 3,5 kg</b><small>masuk 30 Agu · <span style={{ color: "var(--good-text)", fontWeight: 600 }}>siap diambil</span> — rak B-14</small></div>
            <div className="amt">Rp 24.500</div></div>
          <p className="p-note" style={{ margin: "10px 0 0" }}>
            Bayar pakai kartu + PIN saat ambil. Jadwal setor Asrama Putra: Senin · Rabu · Jumat 16.00–18.00.
            Lebih dari 7 hari tidak diambil → pembina asrama diberi tahu.
          </p>
        </div>

        <div className="pcard">
          <div className="hd2"><h2>Riwayat kamu</h2></div>
          <div className="tx-day">Hari ini</div>
          <div className="txr"><div className="ic t">↧</div><div className="tt"><b>Isi saldo dari orang tua</b><small>12.41</small></div><div className="amt plus">+200.000</div></div>
          <div className="tx-day">Kemarin</div>
          <div className="txr"><div className="ic b">▤</div><div className="tt"><b>Nasi ayam + teh</b><small>12.10 · Kantin</small></div><div className="amt">−15.000</div></div>
          <div className="txr"><div className="ic b">▤</div><div className="tt"><b>Roti + susu</b><small>09.35 · Kantin</small></div><div className="amt">−8.000</div></div>
          <div className="txr"><div className="ic b">⛁</div>
            <div className="tt"><b>Vending — Air mineral</b><small>15.20 · Gd. Akademik · <TautanContoh>barang tidak keluar? lapor</TautanContoh></small></div>
            <div className="amt">−4.000</div></div>
          <p className="p-note" style={{ margin: "10px 0 0" }}>Kamu hanya bisa melihat data kamu sendiri (F-103).</p>
        </div>
      </div>
    </div>
  );
}
