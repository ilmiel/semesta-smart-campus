import type { Metadata } from "next";
import { Att, Badge, CatatanKaki, Demo, Panel, Tile } from "@/components/ui";
import { AksiContoh, TautanContoh } from "@/components/Mock";
import { KATALOG, PINJAMAN_AKTIF } from "@/lib/data";

export const metadata: Metadata = { title: "Perpustakaan" };

export default function HalamanPerpus() {
  return (
    <>
      <div className="top">
        <div>
          <h1>Perpustakaan</h1>
          <div className="sub">Pinjam &amp; kembali via tap kartu · denda dari wallet dengan PIN (F-70 – F-72)</div>
        </div>
        <div className="right">
          <AksiContoh>⇪ Impor katalog</AksiContoh>
          <AksiContoh kelas="btn pri">+ Tambah buku</AksiContoh>
        </div>
      </div>
      <Demo />

      <div className="kpis">
        <Tile label="Koleksi" value="3.412" sub="eksemplar · 2.180 judul · ID + EN" />
        <Tile label="Sedang dipinjam" value="214" sub="oleh 158 siswa" />
        <Tile label="Terlambat" value="9" valueStyle={{ color: "var(--crit-text)" }} sub="denda berjalan Rp 41.000" />
        <Tile label="Peminjam aktif Agustus" value={<>268 <span style={{ fontSize: 15, color: "var(--ink-2)" }}>siswa</span></>}
          sub="70% dari 383 — naik dari 61% Juli" />
      </div>

      <div className="row">
        <Panel judul="Katalog"
          aksi={<>
            <input type="search" placeholder="Cari judul, pengarang, ISBN…" aria-label="Cari buku" style={{ minWidth: 220 }} />
            <select aria-label="Kategori" defaultValue="Semua kategori">
              {["Semua kategori", "Fiksi Indonesia", "Fiksi Inggris", "Sains", "Agama", "Referensi"].map(k => <option key={k}>{k}</option>)}
            </select>
          </>}>
          <div className="tw">
            <table>
              <thead><tr><th>Judul</th><th>Pengarang</th><th>Kategori</th><th className="num">Eks.</th><th className="num">Tersedia</th><th /></tr></thead>
              <tbody>
                {KATALOG.map(b => (
                  <tr key={b.judul}>
                    <td><b>{b.judul}</b></td><td>{b.pengarang}</td>
                    <td>{b.kategori}{b.kategori === "Referensi" ? <span className="kls"> baca di tempat</span> : null}</td>
                    <td className="num">{b.eks}</td><td className="num">{b.tersedia}</td>
                    <td><TautanContoh>Ubah</TautanContoh></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            2.180 judul · <TautanContoh>Muat lebih banyak</TautanContoh> · buku ber-barcode ISBN, scanner USB
            mode keyboard — sama seperti reader kartu
          </div>
        </Panel>

        <Panel judul="Aturan pinjam" aksi={<AksiContoh kelas="btn sm">Ubah</AksiContoh>}>
          <div className="tw">
            <table>
              <thead><tr><th>Jenjang</th><th className="num">Maks buku</th><th className="num">Durasi</th></tr></thead>
              <tbody>
                <tr><td>SMP</td><td className="num">3</td><td className="num">7 hari</td></tr>
                <tr><td>SMA</td><td className="num">5</td><td className="num">14 hari</td></tr>
              </tbody>
            </table>
          </div>
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>Perpanjang</dt><dd>1× dari portal siswa, kalau tidak ada antrean</dd>
            <dt>Denda telat</dt><dd>Rp 1.000/hari/buku · maks Rp 20.000 atau harga buku</dd>
            <dt>Referensi</dt><dd>Baca di tempat, tidak dipinjamkan</dd>
            <dt>Buku hilang</dt><dd>Diproses keuangan sebagai <span className="mono">denda</span> seharga buku — keputusan pustakawan, bukan otomatis</dd>
          </dl>
          <CatatanKaki>
            Denda dipotong dari wallet saat pengembalian, dengan PIN (F-71). Buku yang dikembalikan{" "}
            <b>selalu diterima</b> — denda yang belum terbayar jadi tagihan menunggu, bukan alasan menolak buku.
          </CatatanKaki>
          <div style={{ borderTop: "1px solid var(--rule)", marginTop: 12, paddingTop: 12 }}>
            <div className="hd"><h2>Terpopuler semester ini</h2></div>
            <div className="tw">
              <table><tbody>
                <tr><td>Bumi — Tere Liye</td><td className="num">38×</td></tr>
                <tr><td>Diary of a Wimpy Kid</td><td className="num">31×</td></tr>
                <tr><td>Wonder — R.J. Palacio</td><td className="num">27×</td></tr>
                <tr><td>Laskar Pelangi</td><td className="num">22×</td></tr>
              </tbody></table>
            </div>
            <CatatanKaki>Data ini untuk pengadaan buku — judul yang antreannya panjang layak ditambah eksemplarnya.</CatatanKaki>
          </div>
        </Panel>
      </div>

      <div className="row2">
        <Panel judul="Terlambat — 9 buku">
          <Att badge="3 hr" warna="crit" aksi={<TautanContoh>Ingatkan lagi</TautanContoh>}>
            <b>Rafif G. Wisanggeni</b> (7.A) — Bumi
            <div className="d">Jatuh tempo 29 Agu · denda berjalan Rp 3.000 · pengingat portal 2× terkirim</div>
          </Att>
          <Att badge="5 hr" warna="crit" aksi={<TautanContoh>Beritahu wali kelas</TautanContoh>}>
            <b>Raka Dwi Putra</b> (8.A) — Atomic Habits for Teens
            <div className="d">Denda berjalan Rp 5.000 · siswa jarang buka portal — eskalasi ke wali kelas</div>
          </Att>
          <Att badge="12 hr" warna="crit" aksi={<TautanContoh>Proses</TautanContoh>}>
            <b>Yusuf Maulana</b> (11.A) — National Geographic Kids
            <div className="d">Siswa cuti sejak 25 Agu · denda dibekukan sementara oleh pustakawan (tercatat) — kebijakan, bukan otomatis</div>
          </Att>
          <CatatanKaki>
            Denda berhenti dihitung saat buku diterima kembali, bukan saat dibayar. Siswa cuti/sakit:
            pustakawan bisa membekukan denda — keputusannya tercatat di audit log.
          </CatatanKaki>
        </Panel>

        <Panel judul="Pinjaman aktif terakhir" aksi={<TautanContoh>Semua →</TautanContoh>}>
          <div className="tw">
            <table>
              <thead><tr><th>Siswa</th><th>Buku</th><th>Pinjam</th><th>Jatuh tempo</th><th>Status</th></tr></thead>
              <tbody>
                {PINJAMAN_AKTIF.map(p => (
                  <tr key={`${p.siswa}-${p.buku}`}>
                    <td>{p.siswa} <span className="kls">{p.kelas}</span></td>
                    <td>{p.buku}</td>
                    <td className="mono">{p.pinjam}</td>
                    <td className="mono">{p.tempo}</td>
                    <td>{p.status === "ok" ? <Badge warna="good">ok</Badge>
                      : p.status === "hampir" ? <Badge warna="warn">4 hari lagi</Badge>
                      : <Badge warna="crit">telat 3 hr</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Riwayat bacaan per siswa terlihat oleh wali kelas dan ortu — nilai edukatif, bukan pengawasan
            (F-72). Kartu Rafif sedang diblokir: tidak bisa pinjam buku baru sampai kartu pengganti terbit —
            buku yang sudah di tangan tetap tercatat.
          </CatatanKaki>
        </Panel>
      </div>
    </>
  );
}
