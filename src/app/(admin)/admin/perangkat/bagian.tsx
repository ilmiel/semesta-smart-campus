"use client";

import { useState } from "react";
import { Badge, CatatanKaki, Panel, type WarnaBadge } from "@/components/ui";
import { apiAdmin, sejak, useMuat } from "@/lib/admin";
import { rp } from "@/lib/format";

/**
 * Terminal terdaftar.
 *
 * Setiap terminal punya kunci sendiri; berada di jaringan sekolah saja tidak
 * memberi akses apa pun. Server hanya menyimpan hash kunci — jadi kunci
 * aslinya ditampilkan SEKALI, saat dibuat atau diganti, dan tidak bisa
 * dilihat lagi. Kalau hilang, jalan satu-satunya adalah ganti kunci.
 *
 * Terminal hilang atau dicuri → "Nonaktifkan". Kuncinya ditolak pada
 * permintaan berikutnya, tanpa perlu menunggu terminal itu online.
 */

interface Device {
  id: number; kode: string; nama: string; layanan: string; lokasi: string | null;
  aktif: boolean; limit_offline_rp: number;
  terakhir_online: string | null; terakhir_sinkron: string | null; versi_terminal: string | null;
  status: "online" | "terputus" | "offline" | "nonaktif";
  antrian_tertunda: number; ditolak_7hari: number; transaksi_hari_ini: number;
}

const LAYANAN = ["kantin", "laundry", "perpustakaan", "vending", "locker", "kelas", "gerbang"] as const;

const KOSONG = { kode: "", nama: "", layanan: "kantin" as string, lokasi: "", limit_offline_rp: "" };

function warnaStatus(s: Device["status"]): WarnaBadge {
  return s === "online" ? "good" : s === "terputus" ? "warn" : s === "offline" ? "warn" : "crit";
}

export default function Bagian() {
  const { data, galat, sedang, muatUlang } = useMuat<{ device: Device[] }>("/api/admin/device");
  const device = data?.device ?? [];

  const [baru, setBaru] = useState<typeof KOSONG | null>(null);
  const [ubah, setUbah] = useState<Device | null>(null);
  // Limit disimpan sebagai teks, bukan angka: Number("") adalah 0, dan 0 di
  // sini berarti "terminal ini tidak boleh bertransaksi saat offline" —
  // bukan "kosongkan". Field yang dikosongkan harus tidak dikirim sama sekali.
  const [ubahLimit, setUbahLimit] = useState("");
  const [konfirm, setKonfirm] = useState<{ d: Device; aksi: "nonaktif" | "aktif" | "ganti_kunci" } | null>(null);
  const [alasan, setAlasan] = useState("");
  const [rahasia, setRahasia] = useState<{ kode: string; kunci: string } | null>(null);
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  function bersih() {
    setBaru(null); setUbah(null); setUbahLimit(""); setKonfirm(null);
    setAlasan(""); setPesan(""); setGagal(false);
  }

  async function daftarkan() {
    if (!baru) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await apiAdmin<{ kode: string; kunci: string }>("/api/admin/device", {
      metode: "POST",
      body: {
        kode: baru.kode.trim(), nama: baru.nama.trim(), layanan: baru.layanan,
        lokasi: baru.lokasi.trim() || undefined,
        limit_offline_rp: baru.limit_offline_rp === "" ? undefined : Number(baru.limit_offline_rp),
      },
    });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Gagal mendaftarkan"); return; }
    setBaru(null);
    setRahasia({ kode: r.data!.kode, kunci: r.data!.kunci });
    await muatUlang();
  }

  async function jalankan(kode: string, body: Record<string, unknown>) {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await apiAdmin<{ kunci?: string }>(`/api/admin/device/${encodeURIComponent(kode)}`, { metode: "POST", body });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Aksi ditolak"); return; }
    if (r.data?.kunci) setRahasia({ kode, kunci: r.data.kunci });
    bersih();
    await muatUlang();
  }

  return (
    <>
      <div className="top">
        <div>
          <h1>Perangkat</h1>
          <div className="sub">
            Setiap terminal punya kunci sendiri — berada di jaringan sekolah saja tidak cukup.
          </div>
        </div>
        <div className="right">
          <button type="button" className="btn" onClick={() => void muatUlang()}>Muat ulang</button>
          <button type="button" className="btn pri" onClick={() => { bersih(); setBaru({ ...KOSONG }); }}>
            + Daftarkan terminal
          </button>
        </div>
      </div>

      {galat ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div> : null}
      {pesan ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 12 }}>{pesan}</div> : null}

      {rahasia ? (
        <Panel judul={`Kunci perangkat ${rahasia.kode}`} sub="hanya ditampilkan sekali">
          <div className="a-rahasia">
            <div style={{ fontWeight: 600, fontSize: 13 }}>Salin sekarang — kunci ini tidak bisa dilihat lagi.</div>
            <code className="nilai">{rahasia.kunci}</code>
            <div className="p-note" style={{ margin: 0 }}>
              Buka halaman terminal di perangkat itu, lalu tempel kunci ini di layar
              &ldquo;pengaturan&rdquo;. Server hanya menyimpan hash-nya, jadi kalau hilang
              satu-satunya jalan adalah Ganti kunci — dan kunci lama langsung mati.
            </div>
          </div>
          <div className="a-aksi" style={{ marginTop: 10 }}>
            <button type="button" className="btn" onClick={() => setRahasia(null)}>Sudah disalin</button>
          </div>
        </Panel>
      ) : null}

      {baru ? (
        <Panel judul="Daftarkan terminal" sub="kode dipakai di log dan tidak bisa diubah setelahnya">
          <div className="a-form">
            <div className="field">
              <label className="f" htmlFor="d-kode">Kode</label>
              <input id="d-kode" type="text" value={baru.kode} placeholder="KASIR-01"
                onChange={e => setBaru({ ...baru, kode: e.target.value.toUpperCase() })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="d-nama">Nama</label>
              <input id="d-nama" type="text" value={baru.nama} placeholder="Kasir Kantin 1"
                onChange={e => setBaru({ ...baru, nama: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="d-layanan">Layanan</label>
              <select id="d-layanan" value={baru.layanan} onChange={e => setBaru({ ...baru, layanan: e.target.value })}>
                {LAYANAN.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="f" htmlFor="d-lokasi">Lokasi</label>
              <input id="d-lokasi" type="text" value={baru.lokasi} placeholder="Kantin lantai 1"
                onChange={e => setBaru({ ...baru, lokasi: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="d-limit">Limit offline (kosong = ikut kebijakan)</label>
              <input id="d-limit" type="number" min={0} value={baru.limit_offline_rp}
                onChange={e => setBaru({ ...baru, limit_offline_rp: e.target.value })} />
            </div>
          </div>
          <div className="p-note" style={{ marginTop: 8 }}>
            Limit offline per terminal tidak boleh melebihi kebijakan global — server menolaknya.
            Terminal vending selalu 0: mesin tidak melayani saat server tidak terjangkau.
          </div>
          <div className="a-aksi" style={{ marginTop: 12 }}>
            <button type="button" className="btn pri"
              disabled={sibuk || baru.kode.trim().length < 3 || baru.nama.trim().length < 2}
              onClick={() => void daftarkan()}>
              {sibuk ? "Mendaftarkan…" : "Daftarkan & buat kunci"}
            </button>
            <button type="button" className="btn" onClick={bersih}>Batal</button>
          </div>
        </Panel>
      ) : null}

      {ubah ? (
        <Panel judul={`Ubah ${ubah.kode}`} sub="kode dan layanan tidak bisa diubah">
          <div className="a-form">
            <div className="field">
              <label className="f" htmlFor="u-nama">Nama</label>
              <input id="u-nama" type="text" value={ubah.nama}
                onChange={e => setUbah({ ...ubah, nama: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="u-lokasi">Lokasi</label>
              <input id="u-lokasi" type="text" value={ubah.lokasi ?? ""}
                onChange={e => setUbah({ ...ubah, lokasi: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="u-limit">Limit offline</label>
              <input id="u-limit" type="number" min={0} value={ubahLimit}
                placeholder="kosong = ikut kebijakan"
                onChange={e => setUbahLimit(e.target.value)} />
            </div>
          </div>
          <div className="a-aksi" style={{ marginTop: 12 }}>
            <button type="button" className="btn pri" disabled={sibuk}
              onClick={() => void jalankan(ubah.kode, {
                aksi: "ubah", nama: ubah.nama, lokasi: ubah.lokasi ?? undefined,
                limit_offline_rp: ubahLimit.trim() === "" ? undefined : Number(ubahLimit),
              })}>
              {sibuk ? "Menyimpan…" : "Simpan"}
            </button>
            <button type="button" className="btn" onClick={bersih}>Batal</button>
          </div>
        </Panel>
      ) : null}

      {konfirm ? (
        <Panel judul={
          konfirm.aksi === "nonaktif" ? `Nonaktifkan ${konfirm.d.kode}?`
            : konfirm.aksi === "aktif" ? `Aktifkan kembali ${konfirm.d.kode}?`
              : `Ganti kunci ${konfirm.d.kode}?`
        }>
          <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
            {konfirm.aksi === "nonaktif" ? (
              <>Kunci terminal ini ditolak mulai permintaan berikutnya. Transaksi yang masih
                mengantre di terminal itu <b>tidak akan bisa disinkronkan</b> — kalau terminalnya
                sekadar rusak dan bukan hilang, sinkronkan dulu sebelum menonaktifkan.</>
            ) : konfirm.aksi === "aktif" ? (
              <>Kunci lama berlaku lagi. Kalau perangkatnya hilang dan tidak ditemukan,
                jangan aktifkan — daftarkan terminal baru.</>
            ) : (
              <>Kunci lama <b>langsung tidak berlaku</b>. Terminal itu berhenti bekerja sampai
                kunci baru dimasukkan ke layar pengaturannya. Lakukan saat kamu berada di depan
                perangkatnya.</>
            )}
          </p>
          {konfirm.aksi !== "ganti_kunci" ? (
            <div className="field">
              <label className="f" htmlFor="k-alasan">Alasan (tercatat di audit)</label>
              <input id="k-alasan" type="text" value={alasan} onChange={e => setAlasan(e.target.value)}
                style={{ width: "100%", maxWidth: 460 }}
                placeholder={konfirm.aksi === "nonaktif" ? "hilang / rusak / ditarik dari kantin" : "sudah ketemu"} />
            </div>
          ) : null}
          <div className="a-aksi">
            <button type="button" className={konfirm.aksi === "aktif" ? "btn pri" : "btn danger"} disabled={sibuk}
              onClick={() => void jalankan(konfirm.d.kode, {
                aksi: konfirm.aksi, alasan: alasan.trim() || undefined,
              })}>
              {sibuk ? "Memproses…" : "Ya, lanjutkan"}
            </button>
            <button type="button" className="btn" onClick={bersih}>Batal</button>
          </div>
        </Panel>
      ) : null}

      <Panel judul="Terminal terdaftar"
        sub={sedang ? "memuat…" : `${device.filter(d => d.aktif).length} aktif · ${device.filter(d => !d.aktif).length} nonaktif`}>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Kode</th><th>Layanan</th><th>Lokasi</th><th>Status</th><th>Terakhir online</th>
                <th className="num">Limit offline</th><th className="num">Antrian</th>
                <th className="num">Trx hari ini</th><th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {device.map(d => {
                const abu = d.aktif ? undefined : { color: "var(--ink-3)" };
                return (
                  <tr key={d.id}>
                    <td className="mono" style={abu}>{d.aktif ? <b>{d.kode}</b> : d.kode}<br />
                      <span className="p-note">{d.nama}</span></td>
                    <td style={abu}>{d.layanan}</td>
                    <td style={abu}>{d.lokasi ?? "—"}</td>
                    <td><Badge warna={warnaStatus(d.status)}>● {d.status}</Badge></td>
                    <td style={abu}>{sejak(d.terakhir_online)}</td>
                    <td className="num" style={abu}>{rp(d.limit_offline_rp)}</td>
                    <td className="num" style={d.antrian_tertunda > 0 ? { color: "var(--warn-text)", fontWeight: 700 } : abu}>
                      {d.antrian_tertunda}
                      {d.ditolak_7hari > 0 ? <><br /><span className="p-note">{d.ditolak_7hari} ditolak</span></> : null}
                    </td>
                    <td className="num" style={abu}>{d.transaksi_hari_ini}</td>
                    <td>
                      <div className="a-aksi">
                        {d.aktif ? (
                          <>
                            <button type="button" className="btn sm" onClick={() => { bersih(); setUbah(d); setUbahLimit(String(d.limit_offline_rp)); }}>Ubah</button>
                            <button type="button" className="btn sm" onClick={() => { bersih(); setKonfirm({ d, aksi: "ganti_kunci" }); }}>Ganti kunci</button>
                            <button type="button" className="btn sm" onClick={() => { bersih(); setKonfirm({ d, aksi: "nonaktif" }); }}>Nonaktifkan</button>
                          </>
                        ) : (
                          <button type="button" className="btn sm" onClick={() => { bersih(); setKonfirm({ d, aksi: "aktif" }); }}>Aktifkan</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {device.length === 0 && !sedang ? (
                <tr><td colSpan={9} className="p-note">Belum ada terminal terdaftar.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <CatatanKaki>
          Kolom Antrian adalah transaksi offline yang belum disinkronkan terminal, bukan
          kegagalan. Angka &ldquo;ditolak&rdquo; (7 hari terakhir) yang tidak nol perlu ditindaklanjuti
          keuangan — transaksi itu tidak hilang, tapi juga belum masuk saldo siapa pun.
        </CatatanKaki>
      </Panel>
    </>
  );
}
