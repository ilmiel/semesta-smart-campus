import type { Metadata } from "next";
import { Att, Badge, CatatanKaki, Demo, Panel, Tile } from "@/components/ui";
import { AksiContoh, TautanContoh } from "@/components/Mock";
import Planogram from "./bagian";

export const metadata: Metadata = { title: "Vending" };

export default function HalamanVending() {
  return (
    <>
      <div className="top">
        <div>
          <h1>Vending</h1>
          <div className="sub">Mesin tanpa penjaga — aturan paling ketat justru karena tidak ada yang mengawasi (F-110 – F-116)</div>
        </div>
        <div className="right">
          <AksiContoh>Riwayat restock</AksiContoh>
          <AksiContoh kelas="btn pri">Catat restock</AksiContoh>
        </div>
      </div>
      <Demo />

      <div className="kpis">
        <Tile label="Penjualan hari ini" value="Rp 312.000" sub="58 transaksi · 2 mesin" />
        <Tile label="Mesin" value={<>2 / 2 <span style={{ fontSize: 15, color: "var(--good-text)" }}>online</span></>}
          sub="VEND-02 tidur otomatis 22.00–05.00 (F-113)" />
        <Tile label="Slot menipis / habis" value="5" valueStyle={{ color: "var(--warn-text)" }} sub="restock terjadwal Kamis" />
        <Tile label="Gagal keluar hari ini" value="1"
          sub={<span style={{ color: "var(--good-text)" }}>✓ refund otomatis &lt; 10 dtk · slot ditandai</span>} />
      </div>

      <div className="row">
        <Planogram />
        <Panel judul="Kebijakan mesin" aksi={<AksiContoh kelas="btn sm">Ubah</AksiContoh>}>
          <dl className="kv">
            <dt>PIN</dt><dd>Tidak dipakai — semua harga di bawah ambang PIN</dd>
            <dt>Offline</dt><dd><b>Ditolak</b> (limit offline = 0) — mesin tanpa penjaga tidak menebak saldo (F-110)</dd>
            <dt>Batas per kartu</dt><dd>3 transaksi / Rp 20.000 per hari khusus vending (F-112)</dd>
            <dt>Jam aktif</dt><dd>VEND-01: 06.00–17.00 · VEND-02: 05.00–22.00</dd>
            <dt>Produk</dt><dd>Daftar disetujui kesiswaan — kebijakan makanan sehat (F-115)</dd>
          </dl>
          <CatatanKaki>
            Batas per kartu adalah pagar untuk kartu yang ditemukan orang — di kasir ada mata kasir, di
            mesin tidak ada siapa-siapa.
          </CatatanKaki>
          <div style={{ borderTop: "1px solid var(--rule)", marginTop: 12, paddingTop: 12 }}>
            <div className="hd"><h2>Terlaris minggu ini</h2></div>
            <div className="tw">
              <table><tbody>
                <tr><td>Air mineral 600 ml</td><td className="num">204×</td></tr>
                <tr><td>Susu kotak</td><td className="num">156×</td></tr>
                <tr><td>Roti cokelat</td><td className="num">98×</td></tr>
                <tr><td>Isotonik</td><td className="num">74×</td></tr>
              </tbody></table>
            </div>
          </div>
        </Panel>
      </div>

      <div className="row2">
        <Panel judul="Perlu perhatian">
          <Att badge="✕ Slot" warna="crit" aksi={<TautanContoh>Jadwalkan cek</TautanContoh>}>
            <b>VEND-02 slot B4 — sensor tidak mendeteksi jatuh</b>
            <div className="d">Kejadian 09.12 · transaksi dibatalkan otomatis, saldo siswa kembali · slot dinonaktifkan sampai dicek fisik</div>
          </Att>
          <Att badge="⚠ Stok" warna="warn" aksi={<TautanContoh>Cetak daftar restock</TautanContoh>}>
            <b>5 slot menipis/habis</b>
            <div className="d">VEND-01: Isotonik habis, Roti cokelat sisa 3 · VEND-02: Susu cokelat sisa 2, Buah cup sisa 4</div>
          </Att>
          <Att badge="▤ Batas" warna="info" aksi={<TautanContoh>Lihat pola</TautanContoh>}>
            <b>2 kartu menyentuh batas harian vending</b>
            <div className="d">Wajar di hari panas (air mineral) — pola berulang tiap hari baru layak dilihat kesiswaan</div>
          </Att>
        </Panel>

        <Panel judul="Kejadian & restock terakhir" aksi={<TautanContoh>Semua →</TautanContoh>}>
          <div className="tw">
            <table>
              <thead><tr><th>Waktu</th><th>Mesin</th><th>Kejadian</th><th>Hasil</th></tr></thead>
              <tbody>
                <tr><td className="mono">09.12</td><td className="mono">VEND-02</td><td>Gagal keluar — slot B4, siswa Damar A. (7.B)</td><td><Badge warna="good">↩ refund otomatis Rp 5.000</Badge></td></tr>
                <tr><td className="mono">07.02</td><td className="mono">VEND-01</td><td>Restock 6 slot oleh Bu Tini (petugas kantin)</td><td><Badge warna="good">✓ selisih 0</Badge></td></tr>
                <tr><td className="mono">Kemarin 22.00</td><td className="mono">VEND-02</td><td>Tidur otomatis (jam malam asrama)</td><td><Badge warna="mute">terjadwal</Badge></td></tr>
                <tr><td className="mono">Kemarin 15.41</td><td className="mono">VEND-01</td><td>Laporan siswa: &quot;dana terpotong, barang tidak keluar&quot;</td><td><Badge warna="warn">dicek log sensor → transaksi sudah batal</Badge></td></tr>
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Laporan siswa (F-116) selalu dicocokkan dengan log sensor per transaksi — yang benar terpotong
            di-refund keuangan, yang sudah batal otomatis dijawab dengan bukti log. Adil dua arah.
          </CatatanKaki>
        </Panel>
      </div>
    </>
  );
}
