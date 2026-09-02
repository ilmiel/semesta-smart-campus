import type { Metadata } from "next";
import LokerMap from "@/components/LokerMap";
import { Att, Badge, CatatanKaki, Demo, Panel, Tile } from "@/components/ui";
import { AksiContoh, TautanContoh } from "@/components/Mock";

export const metadata: Metadata = { title: "Loker" };

export default function HalamanLoker() {
  return (
    <>
      <div className="top">
        <div>
          <h1>Loker</h1>
          <div className="sub">Buka dengan tap, tanpa PIN — ini akses, bukan keuangan (F-60) · penugasan terikat tahun ajaran</div>
        </div>
        <div className="right">
          <AksiContoh>Log akses lengkap</AksiContoh>
          <AksiContoh>Wizard tahun ajaran baru</AksiContoh>
        </div>
      </div>
      <Demo />

      <div className="kpis">
        <Tile label="Terisi" value="341 / 372" sub="Blok A 118/120 · B 116/120 · C 107/132" />
        <Tile label="Pembukaan hari ini" value="1.204" sub="puncak 06.30–07.15 · semua tercatat" />
        <Tile label="Rusak / maintenance" value="4" valueStyle={{ color: "var(--crit-text)" }} sub="2 solenoid · 1 engsel · 1 dicek" />
        <Tile label="Buka darurat bulan ini" value="3" sub="semua beralasan & tercatat di audit log" />
      </div>

      <LokerMap />

      <div className="row2">
        <Panel judul="Perlu perhatian">
          <Att badge="✕ Rusak" warna="crit" aksi={<TautanContoh>Jadwalkan servis</TautanContoh>}>
            <b>A-014 &amp; A-052 — solenoid tidak merespons</b>
            <div className="d">Dilaporkan siswa via portal · penghuni dipindah sementara, kunci mekanik master dipakai untuk ambil barang</div>
          </Att>
          <Att badge="⚠ Anomali" warna="warn" aksi={<TautanContoh>Teruskan ke pembina</TautanContoh>}>
            <b>C-089 dibuka 02.14 dini hari</b>
            <div className="d">Di luar jam wajar (05.00–22.00) · tap sah oleh pemiliknya — diteruskan ke pembina untuk konfirmasi, bukan otomatis dihukum</div>
          </Att>
          <Att badge="▦ Kosong" warna="info" aksi={<TautanContoh>Lihat daftar</TautanContoh>}>
            <b>25 loker Blok C belum ditugaskan</b>
            <div className="d">Fasilitas gratis — siswa non-boarding yang butuh bisa mengajukan lewat wali kelas</div>
          </Att>
          <Att badge="📦 Barang" warna="info" aksi={<TautanContoh>Proses</TautanContoh>}>
            <b>3 loker alumni belum dikosongkan</b>
            <div className="d">Penugasan TA lalu berakhir · barang diinventarisasi pembina sebelum loker dialihkan — tidak dibuang diam-diam</div>
          </Att>
        </Panel>

        <Panel judul="Log akses terakhir — semua blok" aksi={<TautanContoh>Semua →</TautanContoh>}>
          <div className="tw">
            <table>
              <thead><tr><th>Waktu</th><th>Loker</th><th>Siswa</th><th>Hasil</th></tr></thead>
              <tbody>
                <tr><td className="mono">13.02</td><td className="mono">B-044</td><td>Salsabila Zahra <span className="kls">11.B</span></td><td><Badge warna="good">✓ dibuka</Badge></td></tr>
                <tr><td className="mono">13.01</td><td className="mono">A-117</td><td>kartu <span className="mono">04A1B2…</span> (diblokir)</td><td><Badge warna="crit">✕ ditolak</Badge></td></tr>
                <tr><td className="mono">12.58</td><td className="mono">C-101</td><td>Keenan Alvaro <span className="kls">8.B</span></td><td><Badge warna="good">✓ dibuka</Badge></td></tr>
                <tr><td className="mono">12.55</td><td className="mono">A-052</td><td>Pembina — Ust. Hasan</td><td><Badge warna="warn">🔓 buka darurat</Badge></td></tr>
                <tr><td className="mono">12.51</td><td className="mono">B-012</td><td>Nayla Puspita <span className="kls">9.C</span></td><td><Badge warna="good">✓ dibuka</Badge></td></tr>
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Baris kedua: kartu Rafif yang hilang dicoba dipakai di A-117 — ditolak dan tercatat lengkap
            dengan UID. Kalau ada yang menemukan kartu itu, jejaknya ada.
          </CatatanKaki>
          <div style={{ borderTop: "1px solid var(--rule)", marginTop: 12, paddingTop: 12 }}>
            <div className="hd"><h2>Catatan hardware (F-62)</h2></div>
            <div className="p-note" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              1 controller per blok (LOKER-A/B/C di halaman Perangkat) → relay 12V per pintu. Kunci harus
              menerima sinyal dari controller kita — <b>bukan sistem tertutup vendor</b>. Daftar kartu aktif
              di-cache di controller, diperbarui tiap sinkron; listrik mati → kunci mekanik master per blok
              (fail-secure, bukan fail-open).
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
