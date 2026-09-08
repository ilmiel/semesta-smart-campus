"use client";

import { useState } from "react";
import CariSiswa, { type SiswaRingkas } from "@/components/CariSiswa";
import { Badge, CatatanKaki, Panel, Tile } from "@/components/ui";
import { api, useMuat, waktuSingkat } from "@/lib/api";
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

interface MenungguVerifikasi {
  id: number;
  siswa_id: number;
  nis: string;
  nama: string;
  kelas: string | null;
  saldo_sekarang_rp: number;
  nominal_rp: number;
  metode: string;
  bukti_foto: string | null;
  catatan_wali: string | null;
  invoice_id: string | null;
  dibuat: string;
  wali_nama: string | null;
  wali_wa: string | null;
  wali_email: string | null;
}

interface RiwayatVerifikasi {
  id: number;
  siswa_id: number;
  nis: string;
  nama: string;
  kelas: string | null;
  nominal_rp: number;
  status: string;
  metode: string;
  bukti_foto: string | null;
  catatan_wali: string | null;
  invoice_id: string | null;
  dibuat: string;
  diputus_pada: string | null;
  diputus_oleh: string | null;
  alasan_tolak: string | null;
  transaksi_id: number | null;
  wali_nama: string | null;
}

interface IsiVerifikasi {
  menunggu: MenungguVerifikasi[];
  riwayat: RiwayatVerifikasi[];
}

export default function Bagian() {
  const [tab, setTab] = useState<"verifikasi" | "tunai">("verifikasi");
  const { data: dataV, galat: galatV, sedang: sedangV, muatUlang: muatUlangV } =
    useMuat<IsiVerifikasi>("/api/admin/keuangan/topup-verifikasi");
  const { data, galat, sedang, muatUlang } = useMuat<Isi>("/api/admin/keuangan/topup-tunai");

  const [siswa, setSiswa] = useState<SiswaRingkas | null>(null);
  const [nominal, setNominal] = useState("");
  const [catatan, setCatatan] = useState("");
  const [tolak, setTolak] = useState<{ id: number; alasan: string } | null>(null);
  const [tolakV, setTolakV] = useState<{ id: number; alasan: string } | null>(null);
  const [modalFoto, setModalFoto] = useState<string | null>(null);

  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  const menungguV = dataV?.menunggu ?? [];
  const nilaiMenungguV = menungguV.reduce((a, m) => a + m.nominal_rp, 0);

  async function putusVerifikasi(id: number, aksi: "setujui" | "tolak", alasan?: string) {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api<{ status: string; saldo_rp?: number }>("/api/admin/keuangan/topup-verifikasi", {
      metode: "PATCH", body: { topup_id: id, aksi, alasan },
    });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Aksi verifikasi gagal"); return; }
    setTolakV(null);
    setPesan(
      aksi === "setujui"
        ? `Top-up #${id} disetujui! Saldo siswa berhasil bertambah (saldo sekarang: ${rp(r.data!.saldo_rp ?? 0)}).`
        : `Top-up #${id} ditolak.`);
    await muatUlangV();
  }

  async function minta() {
    if (!siswa) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api<{ permintaan_id: number }>("/api/admin/keuangan/topup-tunai", {
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
    const r = await api<{ status: string; saldo_rp: number }>("/api/admin/keuangan/topup-tunai", {
      metode: "PATCH", body: { permintaan_id: id, aksi, alasan },
    });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Aksi ditolak"); return; }
    setTolak(null);
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
            Verifikasi bukti transfer orang tua & persetujuan top-up tunai dua orang
          </div>
        </div>
        <div className="right">
          <button
            type="button"
            className="btn"
            onClick={() => {
              void muatUlangV();
              void muatUlang();
            }}
          >
            Muat ulang
          </button>
        </div>
      </div>

      {galat || galatV ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat || galatV}</div> : null}
      {pesan ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 14 }}>{pesan}</div> : null}

      {/* Tab Switcher */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
        <button
          type="button"
          className={`btn ${tab === "verifikasi" ? "pri" : ""}`}
          onClick={() => { setTab("verifikasi"); setPesan(""); }}
          style={{ position: "relative" }}
        >
          📷 Verifikasi Top-Up Ortu
          {menungguV.length > 0 ? (
            <span
              style={{
                marginLeft: 8,
                background: "#ef4444",
                color: "#fff",
                borderRadius: 10,
                padding: "2px 7px",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {menungguV.length}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          className={`btn ${tab === "tunai" ? "pri" : ""}`}
          onClick={() => { setTab("tunai"); setPesan(""); }}
        >
          💵 Top-Up Tunai Petugas (TU)
          {menunggu.length > 0 ? (
            <span
              style={{
                marginLeft: 8,
                background: "#f59e0b",
                color: "#fff",
                borderRadius: 10,
                padding: "2px 7px",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {menunggu.length}
            </span>
          ) : null}
        </button>
      </div>

      {modalFoto ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setModalFoto(null)}
        >
          <div
            style={{
              background: "#fff",
              padding: 16,
              borderRadius: 12,
              maxWidth: 650,
              width: "100%",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <b style={{ fontSize: 16 }}>Pratinjau Bukti Pembayaran / Transfer</b>
              <button type="button" className="btn sm" onClick={() => setModalFoto(null)}>✕ Tutup</button>
            </div>
            <div style={{ overflow: "auto", maxHeight: "75vh", textAlign: "center", background: "#f1f5f9", borderRadius: 8, padding: 8 }}>
              <img
                src={modalFoto}
                alt="Bukti pembayaran"
                style={{ maxWidth: "100%", height: "auto", borderRadius: 6, display: "inline-block" }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {tab === "verifikasi" ? (
        <>
          <div className="kpis">
            <Tile
              label="Menunggu Verifikasi"
              value={menungguV.length}
              valueStyle={menungguV.length > 0 ? { color: "var(--crit-text, #ef4444)" } : undefined}
              sub={menungguV.length > 0 ? "membutuhkan pengecekan mutasi bank" : "tidak ada antrean"}
            />
            <Tile label="Total Nilai Menunggu" value={rp(nilaiMenungguV)} />
          </div>

          <Panel
            judul="Permintaan Top-Up Menunggu Verifikasi"
            sub={sedangV ? "memuat…" : `${menungguV.length} permintaan siap diverifikasi`}
          >
            {tolakV ? (
              <div className="a-err" style={{ marginBottom: 16, padding: 14, borderRadius: 10 }}>
                <div className="field">
                  <label className="f" htmlFor="tkv-alasan" style={{ fontWeight: 600 }}>Alasan Penolakan Top-Up (akan dikirim ke orang tua)</label>
                  <input
                    id="tkv-alasan"
                    type="text"
                    maxLength={200}
                    value={tolakV.alasan}
                    style={{ width: "100%", maxWidth: 500, marginTop: 4 }}
                    onChange={e => setTolakV({ ...tolakV, alasan: e.target.value })}
                    placeholder="Contoh: Bukti buram / mutasi rekening belum masuk / nominal tidak cocok"
                  />
                </div>
                <div className="a-aksi" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn danger"
                    disabled={sibuk || tolakV.alasan.trim().length < 3}
                    onClick={() => void putusVerifikasi(tolakV.id, "tolak", tolakV.alasan.trim())}
                  >
                    {sibuk ? "Menolak…" : "Tolak Permintaan"}
                  </button>
                  <button type="button" className="btn" onClick={() => setTolakV(null)}>Batal</button>
                </div>
              </div>
            ) : null}

            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Siswa</th>
                    <th className="num">Nominal</th>
                    <th>Bukti Pembayaran</th>
                    <th>Wali Murid</th>
                    <th>Waktu Request</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {menungguV.map(m => (
                    <tr key={m.id}>
                      <td>
                        <b>{m.nama}</b> <span className="kls">{m.kelas ?? m.nis}</span>
                        <br />
                        <span className="p-note">Saldo saat ini: {rp(m.saldo_sekarang_rp)}</span>
                        {m.catatan_wali ? (
                          <div style={{ marginTop: 4, fontStyle: "italic", fontSize: 12.5, color: "#475569" }}>
                            &ldquo;{m.catatan_wali}&rdquo;
                          </div>
                        ) : null}
                      </td>
                      <td className="num">
                        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--brand-pri, #10b981)" }}>
                          {rp(m.nominal_rp)}
                        </span>
                      </td>
                      <td>
                        {m.bukti_foto ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <img
                              src={m.bukti_foto}
                              alt="Bukti"
                              style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer" }}
                              onClick={() => setModalFoto(m.bukti_foto)}
                            />
                            <button
                              type="button"
                              className="btn sm"
                              style={{ fontSize: 12 }}
                              onClick={() => setModalFoto(m.bukti_foto)}
                            >
                              🔍 Lihat Bukti
                            </button>
                          </div>
                        ) : (
                          <span className="p-note">Tidak ada foto</span>
                        )}
                      </td>
                      <td>
                        <b>{m.wali_nama ?? "—"}</b>
                        {m.wali_wa ? <><br /><span className="p-note">{m.wali_wa}</span></> : null}
                      </td>
                      <td>{waktuSingkat(m.dibuat)}</td>
                      <td>
                        <div className="a-aksi">
                          <button
                            type="button"
                            className="btn sm pri"
                            disabled={sibuk}
                            onClick={() => void putusVerifikasi(m.id, "setujui")}
                          >
                            ✓ Setujui
                          </button>
                          <button
                            type="button"
                            className="btn sm"
                            style={{ color: "#ef4444" }}
                            disabled={sibuk}
                            onClick={() => {
                              setPesan("");
                              setTolakV({ id: m.id, alasan: "Bukti transfer tidak sesuai atau dana belum masuk" });
                            }}
                          >
                            ✕ Tolak
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {menungguV.length === 0 && !sedangV ? (
                    <tr>
                      <td colSpan={6} className="p-note" style={{ textAlign: "center", padding: 24 }}>
                        🎉 Tidak ada permintaan top-up yang menunggu verifikasi.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <CatatanKaki>
              Sebelum menekan <b>Setujui</b>, pastikan Anda telah mengecek mutasi rekening sekolah dan dana benar-benar sudah masuk.
              Menyetujui akan langsung mencatat transaksi di buku besar (ledger) dan menambah saldo siswa.
            </CatatanKaki>
          </Panel>

          <Panel judul="Riwayat Verifikasi Top-Up Ortu" sub="100 keputusan terakhir">
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Siswa</th>
                    <th className="num">Nominal</th>
                    <th>Bukti</th>
                    <th>Waktu Request</th>
                    <th>Diputus Oleh</th>
                    <th>Status</th>
                    <th>Catatan / Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {(dataV?.riwayat ?? []).map(r => (
                    <tr key={r.id}>
                      <td>
                        <b>{r.nama}</b> <span className="kls">{r.kelas ?? r.nis}</span>
                      </td>
                      <td className="num"><b>{rp(r.nominal_rp)}</b></td>
                      <td>
                        {r.bukti_foto ? (
                          <img
                            src={r.bukti_foto}
                            alt="Bukti"
                            style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4, cursor: "pointer" }}
                            onClick={() => setModalFoto(r.bukti_foto)}
                          />
                        ) : "—"}
                      </td>
                      <td>{waktuSingkat(r.dibuat)}</td>
                      <td>
                        {r.diputus_oleh ?? "—"}
                        {r.diputus_pada ? <><br /><span className="p-note">{waktuSingkat(r.diputus_pada)}</span></> : null}
                      </td>
                      <td>
                        {r.status === "lunas" ? (
                          <Badge warna="good">Lunas (Disetujui)</Badge>
                        ) : r.status === "ditolak" ? (
                          <Badge warna="crit">Ditolak</Badge>
                        ) : (
                          <Badge warna="mute">{r.status}</Badge>
                        )}
                        {r.transaksi_id ? <div className="p-note">Trx #{r.transaksi_id}</div> : null}
                      </td>
                      <td>{r.alasan_tolak ?? r.catatan_wali ?? "—"}</td>
                    </tr>
                  ))}
                  {(dataV?.riwayat ?? []).length === 0 && !sedangV ? (
                    <tr>
                      <td colSpan={7} className="p-note" style={{ textAlign: "center", padding: 20 }}>
                        Belum ada riwayat verifikasi top-up transfer.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : (
        /* Tab Top-Up Tunai Petugas */
        <>
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
        </>
      )}
    </>
  );
}
