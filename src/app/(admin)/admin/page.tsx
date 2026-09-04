import type { Metadata } from "next";
import Link from "next/link";
import ChartJam from "@/components/ChartJam";
import { Att, Badge, CatatanKaki, Demo, JenChip, Panel, Tile } from "@/components/ui";
import { TautanContoh } from "@/components/Mock";
import { TRANSAKSI_TERAKHIR } from "@/lib/data";
import { ribuan } from "@/lib/format";

export const metadata: Metadata = { title: "Beranda" };

export default function BerandaAdmin() {
  return (
    <>
      <div className="top">
        <div>
          <h1>Beranda</h1>
          <div className="sub">Selasa, 1 September 2026 · Tahun ajaran 2026/2027</div>
        </div>
      </div>
      <Demo />

      <div className="kpis">
        <Tile label="Transaksi hari ini" value="412" sub={<><span className="up">▲ 6%</span> vs rata-rata Selasa</>} />
        <Tile label="Omzet kantin hari ini" value="Rp 4.836.000" sub="2 terminal · 0 pembatalan" />
        <Tile label="Total saldo siswa (float)" value="Rp 41.254.500" sub="383 wallet · dipantau utk ambang BI" />
        <Tile label="Rekonsiliasi tadi malam"
          value={<span style={{ color: "var(--good-text)" }}>✓ 0 selisih</span>}
          sub="03.00 WIB · ledger = saldo cache" />
      </div>

      <div className="row">
        <Panel judul="Transaksi per jam" sub="hari ini, semua terminal"
          aksi={<TautanContoh>Lihat detail →</TautanContoh>}>
          <ChartJam />
        </Panel>
        <Panel judul="Status terminal" aksi={<Link href="/admin/perangkat">Perangkat →</Link>}>
          <div className="term"><span className="dot on" /><div><div className="nm">KANTIN-01</div><div className="loc">Kantin Utama</div></div><div className="st">Online<br />231 transaksi</div></div>
          <div className="term"><span className="dot on" /><div><div className="nm">KANTIN-02</div><div className="loc">Kantin Utama</div></div><div className="st">Online<br />178 transaksi</div></div>
          <div className="term"><span className="dot warn" /><div><div className="nm">TOPUP-TU</div><div className="loc">Tata Usaha</div></div><div className="st"><span className="w">⚠ Antrian offline: 3</span><br />sinkron terakhir 12.41</div></div>
          <div className="term"><span className="dot off2" /><div><div className="nm">KELAS-*</div><div className="loc">Smart Classroom · 18 reader</div></div><div className="st">Sistem terpisah<br />integrasi Fase 2</div></div>
        </Panel>
      </div>

      <div className="row2">
        <Panel judul="Perlu perhatian" sub="5 item">
          <Att badge="⚠ Kesiswaan" warna="warn" aksi={<TautanContoh>Tindak lanjut</TautanContoh>}>
            <b>2 siswa boarding</b> tanpa transaksi kantin ≥ 2 hari
            <div className="d">Nayla P. (9.C) · Keenan A. (8.B) — kemungkinan saldo habis atau tidak makan</div>
          </Att>
          <Att badge="✕ Kartu" warna="crit" aksi={<Link className="act" href="/admin/siswa/26001">Terbitkan kartu</Link>}>
            <b>1 kartu diblokir</b> hari ini
            <div className="d">Rafif G. (7.A) lapor hilang via portal, 06.12 — kartu baru belum terbit</div>
          </Att>
          <Att badge="⚠ PIN" warna="warn" aksi={<TautanContoh>Buka kunci</TautanContoh>}>
            <b>1 PIN terkunci</b> (5× salah)
            <div className="d">Alfian P. (10.A) di KANTIN-02, 12.05 — buka via verifikasi TU</div>
          </Att>
          <Att badge="⏱ Top-up" warna="info" aksi={<Link className="act" href="/admin/keuangan">Cek status</Link>}>
            <b>2 top-up menunggu</b> &gt; 1 jam
            <div className="d">Webhook mayar.id belum diterima — jalankan pencocokan manual</div>
          </Att>
          <Att badge="⚠ Sinkron" warna="warn" aksi={<Link className="act" href="/admin/perangkat">Lihat antrian</Link>}>
            <b>3 transaksi offline</b> belum terproses
            <div className="d">TOPUP-TU — terakhir online 12.41</div>
          </Att>
        </Panel>

        <Panel judul="Transaksi terakhir" aksi={<Link href="/admin/keuangan">Semua transaksi →</Link>}>
          <div className="tw">
            <table>
              <thead><tr><th>Waktu</th><th>Siswa</th><th>Terminal</th><th>Jenis</th><th className="num">Nominal</th></tr></thead>
              <tbody>
                {TRANSAKSI_TERAKHIR.map(t => (
                  <tr key={`${t.waktu}-${t.siswa}`}>
                    <td className="mono">{t.waktu}</td>
                    <td>{t.siswa} <span className="kls">{t.kelas}</span></td>
                    <td>{t.terminal}</td>
                    <td><JenChip jenis={t.jenis} /></td>
                    <td className={`num ${t.nominalRp > 0 ? "plus" : "min"}`}>
                      {t.nominalRp > 0 ? "+" : "−"}{ribuan(Math.abs(t.nominalRp))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            <Badge warna="good">✓</Badge> Angka dan nama pada tabel ini data contoh — bentuk kolomnya final.
          </CatatanKaki>
        </Panel>
      </div>
      <footer className="ft">PRD F-90 – F-95 · frontend tanpa backend — semua data dari <code>src/lib/data.ts</code></footer>
    </>
  );
}
