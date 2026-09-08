"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, CatatanKaki, Panel, Tile } from "@/components/ui";
import { api, useMuat } from "@/lib/api";
import { rp } from "@/lib/format";
import { ambilKunci, hapusKunci, simpanKunci } from "@/lib/terminal";

interface DeviceItem {
  id: number;
  kode: string;
  nama: string;
  layanan: string;
  lokasi: string | null;
  aktif: boolean;
  status: "online" | "terputus" | "offline" | "nonaktif";
  terakhir_online: string | null;
}

interface SiswaItem {
  id: number;
  nis: string;
  nama: string;
  kelas: string | null;
  jenjang: string;
  status: string;
  kartu: string;
  saldo_rp: number | null;
  limit_harian_rp: number | null;
  pin_ada: boolean;
  pin_terkunci: boolean;
}

interface WaliItem {
  id: number;
  nama: string;
  hubungan: string | null;
  whatsapp: string | null;
  email: string | null;
  utama: boolean;
  anak: { id: number; nis: string; nama: string; kelas: string | null }[];
}

interface DataAkses {
  device: DeviceItem[];
  siswa: SiswaItem[];
  wali: WaliItem[];
}

const RUTE_TERMINAL: Record<string, string> = {
  kantin: "/terminal/kasir",
  laundry: "/terminal/laundry",
  perpustakaan: "/terminal/perpus",
  perpus: "/terminal/perpus",
  vending: "/terminal/vending",
};

export default function BagianAkses() {
  const { data, galat, sedang, muatUlang } = useMuat<DataAkses>("/api/admin/akses/data");
  const [tab, setTab] = useState<"terminal" | "siswa" | "ortu">("terminal");

  // Terminal state
  const [kunciBrowser, setKunciBrowser] = useState<string | null>(null);
  const [sibukKunci, setSibukKunci] = useState<string | null>(null);

  // Filter state
  const [cariSiswa, setCariSiswa] = useState("");
  const [cariWali, setCariWali] = useState("");

  // Impersonasi state
  const [memproses, setMemproses] = useState(false);
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);

  useEffect(() => {
    setKunciBrowser(ambilKunci());
  }, []);

  async function hubungkanDanBukaTerminal(d: DeviceItem) {
    const rute = RUTE_TERMINAL[d.layanan];
    if (!rute) {
      alert(`Terminal ${d.kode} belum memiliki antarmuka layar tersendiri.`);
      return;
    }

    setSibukKunci(d.kode);
    setPesan("");
    setGagal(false);

    const r = await api<{ kode: string; kunci: string }>("/api/admin/akses/terminal-kunci", {
      metode: "POST",
      body: { kode: d.kode },
    });
    setSibukKunci(null);

    if (!r.ok || !r.data?.kunci) {
      setGagal(true);
      setPesan(r.pesan ?? "Gagal menghubungkan terminal");
      return;
    }

    simpanKunci(r.data.kunci);
    setKunciBrowser(r.data.kunci);
    setPesan(`Kunci terminal ${d.kode} berhasil dipasang ke browser ini. Membuka terminal…`);

    // Buka antarmuka terminal di tab baru dengan kunci otomatis
    window.open(`${rute}?kunci=${encodeURIComponent(r.data.kunci)}`, "_blank");
    await muatUlang();
  }

  function bukaTerminalLangsung(d: DeviceItem) {
    const rute = RUTE_TERMINAL[d.layanan];
    if (!rute) {
      alert(`Terminal ${d.kode} belum memiliki antarmuka layar.`);
      return;
    }
    window.open(rute, "_blank");
  }

  function kosongkanKunciBrowser() {
    hapusKunci();
    setKunciBrowser(null);
    setPesan("Kunci perangkat browser telah dikosongkan.");
  }

  async function mulaiImpersonasi(tipe: "siswa" | "ortu", id: number, nama: string) {
    if (memproses) return;
    setMemproses(true);
    setPesan(`Mengaktifkan mode pengecekan untuk ${nama}…`);
    setGagal(false);

    try {
      const r = await fetch("/api/admin/akses/impersonasi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipe, id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) {
        setGagal(true);
        setPesan(j?.pesan ?? "Gagal mengaktifkan mode pengecekan");
        setMemproses(false);
        return;
      }
      // Pindah ke portal sasaran
      const targetUrl = j?.data?.redirect || j?.redirect || (tipe === "siswa" ? "/siswa" : "/ortu");
      window.location.href = targetUrl;
    } catch {
      setGagal(true);
      setPesan("Gagal menghubungi server");
      setMemproses(false);
    }
  }

  const siswaTersaring = useMemo(() => {
    const daftar = data?.siswa ?? [];
    if (!cariSiswa.trim()) return daftar;
    const q = cariSiswa.toLowerCase();
    return daftar.filter(s => s.nama.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q) || (s.kelas && s.kelas.toLowerCase().includes(q)));
  }, [data?.siswa, cariSiswa]);

  const waliTersaring = useMemo(() => {
    const daftar = data?.wali ?? [];
    if (!cariWali.trim()) return daftar;
    const q = cariWali.toLowerCase();
    return daftar.filter(w =>
      w.nama.toLowerCase().includes(q) ||
      (w.email && w.email.toLowerCase().includes(q)) ||
      (w.whatsapp && w.whatsapp.toLowerCase().includes(q)) ||
      w.anak.some(a => a.nama.toLowerCase().includes(q) || a.nis.includes(q))
    );
  }, [data?.wali, cariWali]);

  return (
    <>
      <div className="top">
        <div>
          <h1>Login &amp; Terminal</h1>
          <div className="sub">
            Akses cepat terminal dan investigasi kendala portal akun siswa &amp; orang tua (khusus Admin IT &amp; TU).
          </div>
        </div>
        <div className="right">
          <button type="button" className="btn" onClick={() => void muatUlang()}>
            Muat ulang data
          </button>
        </div>
      </div>

      {pesan ? (
        <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 14 }}>
          {pesan}
        </div>
      ) : null}

      {galat ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div> : null}

      {/* Tab Navigasi */}
      <div className="tabs-nav">
        <button
          type="button"
          className={`tab-btn ${tab === "terminal" ? "aktif" : ""}`}
          onClick={() => setTab("terminal")}
        >
          <span>⌸</span> Terminal Layanan ({data?.device.length ?? 0})
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "siswa" ? "aktif" : ""}`}
          onClick={() => setTab("siswa")}
        >
          <span>👤</span> Akun Siswa ({data?.siswa.length ?? 0})
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "ortu" ? "aktif" : ""}`}
          onClick={() => setTab("ortu")}
        >
          <span>👨‍👩‍👧</span> Akun Orang Tua ({data?.wali.length ?? 0})
        </button>
      </div>

      {/* TAB 1: TERMINAL */}
      {tab === "terminal" ? (
        <>
          <Panel
            judul="Kunci Perangkat Browser Ini"
            sub="Kunci perangkat yang tersimpan di browser ini untuk mengakses API terminal"
            aksi={
              kunciBrowser ? (
                <button type="button" className="btn sm danger" onClick={kosongkanKunciBrowser}>
                  Hapus Kunci Browser
                </button>
              ) : null
            }
          >
            {kunciBrowser ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span className="badge good">Tersambung</span>
                <code className="mono" style={{ background: "var(--grid)", padding: "4px 8px", borderRadius: 6 }}>
                  {kunciBrowser.slice(0, 10)}••••••••••••••••••••••••••••{kunciBrowser.slice(-6)}
                </code>
                <span className="p-note">
                  Terminal di tab lain akan memakai kunci ini untuk transaksi.
                </span>
              </div>
            ) : (
              <p className="p-note" style={{ margin: 0 }}>
                Belum ada kunci terminal yang dipasang di browser ini. Klik tombol <b>&quot;Hubungkan Otomatis &amp; Buka&quot;</b> pada salah satu terminal di bawah untuk mengisinya secara otomatis.
              </p>
            )}
          </Panel>

          <Panel judul="Daftar Terminal Layanan" sub="Buka atau uji langsung antarmuka operasional terminal di browser Anda">
            {sedang && !data ? (
              <p className="p-note">Memuat daftar terminal…</p>
            ) : (
              <div className="row3" style={{ marginTop: 6 }}>
                {(data?.device ?? []).map(d => {
                  const rute = RUTE_TERMINAL[d.layanan];
                  return (
                    <div key={d.id} className="tile" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div className="lbl">{d.layanan.toUpperCase()}</div>
                          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 2 }}>{d.nama}</div>
                        </div>
                        <Badge warna={d.aktif ? (d.status === "online" ? "good" : "warn") : "crit"}>
                          {d.status}
                        </Badge>
                      </div>

                      <div className="p-note" style={{ margin: "2px 0 8px" }}>
                        Kode: <code className="mono">{d.kode}</code> {d.lokasi ? `· ${d.lokasi}` : ""}
                      </div>

                      <div style={{ marginTop: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn sm pri"
                          disabled={sibukKunci === d.kode}
                          onClick={() => void hubungkanDanBukaTerminal(d)}
                          title="Buat kunci baru & pasang ke browser, lalu buka terminal"
                        >
                          {sibukKunci === d.kode ? "Menghubungkan…" : "⚡ Hubungkan & Buka"}
                        </button>
                        {rute ? (
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => bukaTerminalLangsung(d)}
                            title="Buka tampilan layar terminal langsung"
                          >
                            Buka Layar ↗
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <CatatanKaki>
              Tombol <b>&quot;⚡ Hubungkan &amp; Buka&quot;</b> memperbarui kunci terminal di server dan memasang kuncinya seketika di browser ini sehingga terminal siap pakai tanpa perlu menyalin token manual.
            </CatatanKaki>
          </Panel>
        </>
      ) : null}

      {/* TAB 2: AKUN SISWA */}
      {tab === "siswa" ? (
        <Panel
          judul="Pengecekan Akun Siswa"
          sub="Cari siswa untuk masuk ke portal /siswa dan memeriksa saldo, limit, riwayat, buku perpus, &amp; PO makanan"
        >
          <div className="filters" style={{ marginBottom: 14 }}>
            <input
              type="search"
              placeholder="Cari siswa berdasarkan nama, NIS, atau kelas…"
              value={cariSiswa}
              onChange={e => setCariSiswa(e.target.value)}
              style={{ minWidth: 280, maxWidth: 440 }}
            />
            <span className="count">{siswaTersaring.length} siswa</span>
          </div>

          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>NIS &amp; Nama</th>
                  <th>Kelas</th>
                  <th>Status</th>
                  <th className="num">Saldo</th>
                  <th className="num">Limit Harian</th>
                  <th>Kartu</th>
                  <th>PIN</th>
                  <th style={{ textAlign: "right" }}>Aksi Pengecekan</th>
                </tr>
              </thead>
              <tbody>
                {siswaTersaring.slice(0, 50).map(s => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.nama}</b>
                      <div className="p-note mono">{s.nis}</div>
                    </td>
                    <td>{s.kelas ?? s.jenjang}</td>
                    <td>
                      <Badge warna={s.status === "aktif" ? "good" : "warn"}>{s.status}</Badge>
                    </td>
                    <td className="num">{rp(s.saldo_rp ?? 0)}</td>
                    <td className="num">{rp(s.limit_harian_rp ?? 0)}</td>
                    <td>
                      <Badge warna={s.kartu === "aktif" ? "good" : s.kartu === "belum" ? "mute" : "crit"}>
                        {s.kartu}
                      </Badge>
                    </td>
                    <td>
                      {s.pin_terkunci ? (
                        <Badge warna="crit">terkunci</Badge>
                      ) : s.pin_ada ? (
                        <Badge warna="good">aktif</Badge>
                      ) : (
                        <Badge warna="mute">belum</Badge>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn sm pri"
                        disabled={memproses}
                        onClick={() => void mulaiImpersonasi("siswa", s.id, s.nama)}
                        title="Buka portal /siswa sebagai siswa ini"
                      >
                        Buka sebagai Siswa ↗
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Menekan tombol <b>&quot;Buka sebagai Siswa&quot;</b> akan mengaktifkan sesi peninjauan admin dan membawa Anda langsung ke portal <code>/siswa</code>. Banner pengingat di atas portal memungkinkan Anda kembali ke admin kapan saja.
          </CatatanKaki>
        </Panel>
      ) : null}

      {/* TAB 3: AKUN ORANG TUA */}
      {tab === "ortu" ? (
        <Panel
          judul="Pengecekan Akun Orang Tua (Wali)"
          sub="Cari orang tua untuk masuk ke portal /ortu dan memeriksa tampilan invoice top-up, limit anak, &amp; tagihan"
        >
          <div className="filters" style={{ marginBottom: 14 }}>
            <input
              type="search"
              placeholder="Cari wali berdasarkan nama wali, email, WhatsApp, atau nama anak…"
              value={cariWali}
              onChange={e => setCariWali(e.target.value)}
              style={{ minWidth: 280, maxWidth: 440 }}
            />
            <span className="count">{waliTersaring.length} wali</span>
          </div>

          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Nama Wali</th>
                  <th>Hubungan</th>
                  <th>Email Login Portal</th>
                  <th>WhatsApp</th>
                  <th>Anak yang Diwalikan</th>
                  <th style={{ textAlign: "right" }}>Aksi Pengecekan</th>
                </tr>
              </thead>
              <tbody>
                {waliTersaring.slice(0, 50).map(w => (
                  <tr key={w.id}>
                    <td>
                      <b>{w.nama}</b>
                      {w.utama ? <span style={{ marginLeft: 6 }}><Badge warna="info">utama</Badge></span> : null}
                    </td>
                    <td>{w.hubungan || "wali"}</td>
                    <td className="mono">{w.email || <span className="p-note">belum diisi</span>}</td>
                    <td className="mono">{w.whatsapp || "—"}</td>
                    <td>
                      {w.anak.length === 0 ? (
                        <span className="p-note">tidak ada</span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {w.anak.map(a => (
                            <span key={a.id} style={{ fontSize: 12 }}>
                              • <b>{a.nama}</b> ({a.nis} · {a.kelas ?? "tanpa kelas"})
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn sm pri"
                        disabled={memproses}
                        onClick={() => void mulaiImpersonasi("ortu", w.id, w.nama)}
                        title="Buka portal /ortu sebagai orang tua ini"
                      >
                        Buka sebagai Ortu ↗
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Menekan tombol <b>&quot;Buka sebagai Ortu&quot;</b> akan mengaktifkan sesi peninjauan admin dan membawa Anda langsung ke portal <code>/ortu</code>. Anda dapat melihat persis informasi tagihan dan saldo yang dilihat orang tua.
          </CatatanKaki>
        </Panel>
      ) : null}
    </>
  );
}
