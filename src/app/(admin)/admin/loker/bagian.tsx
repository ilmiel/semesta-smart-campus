"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, CatatanKaki, Panel, Tile } from "@/components/ui";
import CariSiswa, { type SiswaRingkas } from "@/components/CariSiswa";
import { apiAdmin, waktuSingkat } from "@/lib/admin";
import { rp } from "@/lib/format";

/**
 * Loker asrama.
 *
 * Halaman ini adalah daftar "anak mana tidur di blok mana", jadi server
 * membatasinya ke peran asrama/TU/admin IT/manajemen dan mencatat setiap
 * pembukaannya di audit_log (§8.1) — sama seperti halaman detail siswa.
 * UID kartu sengaja tidak pernah dikirim ke layar ini: nama siswa sudah
 * cukup untuk menelusuri akses, dan UID adalah kredensial pembayaran.
 *
 * Denda loker (F-61) selalu keputusan manusia yang menjadi TAGIHAN untuk
 * orang tua — bukan potongan saldo anak. Anak tidak boleh kehilangan uang
 * jajannya karena keputusan disiplin yang dibuat orang dewasa.
 */

interface Loker {
  id: number; kode: string; blok: string; nomor: number; lokasi: string | null;
  kondisi: string; aktif: boolean; status: "isi" | "kosong" | "rusak";
  siswa_id: number | null; nama: string | null; nis: string | null; kelas: string | null;
  mulai: string | null; akses_terakhir: string | null; gagal_7hari: number;
}
interface Ringkas { blok: string; total: number; isi: number; kosong: number; rusak: number }
interface Akses { waktu: string; loker: string; nama: string | null; berhasil: boolean; alasan: string | null }
interface Isi { peta: Loker[]; ringkas: Ringkas[]; akses_24jam: Akses[] }

type Dialog =
  | { t: "blok" }
  | { t: "tugaskan"; l: Loker }
  | { t: "lepas"; l: Loker }
  | { t: "kondisi"; l: Loker }
  // Loker terisi selalu punya siswa_id: v_loker_peta menandai status "isi"
  // hanya kalau ada penugasan aktif, dan penugasan_loker.siswa_id NOT NULL.
  // Dituliskan di tipe supaya invarian itu tidak cuma ada di kepala.
  | { t: "denda"; l: Loker & { siswa_id: number } };

export default function Bagian() {
  const [data, setData] = useState<Isi | null>(null);
  const [galat, setGalat] = useState("");
  const [sedang, setSedang] = useState(true);
  const [blok, setBlok] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  const [formBlok, setFormBlok] = useState({ blok: "", dari: "1", sampai: "", lokasi: "", device_kode: "" });
  const [catatan, setCatatan] = useState("");
  const [kondisi, setKondisi] = useState("baik");
  const [nominal, setNominal] = useState("");
  const [pilihSiswa, setPilihSiswa] = useState<SiswaRingkas | null>(null);

  const urut = useRef(0);
  const muat = useCallback(async () => {
    const punyaku = ++urut.current;
    setSedang(true);
    const r = await apiAdmin<Isi>(`/api/admin/loker${blok ? `?blok=${encodeURIComponent(blok)}` : ""}`);
    if (punyaku !== urut.current) return;
    setSedang(false);
    if (!r.ok) { setGalat(r.pesan ?? "Gagal memuat peta loker"); return; }
    setGalat(""); setData(r.data!);
  }, [blok]);

  useEffect(() => { void muat(); }, [muat]);

  function buka(d: Dialog) {
    setPesan(""); setGagal(false); setCatatan(""); setNominal(""); setPilihSiswa(null);
    if (d.t === "kondisi") setKondisi(d.l.kondisi);
    setDialog(d);
  }

  async function kirim(body: Record<string, unknown>, sukses: string) {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await apiAdmin("/api/admin/loker", { metode: "POST", body });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Aksi ditolak"); return; }
    setDialog(null); setPesan(sukses);
    await muat();
  }

  const peta = data?.peta ?? [];
  const total = data?.ringkas.reduce((a, r) => a + r.total, 0) ?? 0;
  const isi = data?.ringkas.reduce((a, r) => a + r.isi, 0) ?? 0;
  const rusak = data?.ringkas.reduce((a, r) => a + r.rusak, 0) ?? 0;
  const gagalBanyak = peta.filter(l => l.gagal_7hari >= 3);

  return (
    <>
      <div className="top">
        <div>
          <h1>Loker</h1>
          <div className="sub">Peta loker asrama, penugasan, kondisi, dan denda.</div>
        </div>
        <div className="right">
          <button type="button" className="btn" onClick={() => void muat()}>Muat ulang</button>
          <button type="button" className="btn pri" onClick={() => { setPesan(""); setDialog({ t: "blok" }); }}>
            + Buat blok
          </button>
        </div>
      </div>

      {galat ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div> : null}
      {pesan && !dialog ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 14 }}>{pesan}</div> : null}

      <div className="kpis">
        <Tile label="Loker" value={total} sub={`${data?.ringkas.length ?? 0} blok`} />
        <Tile label="Terpakai" value={isi} sub={total > 0 ? `${Math.round((isi / total) * 100)}% dari total` : undefined} />
        <Tile label="Rusak / perbaikan" value={rusak}
          valueStyle={rusak > 0 ? { color: "var(--crit-text)" } : undefined}
          sub={rusak > 0 ? "tidak bisa ditugaskan" : "tidak ada"} />
        <Tile label="Sering gagal buka" value={gagalBanyak.length}
          sub={gagalBanyak.length > 0 ? "≥3 kegagalan dalam 7 hari" : "tidak ada"}
          valueStyle={gagalBanyak.length > 0 ? { color: "var(--warn-text)" } : undefined} />
      </div>

      {dialog ? (
        <Panel judul={judul(dialog)}>
          {dialog.t === "blok" ? (
            <>
              <div className="a-form">
                <div className="field">
                  <label className="f" htmlFor="b-blok">Blok</label>
                  <input id="b-blok" type="text" maxLength={5} value={formBlok.blok}
                    onChange={e => setFormBlok({ ...formBlok, blok: e.target.value.toUpperCase() })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="b-dari">Nomor dari</label>
                  <input id="b-dari" type="number" min={1} value={formBlok.dari}
                    onChange={e => setFormBlok({ ...formBlok, dari: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="b-sampai">Sampai</label>
                  <input id="b-sampai" type="number" min={1} max={999} value={formBlok.sampai}
                    onChange={e => setFormBlok({ ...formBlok, sampai: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="b-lokasi">Lokasi</label>
                  <input id="b-lokasi" type="text" maxLength={80} value={formBlok.lokasi}
                    onChange={e => setFormBlok({ ...formBlok, lokasi: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="b-device">Kode terminal pembaca (opsional)</label>
                  <input id="b-device" type="text" maxLength={20} value={formBlok.device_kode}
                    onChange={e => setFormBlok({ ...formBlok, device_kode: e.target.value.toUpperCase() })} />
                </div>
              </div>
              <Aksi sibuk={sibuk} label="Buat loker"
                nonaktif={!formBlok.blok.trim() || !formBlok.sampai}
                onKlik={() => void kirim({
                  aksi: "blok", blok: formBlok.blok.trim(), dari: Number(formBlok.dari),
                  sampai: Number(formBlok.sampai), lokasi: formBlok.lokasi.trim() || undefined,
                  device_kode: formBlok.device_kode.trim() || undefined,
                }, `Blok ${formBlok.blok} dibuat.`)}
                onBatal={() => setDialog(null)} />
            </>
          ) : dialog.t === "tugaskan" ? (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
                Loker <b>{dialog.l.kode}</b>. Cari siswanya, lalu tugaskan.
              </p>
              <CariSiswa terpilih={pilihSiswa} onPilih={setPilihSiswa} autoFocus />
              <div className="field" style={{ marginTop: 10 }}>
                <label className="f" htmlFor="t-catatan">Catatan (opsional)</label>
                <input id="t-catatan" type="text" maxLength={200} value={catatan} style={{ width: "100%", maxWidth: 460 }}
                  onChange={e => setCatatan(e.target.value)} />
              </div>
              <Aksi sibuk={sibuk} label="Tugaskan" nonaktif={!pilihSiswa}
                onKlik={() => void kirim({
                  aksi: "tugaskan", loker: dialog.l.kode, siswa_id: pilihSiswa!.id,
                  catatan: catatan.trim() || undefined,
                }, `${dialog.l.kode} ditugaskan ke ${pilihSiswa!.nama}.`)}
                onBatal={() => setDialog(null)} />
            </>
          ) : dialog.t === "lepas" ? (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
                Lepas <b>{dialog.l.kode}</b> dari <b>{dialog.l.nama}</b>. Kartunya berhenti membuka
                loker ini seketika. Pastikan isinya sudah dikosongkan.
              </p>
              <div className="field">
                <label className="f" htmlFor="l-alasan">Alasan (tercatat di audit)</label>
                <input id="l-alasan" type="text" maxLength={200} value={catatan} style={{ width: "100%", maxWidth: 460 }}
                  onChange={e => setCatatan(e.target.value)} placeholder="mis. pindah kamar / akhir tahun ajaran" />
              </div>
              <Aksi sibuk={sibuk} bahaya label="Lepas loker"
                onKlik={() => void kirim({ aksi: "lepas", loker: dialog.l.kode, alasan: catatan.trim() || undefined },
                  `${dialog.l.kode} dilepas.`)}
                onBatal={() => setDialog(null)} />
            </>
          ) : dialog.t === "kondisi" ? (
            <>
              <div className="a-form">
                <div className="field">
                  <label className="f" htmlFor="k-kondisi">Kondisi</label>
                  <select id="k-kondisi" value={kondisi} onChange={e => setKondisi(e.target.value)}>
                    <option value="baik">baik</option>
                    <option value="rusak">rusak</option>
                    <option value="perbaikan">sedang diperbaiki</option>
                  </select>
                </div>
                <div className="field">
                  <label className="f" htmlFor="k-catatan">Catatan</label>
                  <input id="k-catatan" type="text" maxLength={200} value={catatan}
                    onChange={e => setCatatan(e.target.value)} />
                </div>
              </div>
              {kondisi !== "baik" && dialog.l.status === "isi" ? (
                <div className="a-err" style={{ marginTop: 10 }}>
                  Loker ini sedang dipakai <b>{dialog.l.nama}</b>. Menandainya rusak tidak melepas
                  penugasannya — barang siswa masih di dalam. Lepas dulu kalau isinya harus dipindah.
                </div>
              ) : null}
              <Aksi sibuk={sibuk} label="Simpan kondisi"
                onKlik={() => void kirim({ aksi: "kondisi", loker: dialog.l.kode, kondisi, catatan: catatan.trim() || undefined },
                  `Kondisi ${dialog.l.kode} disimpan.`)}
                onBatal={() => setDialog(null)} />
            </>
          ) : (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
                Denda untuk <b>{dialog.l.nama}</b> atas loker <b>{dialog.l.kode}</b>.
              </p>
              <div className="a-form">
                <div className="field">
                  <label className="f" htmlFor="d-nominal">Nominal (Rp)</label>
                  <input id="d-nominal" type="number" min={1} value={nominal}
                    onChange={e => setNominal(e.target.value)} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="d-alasan">Alasan</label>
                  <input id="d-alasan" type="text" maxLength={200} value={catatan}
                    onChange={e => setCatatan(e.target.value)} placeholder="mis. pintu rusak karena dipaksa" />
                </div>
              </div>
              <div className="a-ok" style={{ marginTop: 10 }}>
                Ini menjadi <b>tagihan untuk orang tua</b>, bukan potongan saldo anak. Uang jajan
                siswa tidak berkurang karena keputusan disiplin.
              </div>
              <Aksi sibuk={sibuk} bahaya label="Terbitkan tagihan"
                nonaktif={Number(nominal) < 1 || catatan.trim().length < 3}
                onKlik={() => void kirim({
                  aksi: "denda", loker: dialog.l.kode, siswa_id: dialog.l.siswa_id,
                  nominal_rp: Number(nominal), alasan: catatan.trim(),
                }, `Tagihan ${rp(Number(nominal))} diterbitkan.`)}
                onBatal={() => setDialog(null)} />
            </>
          )}
          {pesan ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginTop: 10 }}>{pesan}</div> : null}
        </Panel>
      ) : null}

      <Panel judul="Peta loker" sub={sedang ? "memuat…" : `${peta.length} loker`}
        aksi={
          <select aria-label="Saring blok" value={blok} onChange={e => setBlok(e.target.value)}>
            <option value="">semua blok</option>
            {(data?.ringkas ?? []).map(r => (
              <option key={r.blok} value={r.blok}>Blok {r.blok} — {r.isi}/{r.total} terpakai</option>
            ))}
          </select>
        }>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Kode</th><th>Lokasi</th><th>Status</th><th>Dipakai</th><th>Akses terakhir</th>
                <th className="num">Gagal 7 hari</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {peta.map(l => (
                <tr key={l.id}>
                  <td className="mono"><b>{l.kode}</b></td>
                  <td>{l.lokasi ?? "—"}</td>
                  <td>{
                    l.status === "isi" ? <Badge warna="good">terisi</Badge>
                      : l.status === "rusak" ? <Badge warna="crit">{l.kondisi}</Badge>
                        : <Badge warna="mute">kosong</Badge>
                  }</td>
                  <td>{l.nama ? <>{l.nama} <span className="kls">{l.kelas ?? l.nis}</span><br />
                    <span className="p-note">sejak {waktuSingkat(l.mulai)}</span></> : "—"}</td>
                  <td>{waktuSingkat(l.akses_terakhir)}</td>
                  <td className="num" style={l.gagal_7hari >= 3 ? { color: "var(--warn-text)", fontWeight: 700 } : undefined}>
                    {l.gagal_7hari}
                  </td>
                  <td>
                    <div className="a-aksi">
                      {l.status === "isi" ? (
                        <>
                          <button type="button" className="btn sm" onClick={() => buka({ t: "lepas", l })}>Lepas</button>
                          <button type="button" className="btn sm"
                            onClick={() => { if (l.siswa_id !== null) buka({ t: "denda", l: { ...l, siswa_id: l.siswa_id } }); }}>
                            Denda
                          </button>
                        </>
                      ) : l.status === "kosong" ? (
                        <button type="button" className="btn sm" onClick={() => buka({ t: "tugaskan", l })}>Tugaskan</button>
                      ) : null}
                      <button type="button" className="btn sm" onClick={() => buka({ t: "kondisi", l })}>Kondisi</button>
                    </div>
                  </td>
                </tr>
              ))}
              {peta.length === 0 && !sedang ? (
                <tr><td colSpan={7} className="p-note">Belum ada loker. Buat blok dulu.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <CatatanKaki>
          Loker berkondisi rusak atau sedang diperbaiki tidak bisa ditugaskan sampai kondisinya
          dikembalikan ke baik. Kolom &ldquo;gagal 7 hari&rdquo; menghitung kartu yang ditolak pembaca —
          angka yang terus naik di loker yang sama biasanya berarti pembacanya, bukan kartunya.
        </CatatanKaki>
      </Panel>

      <Panel judul="Akses 24 jam terakhir" sub={`${data?.akses_24jam.length ?? 0} kejadian`}>
        <div className="tw">
          <table>
            <thead><tr><th>Waktu</th><th>Loker</th><th>Siswa</th><th>Hasil</th></tr></thead>
            <tbody>
              {(data?.akses_24jam ?? []).slice(0, 50).map((a, i) => (
                <tr key={i}>
                  <td>{waktuSingkat(a.waktu)}</td>
                  <td className="mono">{a.loker}</td>
                  <td>{a.nama ?? <span className="p-note">kartu tidak dikenal</span>}</td>
                  <td>{a.berhasil
                    ? <Badge warna="good">terbuka</Badge>
                    : <><Badge warna="crit">ditolak</Badge> {a.alasan ? <span className="p-note"> {a.alasan}</span> : null}</>}</td>
                </tr>
              ))}
              {(data?.akses_24jam ?? []).length === 0 && !sedang ? (
                <tr><td colSpan={4} className="p-note">Belum ada akses tercatat.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <CatatanKaki>
          UID kartu sengaja tidak ditampilkan di sini — nama siswa sudah cukup untuk menelusuri
          akses, dan UID adalah kredensial pembayaran.
        </CatatanKaki>
      </Panel>
    </>
  );
}

function judul(d: Dialog): string {
  switch (d.t) {
    case "blok": return "Buat blok loker";
    case "tugaskan": return `Tugaskan ${d.l.kode}`;
    case "lepas": return `Lepas ${d.l.kode}`;
    case "kondisi": return `Kondisi ${d.l.kode}`;
    case "denda": return `Denda loker ${d.l.kode}`;
  }
}

function Aksi({ label, onKlik, onBatal, sibuk, nonaktif, bahaya }: {
  label: string; onKlik: () => void; onBatal: () => void;
  sibuk: boolean; nonaktif?: boolean; bahaya?: boolean;
}) {
  return (
    <div className="a-aksi" style={{ marginTop: 12 }}>
      <button type="button" className={bahaya ? "btn danger" : "btn pri"} disabled={sibuk || nonaktif} onClick={onKlik}>
        {sibuk ? "Memproses…" : label}
      </button>
      <button type="button" className="btn" onClick={onBatal}>Batal</button>
    </div>
  );
}
