import type { Metadata } from "next";
import { Att, Badge, CatatanKaki, Demo, Panel, Tile } from "@/components/ui";
import { AksiContoh, TautanContoh } from "@/components/Mock";

export const metadata: Metadata = { title: "Keuangan" };

const REKON = [
  { tgl: "01 Sep 03.00", akun: 391 }, { tgl: "31 Agu 03.00", akun: 391 },
  { tgl: "30 Agu 03.00", akun: 391 }, { tgl: "29 Agu 03.00", akun: 391 },
];
const KOREKSI = [
  { tgl: "01 Sep", siswa: "Nayla P.", nominal: "+15.000", ref: "#8123", petugas: "rina@semesta" },
  { tgl: "28 Agu", siswa: "Rafif G.", nominal: "+15.000", ref: "#7902", petugas: "rina@semesta" },
  { tgl: "21 Agu", siswa: "Keenan A.", nominal: "+12.000", ref: "#7511", petugas: "dedi@semesta" },
  { tgl: "14 Agu", siswa: "Davin M. (penarikan — lulus)", nominal: "−19.500", ref: "#7203", petugas: "rina@semesta" },
];

export default function HalamanKeuangan() {
  return (
    <>
      <div className="top">
        <div>
          <h1>Keuangan</h1>
          <div className="sub">Rekonsiliasi, settlement, refund, dan pemantauan float · semua aksi tercatat di audit log</div>
        </div>
        <div className="right">
          <AksiContoh>⇓ Ekspor CSV</AksiContoh>
          <AksiContoh>⇓ Ekspor XLSX</AksiContoh>
        </div>
      </div>
      <Demo />

      <div className="kpis">
        <Tile label="Total float (saldo semua siswa)" value="Rp 41.254.500"
          sub={<>jauh di bawah ambang izin BI — <TautanContoh>aturan &amp; ambang</TautanContoh></>} />
        <Tile label="Rekonsiliasi terakhir" value={<span style={{ color: "var(--good-text)" }}>✓ 0 selisih</span>}
          sub="1 Sep 03.00 · otomatis tiap malam (F-15)" />
        <Tile label="Top-up hari ini" value="Rp 3.150.000" sub="18 via mayar.id · 1 tunai TU" />
        <Tile label="Refund & koreksi bulan ini" value="Rp 61.500" sub="4 transaksi · semua ber-ref" />
      </div>

      <div className="row2">
        <Panel judul="Rekonsiliasi ledger vs saldo cache"
          aksi={<AksiContoh kelas="btn sm">Jalankan sekarang</AksiContoh>}>
          <div className="tw">
            <table>
              <thead><tr><th>Tanggal</th><th>Hasil</th><th className="num">Akun dicek</th><th className="num">Selisih</th></tr></thead>
              <tbody>
                {REKON.map(r => (
                  <tr key={r.tgl}><td className="mono">{r.tgl}</td><td><Badge warna="good">✓ bersih</Badge></td><td className="num">{r.akun}</td><td className="num">0</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Selisih ≠ 0 memicu alert ke IT + keuangan dan tombol <i>bangun ulang saldo dari ledger</i>.
            Ledger tidak pernah ikut diubah.
          </CatatanKaki>

          <div style={{ borderTop: "1px solid var(--rule)", marginTop: 14, paddingTop: 14 }}>
            <div className="hd"><h2>Settlement per unit</h2><span className="sub">Agustus 2026</span></div>
            <div className="tw">
              <table>
                <thead><tr><th>Unit</th><th className="num">Omzet</th><th>Status</th><th /></tr></thead>
                <tbody>
                  <tr><td>Kantin</td><td className="num">96.412.000</td><td><Badge warna="good">✓ disetujui</Badge></td><td><TautanContoh>Rincian</TautanContoh></td></tr>
                  <tr><td>Laundry</td><td className="num">8.214.000</td><td><Badge warna="good">✓ disetujui</Badge></td><td><TautanContoh>Rincian</TautanContoh></td></tr>
                  <tr><td>Top-up tunai TU</td><td className="num">2.400.000</td><td><Badge warna="warn">2 tanda tangan (F-23)</Badge></td><td><TautanContoh>Rincian</TautanContoh></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </Panel>

        <Panel judul="Butuh tindakan">
          <Att badge="⏱ Top-up" warna="warn" aksi={<TautanContoh>Cocokkan</TautanContoh>}>
            <b>INV-8841 · Rp 100.000</b> — dibayar, webhook belum masuk
            <div className="d">Ortu Keenan A. (8.B), 11.52 · cek langsung ke API mayar (risiko webhook, F-25)</div>
          </Att>
          <Att badge="⏱ Top-up" warna="warn" aksi={<TautanContoh>Cocokkan</TautanContoh>}>
            <b>INV-8836 · Rp 150.000</b> — menunggu &gt; 1 jam
            <div className="d">Ortu Salsabila Z. (11.B), 11.30</div>
          </Att>
          <Att badge="✕ Offline" warna="crit" aksi={<TautanContoh>Selesaikan</TautanContoh>}>
            <b>1 transaksi offline ditolak</b> saat sinkron
            <div className="d">KANTIN-02 · Bagas N. (12.A) Rp 16.000 — saldo sudah habis dipakai di terminal lain (F-44)</div>
          </Att>
          <Att badge="↩ Refund" warna="info" aksi={<TautanContoh>Setujui / tolak</TautanContoh>}>
            <b>Permintaan refund</b> dari kasir (lewat 5 menit)
            <div className="d">KANTIN-01 · Nayla P. Rp 15.000 — pesanan dibatalkan, butuh persetujuan keuangan (F-45)</div>
          </Att>

          <div style={{ borderTop: "1px solid var(--rule)", marginTop: 12, paddingTop: 12 }}>
            <div className="hd"><h2>Refund &amp; koreksi terakhir</h2></div>
            <div className="tw">
              <table>
                <thead><tr><th>Tanggal</th><th>Siswa</th><th className="num">Nominal</th><th>Ref</th><th>Petugas</th></tr></thead>
                <tbody>
                  {KOREKSI.map(k => (
                    <tr key={k.ref}>
                      <td className="mono">{k.tgl}</td><td>{k.siswa}</td>
                      <td className={`num ${k.nominal.startsWith("+") ? "plus" : "min"}`}>{k.nominal}</td>
                      <td className="mono">{k.ref}</td><td>{k.petugas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CatatanKaki>
              Setiap refund/koreksi/penarikan menunjuk transaksi asal (<span className="mono">ref_transaksi_id</span>) —
              riwayat bisa ditelusuri dua arah (F-16).
            </CatatanKaki>
          </div>
        </Panel>
      </div>
    </>
  );
}
