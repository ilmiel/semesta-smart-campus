import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Att, Badge, CatatanKaki, JenChip, Panel, StChip } from "@/components/ui";
import { AksiContoh } from "@/components/Mock";
import { SISWA } from "@/lib/data";

export const metadata: Metadata = { title: "Detail Siswa" };

/** Riwayat contoh — hanya lengkap untuk Rafif (26001); siswa lain diberi kerangka sama. */
const RIWAYAT = [
  { tgl: "01 Sep 12.41", ket: "Top-up via mayar.id", terminal: "—", jenis: "topup", nominal: "+200.000", saldo: "200.000" },
  { tgl: "31 Agu 12.10", ket: "Nasi ayam + teh", terminal: "KANTIN-01", jenis: "belanja", nominal: "−15.000", saldo: "0" },
  { tgl: "31 Agu 09.35", ket: "Roti + susu", terminal: "KANTIN-02", jenis: "belanja", nominal: "−8.000", saldo: "15.000" },
  { tgl: "30 Agu 12.14", ket: "Refund: pesanan dibatalkan (ref #8123)", terminal: "Keuangan", jenis: "koreksi", nominal: "+15.000", saldo: "23.000" },
  { tgl: "30 Agu 12.02", ket: "Nasi ayam + teh", terminal: "KANTIN-01", jenis: "belanja", nominal: "−15.000", saldo: "8.000" },
];

export default async function DetailSiswa({ params }: { params: Promise<{ nis: string }> }) {
  const { nis } = await params;
  const s = SISWA.find(x => x.nis === nis);
  if (!s) notFound();

  const inisial = s.nama.split(" ").map(k => k[0]).slice(0, 2).join("").toUpperCase();
  const kartuDiblokir = s.kartu === "hilang";

  return (
    <>
      <div className="crumb"><Link href="/admin/siswa">Siswa &amp; Kartu</Link> / {s.nama}</div>
      <div className="shead">
        <div className="foto">{inisial}</div>
        <div>
          <h1>{s.nama}</h1>
          <div className="meta">
            NIS <span className="mono">{s.nis}</span> · {s.kelas} · {s.jenjang} · {s.boarding ? "Boarding" : "Day"} ·{" "}
            <StChip jenis={s.status}>{s.status}</StChip>
          </div>
        </div>
        <div className="right" style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <AksiContoh>Riwayat audit</AksiContoh>
          <AksiContoh>Ubah data</AksiContoh>
        </div>
      </div>

      <div className="row3">
        <Panel judul="Kartu" aksi={kartuDiblokir ? <Badge warna="crit">diblokir — lapor hilang</Badge> : <Badge warna="good">aktif</Badge>}>
          <dl className="kv">
            <dt>UID</dt><dd className="mono">04A1B2C3D4E5F6</dd>
            <dt>Terbit</dt><dd>15 Jul 2026</dd>
            {kartuDiblokir ? (<>
              <dt>Diblokir</dt><dd>1 Sep 2026, 06.12 — oleh siswa via portal</dd>
              <dt>Alasan</dt><dd>Dilaporkan hilang</dd>
            </>) : null}
          </dl>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <AksiContoh kelas="btn pri">Terbitkan kartu baru</AksiContoh>
            <AksiContoh>Aktifkan lagi (ketemu)</AksiContoh>
          </div>
          <CatatanKaki>Saldo &amp; transaksi tidak berubah saat ganti kartu (F-02).</CatatanKaki>
        </Panel>

        <Panel judul="Wallet">
          <dl className="kv">
            <dt>Saldo</dt><dd style={{ fontSize: 18 }}>Rp {s.saldoRp.toLocaleString("id-ID")}</dd>
            <dt>Limit harian</dt><dd>Rp 50.000 <span style={{ color: "var(--ink-3)" }}>(default sekolah)</span></dd>
            <dt>Dipakai hari ini</dt><dd>Rp 0{kartuDiblokir ? <span style={{ color: "var(--ink-3)" }}> — kartu diblokir</span> : null}</dd>
            <dt>PIN</dt><dd>{s.pinTerkunci ? "Terkunci (5× salah) — buka via verifikasi TU" : "Aktif, terakhir diganti 20 Jul 2026"}</dd>
          </dl>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <AksiContoh>Reset PIN (siswa hadir)</AksiContoh>
            <AksiContoh>Ubah limit</AksiContoh>
          </div>
          <CatatanKaki>Reset PIN tercatat di audit log dengan nama petugas (F-34).</CatatanKaki>
        </Panel>

        <Panel judul="Wali">
          <dl className="kv">
            <dt>Utama</dt><dd>Ibu Ratna Wisanggeni<br /><span style={{ color: "var(--ink-3)" }}>ratna.w@gmail.com · 0812-3456-7890</span></dd>
            <dt>Kedua</dt><dd>Bpk. Gamma Wisanggeni<br /><span style={{ color: "var(--ink-3)" }}>gamma.w@gmail.com</span></dd>
            <dt>Notifikasi</dt><dd>Ke wali utama · saldo &lt; Rp 20.000</dd>
          </dl>
          <div style={{ marginTop: 12 }}><AksiContoh>Kirim ulang undangan portal</AksiContoh></div>
        </Panel>
      </div>

      <div className="row2">
        <Panel judul="Modul lain">
          <Att badge="✓ Kelas" warna="good">
            <b>Absensi Smart Classroom</b>
            <div className="d">Hadir 41/42 hari semester ini — integrasi penuh di Fase 2 (F-81)</div>
          </Att>
          <Att badge="✓ Laundry" warna="good">
            <b>LDY-0912 — siap diambil</b>
            <div className="d">3,5 kg · rak B-14 · Rp 24.500 dibayar saat ambil · <Link href="/admin/laundry">buka modul →</Link></div>
          </Att>
          <Att badge="✓ Loker" warna="good">
            <b>A-117 — Asrama Putra lt. 1</b>
            <div className="d">Buka terakhir 06.31 · kartu diblokir = loker ikut terkunci · <Link href="/admin/loker">buka modul →</Link></div>
          </Att>
          <Att badge="! Perpus" warna="crit">
            <b>2 buku dipinjam — 1 telat</b>
            <div className="d">Bumi (telat 3 hr, denda berjalan Rp 3.000) · Wonder (tempo 5 Sep) · <Link href="/admin/perpus">buka modul →</Link></div>
          </Att>
        </Panel>

        <Panel judul="Riwayat transaksi" sub="30 hari terakhir"
          aksi={<AksiContoh kelas="btn sm">Unduh PDF utk ortu</AksiContoh>}>
          <div className="tw">
            <table>
              <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Terminal</th><th>Jenis</th><th className="num">Nominal</th><th className="num">Saldo</th></tr></thead>
              <tbody>
                {RIWAYAT.map(r => (
                  <tr key={r.tgl}>
                    <td className="mono">{r.tgl}</td><td>{r.ket}</td><td>{r.terminal}</td>
                    <td><JenChip jenis={r.jenis} /></td>
                    <td className={`num ${r.nominal.startsWith("+") ? "plus" : "min"}`}>{r.nominal}</td>
                    <td className="num">{r.saldo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CatatanKaki>Saldo = penjumlahan ledger, tidak bisa diedit. Koreksi selalu tampil sebagai baris baru (PRD §5-3).</CatatanKaki>
        </Panel>
      </div>
    </>
  );
}
