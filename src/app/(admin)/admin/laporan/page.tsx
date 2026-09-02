import type { Metadata } from "next";
import { Att, CatatanKaki, Demo, Panel } from "@/components/ui";
import { AksiContoh, TautanContoh } from "@/components/Mock";

export const metadata: Metadata = { title: "Laporan" };

export default function HalamanLaporan() {
  return (
    <>
      <div className="top">
        <div>
          <h1>Laporan</h1>
          <div className="sub">Laporan bulanan untuk ortu (PDF berkop) dan ekspor untuk manajemen</div>
        </div>
      </div>
      <Demo />

      <div className="row2">
        <Panel judul="Laporan bulanan wallet — untuk orang tua">
          <div className="filters" style={{ marginBottom: 10 }}>
            <select aria-label="Bulan" defaultValue="Agustus 2026"><option>Agustus 2026</option><option>Juli 2026</option></select>
            <select aria-label="Cakupan" defaultValue="Semua siswa (383)"><option>Semua siswa (383)</option><option>Per kelas…</option><option>Satu siswa…</option></select>
            <AksiContoh kelas="btn pri">Buat PDF</AksiContoh>
          </div>
          <Att badge="✓ Selesai" warna="good" aksi={<TautanContoh>Unduh semua (zip)</TautanContoh>}>
            <b>Agustus 2026 — 383 PDF</b>
            <div className="d">Dibuat 1 Sep 05.00 otomatis · berkop Semesta, ID + EN · tersedia di portal ortu (F-18, F-101)</div>
          </Att>
          <Att badge="✓ Selesai" warna="good" aksi={<TautanContoh>Unduh semua (zip)</TautanContoh>}>
            <b>Juli 2026 — 383 PDF</b>
            <div className="d">Dibuat 1 Agu 05.00</div>
          </Att>
          <CatatanKaki>Memakai komponen laporan berkop yang sudah ada (PRD §14) — ortu tidak menerima dump transaksi mentah.</CatatanKaki>
        </Panel>

        <Panel judul="Laporan manajemen">
          <Att badge="▤ Kantin" warna="info" aksi={<TautanContoh>Ekspor XLSX</TautanContoh>}>
            <b>Omzet &amp; porsi per menu</b>
            <div className="d">harian / mingguan / bulanan — untuk dapur dan keuangan (sumber: mode menu &amp; PO)</div>
          </Att>
          <Att badge="◫ Keuangan" warna="info" aksi={<TautanContoh>Ekspor CSV</TautanContoh>}>
            <b>Mutasi ledger lengkap</b>
            <div className="d">semua entri per periode, untuk audit — read-only</div>
          </Att>
          <Att badge="⚑ Kesiswaan" warna="info" aksi={<TautanContoh>Ekspor XLSX</TautanContoh>}>
            <b>Pola makan siswa boarding</b>
            <div className="d">frekuensi transaksi kantin per siswa — tanpa nominal rupiah (F-94)</div>
          </Att>
          <Att badge="☷ Kartu" warna="info" aksi={<TautanContoh>Ekspor XLSX</TautanContoh>}>
            <b>Kartu &amp; PIN</b>
            <div className="d">kartu diblokir/diganti per periode, PIN terkunci — untuk evaluasi TU</div>
          </Att>
          <CatatanKaki>Kesiswaan melihat pola, bukan rupiah — pemisahan hak lihat sesuai peran (F-91).</CatatanKaki>
        </Panel>
      </div>
    </>
  );
}
