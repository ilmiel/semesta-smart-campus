import type { Metadata } from "next";
import Link from "next/link";
import { CatatanKaki, Demo, Panel, Tile } from "@/components/ui";
import { AksiContoh } from "@/components/Mock";
import { TERLARIS_KANTIN } from "@/lib/data";
import { ribuan } from "@/lib/format";
import { GridMenu, PengaturanPO } from "./bagian";

export const metadata: Metadata = { title: "Kantin" };

export default function HalamanKantin() {
  return (
    <>
      <div className="top">
        <div>
          <h1>Kantin</h1>
          <div className="sub">Menu, harga, PO, dan rekap harian · kasir tidak bisa mengubah harga (F-41)</div>
        </div>
        <div className="right">
          <AksiContoh>Rekap bulanan</AksiContoh>
          <AksiContoh kelas="btn pri">+ Tambah menu</AksiContoh>
        </div>
      </div>
      <Demo />

      <div className="kpis">
        <Tile label="Omzet hari ini" value="Rp 4.836.000" sub="409 belanja · rata-rata Rp 11.800" />
        <Tile label="Menu terlaris" value={<span style={{ fontSize: 19 }}>Nasi ayam geprek</span>} sub="86 porsi sejak pagi" />
        <Tile label="Pembatalan kasir" value="0" sub="batas: 5 menit, transaksi terakhir saja (F-45)" />
        <Tile label="Settlement Agustus" value="Rp 96.412.000"
          sub={<>disetujui keuangan 1 Sep · <Link href="/admin/keuangan">lihat →</Link></>} />
      </div>

      <PengaturanPO />

      <div className="row">
        <Panel judul="Menu aktif" sub="tampil di terminal kasir"
          aksi={
            <select aria-label="Filter kategori" defaultValue="Semua kategori">
              {["Semua kategori", "Makanan berat", "Jajanan", "Minuman"].map(k => <option key={k}>{k}</option>)}
            </select>
          }>
          <GridMenu />
          <CatatanKaki>
            Perubahan harga berlaku untuk transaksi berikutnya — transaksi yang sudah terjadi tidak berubah
            (PRD §9). Setiap perubahan tercatat di audit log.
          </CatatanKaki>
        </Panel>

        <Panel judul="Rekap per terminal — hari ini">
          <div className="term"><span className="dot on" /><div><div className="nm">KANTIN-01</div><div className="loc">231 transaksi</div></div><div className="st"><b>Rp 2.741.000</b><br />0 offline · 0 batal</div></div>
          <div className="term"><span className="dot on" /><div><div className="nm">KANTIN-02</div><div className="loc">178 transaksi</div></div><div className="st"><b>Rp 2.095.000</b><br />3 offline tersinkron · 0 batal</div></div>
          <div style={{ borderTop: "1px solid var(--rule)", marginTop: 10, paddingTop: 12 }}>
            <div className="hd" style={{ marginBottom: 8 }}><h2>Terlaris minggu ini</h2></div>
            <div className="tw">
              <table>
                <thead><tr><th>Menu</th><th className="num">Porsi</th><th className="num">Omzet</th></tr></thead>
                <tbody>
                  {TERLARIS_KANTIN.map(t => (
                    <tr key={t.menu}><td>{t.menu}</td><td className="num">{t.porsi}</td><td className="num">{ribuan(t.omzetRp)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CatatanKaki>
              Sejak mode nominal jadi default kasir (F-47), rincian porsi bersumber dari mode menu &amp; PO —
              dorong adopsi PO supaya data dapur tetap kaya.
            </CatatanKaki>
          </div>
        </Panel>
      </div>
    </>
  );
}
