import type { Metadata } from "next";
import Link from "next/link";
import { Demo, Panel, StChip } from "@/components/ui";
import { AksiContoh, TautanContoh } from "@/components/Mock";
import { SISWA } from "@/lib/data";
import { ribuan } from "@/lib/format";

export const metadata: Metadata = { title: "Siswa & Kartu" };

const CHIP_KARTU: Record<string, { kelas: string; label: string }> = {
  aktif: { kelas: "aktif", label: "aktif" },
  hilang: { kelas: "blokir", label: "diblokir" },
  ditarik: { kelas: "keluar", label: "ditarik" },
  belum: { kelas: "cuti", label: "belum ada" },
};

export default function HalamanSiswa() {
  return (
    <>
      <div className="top">
        <div>
          <h1>Siswa &amp; Kartu</h1>
          <div className="sub">383 siswa aktif · tahun ajaran 2026/2027</div>
        </div>
        <div className="right">
          <AksiContoh>⇪ Impor CSV</AksiContoh>
          <AksiContoh>Kenaikan kelas massal</AksiContoh>
          <AksiContoh kelas="btn pri">+ Siswa baru</AksiContoh>
        </div>
      </div>
      <Demo />

      <Panel>
        <div className="filters">
          <input type="search" placeholder="Cari nama, NIS, atau email…" aria-label="Cari siswa" />
          <select aria-label="Filter kelas" defaultValue="Semua kelas">
            {["Semua kelas", "7.A", "7.B", "8.A", "8.B", "9.C", "10.A", "11.B", "12.A"].map(k => <option key={k}>{k}</option>)}
          </select>
          <select aria-label="Filter status" defaultValue="Status: Aktif">
            {["Status: Aktif", "Cuti", "Lulus", "Pindah", "Keluar", "Semua"].map(k => <option key={k}>{k}</option>)}
          </select>
          <select aria-label="Filter kartu" defaultValue="Kartu: Semua">
            {["Kartu: Semua", "Aktif", "Diblokir / hilang", "Belum punya kartu"].map(k => <option key={k}>{k}</option>)}
          </select>
          <span className="count">Menampilkan {SISWA.length} dari 383</span>
        </div>
        <div className="tw">
          <table>
            <thead><tr><th>NIS</th><th>Nama</th><th>Kelas</th><th>Status</th><th>Kartu</th><th className="num">Saldo</th><th>PIN</th><th /></tr></thead>
            <tbody>
              {SISWA.map(s => {
                const nonaktif = s.status !== "aktif";
                const kartu = CHIP_KARTU[s.kartu] ?? { kelas: "aktif", label: s.kartu };
                return (
                  <tr key={s.nis}>
                    <td className="mono">{s.nis}</td>
                    <td style={nonaktif ? { color: "var(--ink-3)" } : undefined}>{nonaktif ? s.nama : <b>{s.nama}</b>}</td>
                    <td>{s.kelas}</td>
                    <td><StChip jenis={s.status === "lulus" ? "lulus" : s.status}>{s.status === "lulus" ? "lulus 2026" : s.status}</StChip></td>
                    <td><StChip jenis={kartu.kelas}>{kartu.label}</StChip></td>
                    <td className="num" style={nonaktif ? { color: "var(--ink-3)" } : undefined}>{ribuan(s.saldoRp)}</td>
                    <td>{nonaktif ? "—" : s.pinTerkunci ? <StChip jenis="blokir">terkunci</StChip> : "OK"}</td>
                    <td><Link href={`/admin/siswa/${s.nis}`}>Detail →</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pager">
          Riwayat siswa nonaktif tetap terbaca (soft delete, PRD §5-9) · <TautanContoh>Muat lebih banyak</TautanContoh>
        </div>
      </Panel>
    </>
  );
}
