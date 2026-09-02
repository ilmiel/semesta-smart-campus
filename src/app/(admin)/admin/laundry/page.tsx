import type { Metadata } from "next";
import Link from "next/link";
import { Att, Badge, CatatanKaki, Demo, Panel, Tile } from "@/components/ui";
import { AksiContoh, TautanContoh } from "@/components/Mock";
import { ORDER_LAUNDRY, TARIF_LAUNDRY, type StatusLaundry } from "@/lib/data";
import { ribuan } from "@/lib/format";

export const metadata: Metadata = { title: "Laundry" };

function BadgeLaundry({ s, hari }: { s: StatusLaundry; hari?: number }) {
  if (s === "diterima") return <Badge warna="info">diterima</Badge>;
  if (s === "dicuci") return <Badge warna="warn">dicuci</Badge>;
  if (s === "siap") return <Badge warna="good">siap diambil</Badge>;
  return <Badge warna="crit">menunggak {hari} hr</Badge>;
}

export default function HalamanLaundry() {
  return (
    <>
      <div className="top">
        <div>
          <h1>Laundry</h1>
          <div className="sub">Dikelola sekolah sendiri · terima dulu, bayar saat ambil (F-50, F-51) · pilot Asrama Putra</div>
        </div>
        <div className="right">
          <AksiContoh>Rekap bulanan</AksiContoh>
          <AksiContoh>Atur jadwal</AksiContoh>
        </div>
      </div>
      <Demo />

      <div className="kpis">
        <Tile label="Diterima hari ini" value="41 order" sub="128,5 kg · 2 express" />
        <Tile label="Siap diambil" value="27" sub="rak A–C · tertua 3 hari" />
        <Tile label="Tagihan menunggak > 7 hari" value="4 · Rp 96.500" valueStyle={{ color: "var(--crit-text)" }}
          sub="eskalasi ke pembina asrama (F-51)" />
        <Tile label="Pendapatan Agustus" value="Rp 8.214.000"
          sub={<>settlement: <Link href="/admin/keuangan">keuangan →</Link></>} />
      </div>

      <div className="row">
        <Panel judul="Order aktif" sub="alur: diterima → dicuci → siap diambil → lunas"
          aksi={<>
            <input type="search" placeholder="Cari order / nama…" aria-label="Cari order" style={{ minWidth: 180 }} />
            <select aria-label="Filter status" defaultValue="Semua status">
              {["Semua status", "Diterima", "Dicuci", "Siap diambil", "Menunggak"].map(k => <option key={k}>{k}</option>)}
            </select>
          </>}>
          <div className="tw">
            <table>
              <thead><tr><th>Order</th><th>Siswa</th><th>Isi</th><th>Masuk</th><th>Rak</th><th>Status</th><th className="num">Tagihan</th></tr></thead>
              <tbody>
                {ORDER_LAUNDRY.map(o => (
                  <tr key={o.order}>
                    <td className="mono"><b>{o.order}</b></td>
                    <td>{o.siswa} <span className="kls">{o.ket}</span></td>
                    <td>{o.isi}</td>
                    <td className="mono">{o.masuk}</td>
                    <td className="mono">{o.rak}</td>
                    <td><BadgeLaundry s={o.status} hari={o.hariTelat} /></td>
                    <td className="num" style={o.status === "menunggak" ? { color: "var(--crit-text)" } : undefined}>{ribuan(o.tagihanRp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Berat ditimbang di terminal, dibulatkan naik ke 0,5 kg. Tagihan dihitung dari tarif saat order
            masuk — perubahan tarif tidak mengubah order berjalan.
          </CatatanKaki>
        </Panel>

        <Panel judul="Tarif berlaku" aksi={<AksiContoh kelas="btn sm">Ubah tarif</AksiContoh>}>
          <div className="tw">
            <table>
              <thead><tr><th>Layanan</th><th className="num">Tarif</th></tr></thead>
              <tbody>{TARIF_LAUNDRY.map(t => <tr key={t.layanan}><td>{t.layanan}</td><td className="num">{t.tarif}</td></tr>)}</tbody>
            </table>
          </div>
          <CatatanKaki>Perubahan tarif tercatat di audit log (F-52) dan berlaku untuk order baru saja.</CatatanKaki>
          <div style={{ borderTop: "1px solid var(--rule)", marginTop: 12, paddingTop: 12 }}>
            <div className="hd"><h2>Jadwal setor</h2></div>
            <dl className="kv">
              <dt>Asrama Putra</dt><dd>Senin · Rabu · Jumat, 16.00–18.00</dd>
              <dt>Asrama Putri</dt><dd>Selasa · Kamis · Sabtu, 16.00–18.00</dd>
              <dt>Express</dt><dd>Setiap hari, maks 5 order/hari</dd>
            </dl>
          </div>
        </Panel>
      </div>

      <div className="row2">
        <Panel judul="Tagihan menunggak > 7 hari" aksi={<Badge warna="crit">4 order</Badge>}>
          <Att badge="10 hr" warna="crit" aksi={<TautanContoh>Proses</TautanContoh>}>
            <b>Davin Mahesa</b> — LDY-0871 · Rp 14.000
            <div className="d">Status siswa: lulus. Hubungi via ortu, potong dari sisa saldo sebelum penarikan</div>
          </Att>
          <Att badge="9 hr" warna="crit" aksi={<TautanContoh>Beritahu pembina</TautanContoh>}>
            <b>Fikri Ardiansyah</b> (9.A) — LDY-0874 · Rp 21.000
            <div className="d">Saldo cukup — siswa belum datang mengambil. Sudah 2× diingatkan via portal</div>
          </Att>
          <Att badge="8 hr" warna="crit" aksi={<TautanContoh>Ingatkan ortu lagi</TautanContoh>}>
            <b>Raka Dwi Putra</b> (8.A) — LDY-0880 · Rp 28.000
            <div className="d">Saldo tidak cukup (sisa Rp 4.500) — notifikasi minta top-up sudah dikirim ke ortu</div>
          </Att>
          <Att badge="8 hr" warna="crit" aksi={<TautanContoh>Proses</TautanContoh>}>
            <b>Yusuf Maulana</b> (11.A) — LDY-0881 · Rp 33.500
            <div className="d">Siswa cuti sejak 25 Agu — tahan di rak, koordinasi dengan pembina</div>
          </Att>
          <CatatanKaki>
            Barang tidak pernah ditahan sebagai &quot;sandera&quot; pembayaran tanpa sepengetahuan pembina —
            eskalasi selalu lewat manusia, sistem hanya mengingatkan.
          </CatatanKaki>
        </Panel>

        <Panel judul="Catatan operasional">
          <Att badge="PIN" warna="info">
            <b>Semua pembayaran laundry wajib PIN</b> (F-31)
            <div className="d">Konsekuensi F-33: pembayaran tidak bisa saat terminal offline — penerimaan cucian tetap bisa (tidak ada uang berpindah)</div>
          </Att>
          <Att badge="Klaim" warna="info">
            <b>Cucian hilang / tertukar</b>
            <div className="d">Petugas buat laporan klaim di terminal → ganti rugi lewat transaksi <span className="mono">koreksi</span> oleh keuangan, bukan uang tunai</div>
          </Att>
          <Att badge="Kapasitas" warna="info">
            <b>Batas 6 kg per order kiloan</b>
            <div className="d">Lebih dari itu dipecah jadi 2 order — menjaga antrian mesin adil antar siswa</div>
          </Att>
        </Panel>
      </div>
    </>
  );
}
