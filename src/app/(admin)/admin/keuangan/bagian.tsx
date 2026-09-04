"use client";

import { useState } from "react";
import CariSiswa, { type SiswaRingkas } from "@/components/CariSiswa";
import { Badge, CatatanKaki, Panel, Tile } from "@/components/ui";
import { apiAdmin, useMuat, waktuSingkat } from "@/lib/admin";
import { rp } from "@/lib/format";

/**
 * Keuangan — untuk sekarang berisi satu hal saja: top-up tunai dengan
 * kontrol dua orang.
 *
 * Panel rekonsiliasi, koreksi saldo, penarikan, dan sengketa yang dulu ada
 * di halaman ini DIHAPUS, bukan dibiarkan. Semuanya memajang angka karangan
 * dan tombol yang tidak melakukan apa pun, di layar yang paling tidak boleh
 * berbohong. Halaman kosong yang jujur lebih berguna daripada dashboard
 * keuangan yang isinya karangan.
 *
 * Alur top-up tunai sengaja dua langkah:
 *
 *   Petugas A membuat permintaan  →  uang belum bergerak
 *   Petugas B menyetujui dari akunnya sendiri  →  saldo bertambah
 *
 * Yang membuat ini berarti bukan tombolnya, melainkan bahwa identitas B
 * diambil server dari sesi B. Sebelumnya nama B cukup diketik A, dan B tidak
 * pernah tahu namanya dipakai.
 */

interface Menunggu {
  id: number; siswa_id: number; nis: string; nama: string; kelas: string | null;
  nominal_rp: number; catatan: string | null; diminta_oleh: string;
  dibuat: string; kedaluwarsa: string; saldo_sekarang_rp: number;
}
interface Riwayat {
  id: number; siswa_id: number; nis: string; nama: string; nominal_rp: number;
  catatan: string | null; diminta_oleh: string; diputus_oleh: string | null;
  status: string; dibuat: string; diputus_pada: string | null;
  alasan: string | null; transaksi_id: number | null;
}
interface Isi { menunggu: Menunggu[]; riwayat: Riwayat[]; saya: string }

export default function Bagian() {
  const { data, galat, sedang, muatUlang } = useMuat<Isi>("/api/admin/keuangan/topup-tunai");
  const [siswa, setSiswa] = useState<SiswaRingkas | null>(null);
  const [nominal, setNominal] = useState("");
  const [catatan, setCatatan] = useState("");
  const [tolak, setTolak] = useState<{ id: number; alasan: string } | null>(null);
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  async function minta() {
    if (!siswa) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await apiAdmin<{ permintaan_id: number }>("/api/admin/keuangan/topup-tunai", {
      metode: "POST",
      body: { siswa_id: siswa.id, nominal_rp: Number(nominal), catatan: catatan.trim() || undefined },
    });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Permintaan ditolak"); return; }
    setPesan(`Permintaan #${r.data!.permintaan_id} dibuat. Saldo belum bertambah — tunggu staf lain menyetujui.`);
    setSiswa(null); setNominal(""); setCatatan("");
    await muatUlang();
  }

  async function putus(id: number, aksi: "setujui" | "tolak" | "batal", alasan?: string) {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await apiAdmin<{ status: string; saldo_rp: number }>("/api/admin/keuangan/topup-tunai", {
      metode: "PATCH", body: { permintaan_id: id, aksi, alasan },
    });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Aksi ditolak"); return; }
    setTolak(null);
    // "kedaluwarsa" datang sebagai keberhasilan, bukan error: server memang
    // berhasil memutuskan — keputusannya adalah bahwa permintaannya sudah
    // lewat waktu. Barisnya sudah ditandai, jadi tidak akan muncul lagi.
    if (r.data!.status === "kedaluwarsa") setGagal(true);
    setPesan(
      r.data!.status === "disetujui" ? `Disetujui. Saldo siswa sekarang ${rp(r.data!.saldo_rp)}.`
        : r.data!.status === "ditolak" ? "Permintaan ditolak."
          : r.data!.status === "kedaluwarsa"
            ? "Permintaan sudah lewat waktu dan hangus. Minta petugas membuat permintaan baru."
            : "Permintaan dibatalkan.");
    await muatUlang();
  }

  const menunggu = data?.menunggu ?? [];
  const nilaiMenunggu = menunggu.reduce((a, m) => a + m.nominal_rp, 0);

  return (
    <>
      <div className="top">
        <div>
          <h1>Keuangan</h1>
          <div className="sub">
            Top-up tunai dengan kontrol dua orang. Modul keuangan lainnya belum dibangun.
          </div>
        </div>
        <div className="right">
          <button type="button" className="btn" onClick={() => void muatUlang()}>Muat ulang</button>
        </div>
      </div>

      {galat ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div> : null}
      {pesan ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 14 }}>{pesan}</div> : null}

      <div className="kpis">
        <Tile label="Menunggu persetujuan" value={menunggu.length}
          valueStyle={menunggu.length > 0 ? { color: "var(--warn-text)" } : undefined}
          sub={menunggu.length > 0 ? "belum menambah saldo siapa pun" : "tidak ada"} />
        <Tile label="Nilai menunggu" value={rp(nilaiMenunggu)} />
      </div>

      <Panel judul="Minta top-up tunai" sub="langkah 1 dari 2 — uang belum bergerak">
        <CariSiswa terpilih={siswa} onPilih={setSiswa} />
        <div className="a-form" style={{ marginTop: 12 }}>
          <div className="field">
            <label className="f" htmlFor="t-nominal">Nominal diterima (Rp)</label>
            <input id="t-nominal" type="number" min={1000} step={1000} value={nominal}
              onChange={e => setNominal(e.target.value)} />
          </div>
          <div className="field">
            <label className="f" htmlFor="t-catatan">Catatan</label>
            <input id="t-catatan" type="text" maxLength={200} value={catatan}
              onChange={e => setCatatan(e.target.value)} placeholder="mis. diserahkan ibu Aisha di loket" />
          </div>
        </div>
        <div className="a-aksi" style={{ marginTop: 12 }}>
          <button type="button" className="btn pri" disabled={sibuk || !siswa || Number(nominal) < 1000}
            onClick={() => void minta()}>
            {sibuk ? "Mengirim…" : "Buat permintaan"}
          </button>
        </div>
        <CatatanKaki>
          Hitung uangnya bersama orang yang menyerahkan, lalu buat permintaan ini. Saldo siswa
          <b> belum berubah</b> sampai staf lain menyetujuinya dari akunnya sendiri. Permintaan
          hangus setelah beberapa menit — persetujuan yang masih bisa dipakai besok pagi bukan
          lagi kontrol dua orang.
        </CatatanKaki>
      </Panel>

      <Panel judul="Menunggu persetujuan" sub={sedang ? "memuat…" : `${menunggu.length} permintaan`}>
        {tolak ? (
          <div className="a-err" style={{ marginBottom: 12 }}>
            <div className="field">
              <label className="f" htmlFor="tk-alasan">Alasan menolak (wajib)</label>
              <input id="tk-alasan" type="text" maxLength={200} value={tolak.alasan} style={{ width: "100%", maxWidth: 500 }}
                onChange={e => setTolak({ ...tolak, alasan: e.target.value })}
                placeholder="mis. uangnya tidak saya lihat diserahkan" />
            </div>
            <div className="a-aksi">
              <button type="button" className="btn danger" disabled={sibuk || tolak.alasan.trim().length < 3}
                onClick={() => void putus(tolak.id, "tolak", tolak.alasan.trim())}>Tolak permintaan</button>
              <button type="button" className="btn" onClick={() => setTolak(null)}>Batal</button>
            </div>
          </div>
        ) : null}

        <div className="tw">
          <table>
            <thead>
              <tr><th>Siswa</th><th className="num">Nominal</th><th className="num">Saldo sekarang</th>
                <th>Diminta</th><th>Hangus</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {menunggu.map(m => (
                <tr key={m.id}>
                  <td><b>{m.nama}</b> <span className="kls">{m.kelas ?? m.nis}</span>
                    {m.catatan ? <><br /><span className="p-note">{m.catatan}</span></> : null}</td>
                  <td className="num"><b>{rp(m.nominal_rp)}</b></td>
                  <td className="num">{rp(m.saldo_sekarang_rp)}</td>
                  <td>{m.diminta_oleh}<br /><span className="p-note">{waktuSingkat(m.dibuat)}</span></td>
                  <td>{waktuSingkat(m.kedaluwarsa)}</td>
                  <td>
                    <div className="a-aksi">
                      {m.diminta_oleh === data?.saya ? (
                        <>
                          <span className="p-note">permintaanmu — tunggu staf lain</span>
                          <button type="button" className="btn sm" disabled={sibuk}
                            onClick={() => void putus(m.id, "batal")}>Batalkan</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="btn sm pri" disabled={sibuk}
                            onClick={() => void putus(m.id, "setujui")}>Setujui</button>
                          <button type="button" className="btn sm" disabled={sibuk}
                            onClick={() => { setPesan(""); setTolak({ id: m.id, alasan: "" }); }}>Tolak</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {menunggu.length === 0 && !sedang ? (
                <tr><td colSpan={6} className="p-note">Tidak ada permintaan menunggu.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <CatatanKaki>
          Baris permintaanmu sendiri hanya bisa dibatalkan, tidak disetujui — dan itu
          ditegakkan server, bukan sekadar tombol yang disembunyikan.
          <b> Jangan menyetujui top-up yang tidak kamu saksikan sendiri</b>; namamu
          yang tercatat sebagai penyetuju, dan tidak ada cara membedakan persetujuan yang
          tergesa-gesa dari yang sungguh diperiksa.
        </CatatanKaki>
      </Panel>

      <Panel judul="Riwayat keputusan" sub="50 terakhir">
        <div className="tw">
          <table>
            <thead>
              <tr><th>Siswa</th><th className="num">Nominal</th><th>Diminta</th><th>Diputus</th>
                <th>Status</th><th>Catatan</th></tr>
            </thead>
            <tbody>
              {(data?.riwayat ?? []).map(r => (
                <tr key={r.id}>
                  <td>{r.nama} <span className="kls">{r.nis}</span></td>
                  <td className="num">{rp(r.nominal_rp)}</td>
                  <td>{r.diminta_oleh}<br /><span className="p-note">{waktuSingkat(r.dibuat)}</span></td>
                  <td>{r.diputus_oleh ?? "—"}<br /><span className="p-note">{waktuSingkat(r.diputus_pada)}</span></td>
                  <td>{
                    r.status === "disetujui" ? <Badge warna="good">disetujui</Badge>
                      : r.status === "ditolak" ? <Badge warna="crit">ditolak</Badge>
                        : <Badge warna="mute">{r.status}</Badge>
                  }{r.transaksi_id ? <><br /><span className="p-note">trx #{r.transaksi_id}</span></> : null}</td>
                  <td>{r.alasan ?? r.catatan ?? "—"}</td>
                </tr>
              ))}
              {(data?.riwayat ?? []).length === 0 && !sedang ? (
                <tr><td colSpan={6} className="p-note">Belum ada keputusan tercatat.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel judul="Belum dibangun">
        <p style={{ margin: 0, fontSize: 13.5 }}>
          Rekonsiliasi harian, koreksi saldo, penarikan, penyelesaian sengketa vending, dan
          penampil webhook gateway belum ada layarnya. Endpoint-nya sebagian sudah ada, tapi
          semuanya menggerakkan uang sungguhan — dan saya tidak memasang tombolnya sebelum
          alur persetujuannya diputuskan, dengan pola yang sama seperti halaman ini.
        </p>
        <CatatanKaki>
          Rekonsiliasi malam tetap berjalan otomatis di server. Hasilnya terlihat di kartu
          &ldquo;Rekonsiliasi terakhir&rdquo; pada beranda.
        </CatatanKaki>
      </Panel>
    </>
  );
}
