"use client";

import { useEffect, useState } from "react";
import CariSiswa, { type SiswaRingkas } from "@/components/CariSiswa";
import { Badge, CatatanKaki, Panel, Tile } from "@/components/ui";
import { api, useMuat, waktuSingkat } from "@/lib/api";
import { rp } from "@/lib/format";

interface AkunSistem {
  jenis: string;
  nama: string;
  saldo_rp: number;
  jumlah_entri: number;
}

interface RekonLog {
  id: number;
  waktu: string;
  total_float_rp: number | null;
  total_kas_rp: number | null;
  total_piutang_rp: number | null;
  total_pendapatan_rp: number | null;
  selisih_rp: number | null;
  jumlah_akun_siswa: number | null;
  keterangan: string | null;
}

interface FloatSiswa {
  total_float_rp: number;
  jumlah_siswa: number;
}

interface IsiRekon {
  log: RekonLog[];
  akun_sistem: AkunSistem[];
  float_siswa?: FloatSiswa;
}

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
  const [tab, setTab] = useState<"verifikasi" | "tunai" | "rekonsiliasi">("verifikasi");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("tab");
      if (p === "rekonsiliasi" || p === "tunai" || p === "verifikasi") {
        setTab(p);
      }
    }
  }, []);

  const { data: dataV, galat: galatV, sedang: sedangV, muatUlang: muatUlangV } =
    useMuat<IsiVerifikasi>("/api/admin/keuangan/topup-verifikasi");
  const { data, galat, sedang, muatUlang } = useMuat<Isi>("/api/admin/keuangan/topup-tunai");
  const { data: dataR, galat: galatR, sedang: sedangR, muatUlang: muatUlangR } =
    useMuat<IsiRekon>("/api/admin/keuangan/rekonsiliasi");

  const [siswa, setSiswa] = useState<SiswaRingkas | null>(null);
  const [nominal, setNominal] = useState("");
  const [catatan, setCatatan] = useState("");
  const [tolak, setTolak] = useState<{ id: number; alasan: string } | null>(null);
  const [tolakV, setTolakV] = useState<{ id: number; alasan: string } | null>(null);
  const [modalFoto, setModalFoto] = useState<string | null>(null);

  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [sedangRekonManual, setSedangRekonManual] = useState(false);

  async function jalankanRekonsiliasi() {
    setSedangRekonManual(true);
    setPesan("");
    setGagal(false);
    try {
      const res = await api<{ selisih_rp?: number; jumlah_akun_siswa?: number; total_float_rp?: number }>(
        "/api/admin/keuangan/rekonsiliasi",
        { metode: "POST" }
      );
      if (res.ok) {
        setPesan(
          `Rekonsiliasi sukses! Selisih kas: ${rp(res.data?.selisih_rp ?? 0)} dari ${res.data?.jumlah_akun_siswa ?? 0} akun siswa diaudit.`
        );
        await muatUlangR();
      } else {
        setGagal(true);
        setPesan(res.pesan || "Gagal rekonsiliasi kas.");
      }
    } catch {
      setGagal(true);
      setPesan("Gagal menghubungi server untuk rekonsiliasi.");
    } finally {
      setSedangRekonManual(false);
    }
  }

  const menungguV = dataV?.menunggu ?? [];
  const nilaiMenungguV = menungguV.reduce((a, m) => a + m.nominal_rp, 0);

  const rekonLogs = dataR?.log ?? [];
  const rekonLogTerakhir = rekonLogs[0] ?? null;
  const akunSistem = dataR?.akun_sistem ?? [];
  const floatSiswa = dataR?.float_siswa;

  const totalKas = akunSistem
    .filter((a) => a.jenis === "kas")
    .reduce((sum, a) => sum + Math.abs(a.saldo_rp), 0);

  const totalPendapatan = akunSistem
    .filter((a) => a.jenis === "pendapatan")
    .reduce((sum, a) => sum + Math.max(0, a.saldo_rp), 0);

  const totalFloat = floatSiswa?.total_float_rp ?? rekonLogTerakhir?.total_float_rp ?? 0;
  const jumlahSiswa = floatSiswa?.jumlah_siswa ?? rekonLogTerakhir?.jumlah_akun_siswa ?? 0;
  const selisihKas = rekonLogTerakhir?.selisih_rp ?? 0;

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
            Verifikasi bukti transfer orang tua, persetujuan top-up tunai dua orang &amp; audit rekonsiliasi kas
          </div>
        </div>
        <div className="right">
          <button
            type="button"
            className="btn"
            onClick={() => {
              void muatUlangV();
              void muatUlang();
              void muatUlangR();
            }}
          >
            Muat ulang
          </button>
        </div>
      </div>

      {galat || galatV || galatR ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat || galatV || galatR}</div> : null}
      {pesan ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 14 }}>{pesan}</div> : null}

      {/* Tab Switcher */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 10, flexWrap: "wrap" }}>
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

        <button
          type="button"
          className={`btn ${tab === "rekonsiliasi" ? "pri" : ""}`}
          onClick={() => { setTab("rekonsiliasi"); setPesan(""); }}
        >
          ⚖️ Rekonsiliasi &amp; Audit Kas
          {dataR?.log?.[0] && (dataR.log[0].selisih_rp ?? 0) !== 0 ? (
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
              Selisih!
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
              background: "var(--surface)",
              color: "var(--ink)",
              border: "1px solid var(--rule)",
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
            <div style={{ overflow: "auto", maxHeight: "75vh", textAlign: "center", background: "var(--surface-sunken)", border: "1px solid var(--rule)", borderRadius: 8, padding: 8 }}>
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
      ) : tab === "tunai" ? (
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
      ) : (
        /* Tab 3: Rekonsiliasi & Audit Kas */
        <>
          <div className="kpis">
            <Tile
              label="Status Keseimbangan Kas"
              value={
                rekonLogTerakhir
                  ? selisihKas === 0
                    ? "Seimbang (Rp 0)"
                    : `Selisih ${rp(selisihKas)}`
                  : "Belum Pernah Sync"
              }
              valueStyle={
                rekonLogTerakhir && selisihKas === 0
                  ? { color: "var(--good-text, #10b981)" }
                  : rekonLogTerakhir
                  ? { color: "var(--crit-text, #ef4444)" }
                  : { color: "var(--warn-text, #f59e0b)" }
              }
              sub={
                rekonLogTerakhir
                  ? selisihKas === 0
                    ? `Audit terakhir: ${waktuSingkat(rekonLogTerakhir.waktu)}`
                    : "Ditemukan perbedaan kas dan ledger"
                  : "Silakan jalankan pencocokan pertama"
              }
            />
            <Tile
              label="Total Float Siswa"
              value={rp(totalFloat)}
              sub={`${jumlahSiswa} dompet santri aktif`}
            />
            <Tile
              label="Total Kas Terhimpun"
              value={rp(totalKas)}
              sub="Payment Gateway & Kas Tunai TU"
            />
            <Tile
              label="Total Omzet Layanan"
              value={rp(totalPendapatan)}
              sub="Kantin, Laundry, Vending"
            />
          </div>

          <Panel
            judul="Pusat Rekonsiliasi Kas & Audit Double-Entry"
            sub="Pencocokan matematis antara saldo kas masuk, omzet layanan, dan uang mengendap siswa (F-15)"
            aksi={
              <button
                type="button"
                className="btn pri"
                disabled={sedangRekonManual || sedangR}
                onClick={() => void jalankanRekonsiliasi()}
              >
                {sedangRekonManual ? "Mencocokkan Ledger…" : "⚖️ Cocokkan Kas Sekarang"}
              </button>
            }
          >
            <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
              Sistem keuangan Semesta Smart Campus menggunakan pembukuan berpasangan (<i>double-entry bookkeeping</i>).
              Setiap kali orang tua atau kasir melakukan top-up, uang dicatat pada akun Kas (aset) dan Dompet Siswa (kewajiban/float).
              Saat kartu di-tap pada terminal kantin, laundry, atau vending, saldo siswa berkurang dan pendapatan unit diakui.
              Rekonsiliasi ini memastikan <b>rumus kekekalan kas terpenuhi</b>: <code>Kas Terhimpun = Float Siswa + Total Omzet Pendapatan</code> tanpa kebocoran saldo.
            </p>
          </Panel>

          <Panel judul="Saldo Buku Besar Akun Sistem" sub="Buku besar kas sekolah & pendapatan masing-masing unit layanan">
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Jenis Akun</th>
                    <th>Nama Akun Ledger</th>
                    <th className="num">Saldo Akumulasi</th>
                    <th className="num">Jumlah Entri Jurnal</th>
                  </tr>
                </thead>
                <tbody>
                  {akunSistem.map((a, idx) => (
                    <tr key={idx}>
                      <td>
                        <Badge warna={a.jenis === "kas" ? "info" : a.jenis === "pendapatan" ? "good" : "mute"}>
                          {a.jenis.toUpperCase()}
                        </Badge>
                      </td>
                      <td><b>{a.nama}</b></td>
                      <td className="num">
                        <b>{rp(Math.abs(a.saldo_rp))}</b>
                        {a.saldo_rp < 0 ? <span className="p-note" style={{ marginLeft: 6 }}>(debit)</span> : null}
                      </td>
                      <td className="num">{a.jumlah_entri} transaksi</td>
                    </tr>
                  ))}
                  <tr style={{ background: "rgba(16, 185, 129, 0.06)" }}>
                    <td><Badge warna="good">KEWAJIBAN</Badge></td>
                    <td><b>Dompet Santri (Total Float Kartu Siswa)</b></td>
                    <td className="num"><b>{rp(totalFloat)}</b></td>
                    <td className="num">{jumlahSiswa} dompet aktif</td>
                  </tr>
                  {akunSistem.length === 0 && !sedangR ? (
                    <tr>
                      <td colSpan={4} className="p-note" style={{ textAlign: "center", padding: 20 }}>
                        Belum ada data buku besar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <CatatanKaki>
              Data saldo di atas ditarik langsung dari view <code>saldo_ledger</code> PostgreSQL yang menghitung agregat riil tabel <code>ledger_entri</code>.
            </CatatanKaki>
          </Panel>

          <Panel judul="Riwayat Audit Rekonsiliasi Kas" sub="30 audit terakhir (cron otomatis malam & manual)">
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Waktu Audit</th>
                    <th className="num">Total Float Siswa</th>
                    <th className="num">Selisih Kas</th>
                    <th className="num">Akun Diaudit</th>
                    <th>Keterangan / Pemicu</th>
                  </tr>
                </thead>
                <tbody>
                  {rekonLogs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <b>{waktuSingkat(log.waktu)}</b>
                      </td>
                      <td className="num">{rp(log.total_float_rp ?? 0)}</td>
                      <td className="num">
                        {log.selisih_rp === 0 ? (
                          <Badge warna="good">Rp 0 (Klop)</Badge>
                        ) : (
                          <Badge warna="crit">{rp(log.selisih_rp ?? 0)}</Badge>
                        )}
                      </td>
                      <td className="num">{log.jumlah_akun_siswa ?? "—"} siswa</td>
                      <td>
                        <span className="p-note">
                          {log.keterangan === "auto malam" ? "🤖 Otomatis (Cron Malam)" : log.keterangan || "Manual Admin"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {rekonLogs.length === 0 && !sedangR ? (
                    <tr>
                      <td colSpan={5} className="p-note" style={{ textAlign: "center", padding: 20 }}>
                        Belum ada riwayat rekonsiliasi yang tercatat.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <CatatanKaki>
              Setiap malam pukul 23:55 WIB sistem otomatis menjalankan <code>rekonsiliasi_malam()</code> untuk mengunci pembukuan harian.
            </CatatanKaki>
          </Panel>
        </>
      )}
    </>
  );
}
