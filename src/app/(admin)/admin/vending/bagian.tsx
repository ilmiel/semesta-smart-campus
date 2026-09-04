"use client";

import { useState } from "react";
import { Badge, CatatanKaki, Panel, Tile } from "@/components/ui";
import { apiAdmin, useMuat, waktuSingkat } from "@/lib/admin";
import { rp } from "@/lib/format";

/**
 * Mesin vending: mesin, produk, planogram, restock.
 *
 * Sebelumnya halaman ini memilih mesin lewat select yang cuma menukar dua
 * array contoh di memori, dan tombol per slot tidak melakukan apa pun.
 *
 * Dua aturan yang dijaga server dan tercermin di layar ini:
 *
 *   - Produk baru TIDAK muncul di mesin sampai kesiswaan menyetujuinya
 *     (F-115). Ini bukan birokrasi: mesin ini menjual makanan ke anak-anak
 *     yang tinggal di asrama, dan yang memutuskan boleh-tidaknya bukan orang
 *     yang mengisi stok.
 *   - Slot yang sensornya gagal ditandai bermasalah dan berhenti melayani
 *     sampai admin IT memulihkannya setelah cek fisik. Memulihkan tanpa
 *     membuka mesin berarti siswa berikutnya membayar untuk barang yang
 *     memang tersangkut.
 */

interface Slot {
  device: string; mesin: string; slot_id: number; slot: string;
  produk_id: number | null; produk: string | null; harga_rp: number | null;
  stok: number; kapasitas: number; aktif: boolean; bermasalah: boolean;
  disetujui_kesiswaan: boolean | null; bisa_dibeli: boolean;
  terjual_hari_ini: number; selisih_terakhir: number | null;
}
interface Produk {
  id: number; nama: string; harga_rp: number; disetujui_kesiswaan: boolean;
  disetujui_oleh: string | null; aktif: boolean;
}
interface Mesin {
  kode: string; nama: string; lokasi: string | null;
  jam_mulai: string | null; jam_selesai: string | null; selalu_aktif: boolean | null; status: string;
}
interface Gagal {
  transaksi_id: number; device: string; slot: string; produk: string | null;
  mulai: string; alasan_batal: string | null; refund_transaksi_id: number | null;
}
interface Sengketa { id: number; status: string; catatan: string | null; dibuat: string; nama: string; total_rp: number }

interface Isi {
  planogram: Slot[]; produk: Produk[]; mesin: Mesin[];
  gagal_terakhir: Gagal[]; sengketa_menunggu: Sengketa[];
}

export default function Bagian({ peran }: { peran: string[] }) {
  const { data, galat, sedang, muatUlang } = useMuat<Isi>("/api/admin/vending");
  const [pilihMesin, setPilihMesin] = useState<string>("");
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [formProduk, setFormProduk] = useState<null | { id?: number; nama: string; harga_rp: string; aktif: boolean }>(null);
  const [formSlot, setFormSlot] = useState<null | { device: string; slot: string; produk_id: string; kapasitas: string }>(null);
  const [formJam, setFormJam] = useState<null | { kode: string; mulai: string; selesai: string }>(null);
  const [restock, setRestock] = useState<null | { device: string; slot: string; ditambah: string; stok_fisik: string; catatan: string }>(null);
  const [pulihkan, setPulihkan] = useState<null | { device: string; slot: string; catatan: string }>(null);

  const bisaMesin = peran.includes("admin_it");
  const bisaSetujui = peran.includes("kesiswaan");

  const mesin = data?.mesin ?? [];
  const aktifKode = pilihMesin || mesin[0]?.kode || "";
  const slot = (data?.planogram ?? []).filter(s => s.device === aktifKode);

  async function kirim(body: Record<string, unknown>, sukses: string) {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await apiAdmin("/api/admin/vending", { metode: "POST", body });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Aksi ditolak"); return false; }
    setPesan(sukses);
    await muatUlang();
    return true;
  }

  const menunggu = (data?.produk ?? []).filter(p => !p.disetujui_kesiswaan);
  const bermasalah = (data?.planogram ?? []).filter(s => s.bermasalah);

  return (
    <>
      <div className="top">
        <div>
          <h1>Vending</h1>
          <div className="sub">
            Mesin, produk, dan isi tiap slot. Produk hanya muncul di mesin setelah disetujui kesiswaan.
          </div>
        </div>
        <div className="right">
          <button type="button" className="btn" onClick={() => void muatUlang()}>Muat ulang</button>
          <button type="button" className="btn pri"
            onClick={() => { setPesan(""); setFormProduk({ nama: "", harga_rp: "", aktif: true }); }}>
            + Produk baru
          </button>
        </div>
      </div>

      {galat ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div> : null}
      {pesan ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 14 }}>{pesan}</div> : null}
      {sedang && !data ? <p className="p-note">Memuat data vending…</p> : null}

      <div className="kpis">
        <Tile label="Mesin" value={mesin.length}
          sub={`${mesin.filter(m => m.status === "online").length} online`} />
        <Tile label="Slot siap jual" value={(data?.planogram ?? []).filter(s => s.bisa_dibeli).length}
          sub={`${(data?.planogram ?? []).length} slot terkonfigurasi`} />
        <Tile label="Menunggu persetujuan" value={menunggu.length}
          sub={menunggu.length > 0 ? "belum bisa dijual" : "tidak ada"}
          valueStyle={menunggu.length > 0 ? { color: "var(--warn-text)" } : undefined} />
        <Tile label="Slot bermasalah" value={bermasalah.length}
          sub={bermasalah.length > 0 ? "butuh cek fisik" : "tidak ada"}
          valueStyle={bermasalah.length > 0 ? { color: "var(--crit-text)" } : undefined} />
      </div>

      {formProduk ? (
        <Panel judul={formProduk.id ? `Ubah produk — ${formProduk.nama}` : "Produk baru"}>
          <div className="a-form">
            <div className="field">
              <label className="f" htmlFor="p-nama">Nama</label>
              <input id="p-nama" type="text" maxLength={60} value={formProduk.nama}
                onChange={e => setFormProduk({ ...formProduk, nama: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="p-harga">Harga (Rp)</label>
              <input id="p-harga" type="number" min={500} value={formProduk.harga_rp}
                onChange={e => setFormProduk({ ...formProduk, harga_rp: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="p-aktif">Status</label>
              <select id="p-aktif" value={formProduk.aktif ? "1" : "0"}
                onChange={e => setFormProduk({ ...formProduk, aktif: e.target.value === "1" })}>
                <option value="1">aktif</option><option value="0">nonaktif</option>
              </select>
            </div>
          </div>
          <div className="a-aksi" style={{ marginTop: 12 }}>
            <button type="button" className="btn pri"
              disabled={sibuk || formProduk.nama.trim().length < 2 || Number(formProduk.harga_rp) < 500}
              onClick={async () => {
                const ok = await kirim({
                  aksi: "produk", id: formProduk.id, nama: formProduk.nama.trim(),
                  harga_rp: Number(formProduk.harga_rp), aktif: formProduk.aktif,
                }, formProduk.id ? "Produk diperbarui." : "Produk dibuat — menunggu persetujuan kesiswaan.");
                if (ok) setFormProduk(null);
              }}>{sibuk ? "Menyimpan…" : "Simpan"}</button>
            <button type="button" className="btn" onClick={() => setFormProduk(null)}>Batal</button>
          </div>
          <CatatanKaki>
            Produk baru selalu mulai tanpa persetujuan. Sampai kesiswaan menyetujuinya, ia bisa
            dipasang ke slot tapi tidak akan dijual mesin.
          </CatatanKaki>
        </Panel>
      ) : null}

      <div className="row2">
        <Panel judul="Mesin" sub="jam layanan ditegakkan server, bukan oleh mesin">
          {formJam ? (
            <div className="a-form" style={{ marginBottom: 12 }}>
              <div className="field">
                <label className="f" htmlFor="j-mulai">Mulai melayani</label>
                <input id="j-mulai" type="time" value={formJam.mulai}
                  onChange={e => setFormJam({ ...formJam, mulai: e.target.value })} />
              </div>
              <div className="field">
                <label className="f" htmlFor="j-selesai">Berhenti melayani</label>
                <input id="j-selesai" type="time" value={formJam.selesai}
                  onChange={e => setFormJam({ ...formJam, selesai: e.target.value })} />
              </div>
              <div className="field">
                <div className="a-aksi">
                  <button type="button" className="btn pri" disabled={sibuk || !formJam.mulai || !formJam.selesai}
                    onClick={async () => {
                      const ok = await kirim({
                        aksi: "mesin", device_kode: formJam.kode,
                        jam_mulai: formJam.mulai, jam_selesai: formJam.selesai,
                      }, `Jam layanan ${formJam.kode} disimpan.`);
                      if (ok) setFormJam(null);
                    }}>Simpan</button>
                  <button type="button" className="btn" onClick={() => setFormJam(null)}>Batal</button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="tw">
            <table>
              <thead><tr><th>Kode</th><th>Lokasi</th><th>Jam</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>
                {mesin.map(m => (
                  <tr key={m.kode}>
                    <td className="mono"><b>{m.kode}</b><br /><span className="p-note">{m.nama}</span></td>
                    <td>{m.lokasi ?? "—"}</td>
                    <td>{m.selalu_aktif ? "24 jam" : m.jam_mulai ? `${jam(m.jam_mulai)}–${jam(m.jam_selesai)}` : <span className="p-note">belum diatur</span>}</td>
                    <td><Badge warna={m.status === "online" ? "good" : m.status === "nonaktif" ? "crit" : "warn"}>● {m.status}</Badge></td>
                    <td>
                      <button type="button" className="btn sm" disabled={!bisaMesin}
                        title={bisaMesin ? undefined : "hanya admin IT"}
                        onClick={() => {
                          setPesan("");
                          setFormJam({ kode: m.kode, mulai: (m.jam_mulai ?? "").slice(0, 5), selesai: (m.jam_selesai ?? "").slice(0, 5) });
                        }}>Atur jam</button>
                    </td>
                  </tr>
                ))}
                {mesin.length === 0 && !sedang ? (
                  <tr><td colSpan={5} className="p-note">
                    Belum ada mesin. Daftarkan terminal berlayanan &ldquo;vending&rdquo; dulu di halaman Perangkat.
                  </td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Di luar jam layanan, server menolak transaksi walaupun mesinnya menyala — jadi
            mesin tidak perlu tahu jam berapa sekarang, dan mengubah jam tidak perlu menyentuh
            mesinnya.
          </CatatanKaki>
        </Panel>

        <Panel judul="Produk" sub={`${(data?.produk ?? []).length} produk · ${menunggu.length} menunggu persetujuan`}>
          <div className="tw">
            <table>
              <thead><tr><th>Nama</th><th className="num">Harga</th><th>Persetujuan</th><th>Aksi</th></tr></thead>
              <tbody>
                {(data?.produk ?? []).map(p => (
                  <tr key={p.id}>
                    <td>{p.aktif ? <b>{p.nama}</b> : <span style={{ color: "var(--ink-3)" }}>{p.nama}</span>}</td>
                    <td className="num">{rp(p.harga_rp)}</td>
                    <td>
                      {p.disetujui_kesiswaan
                        ? <Badge warna="good">disetujui</Badge>
                        : <Badge warna="warn">menunggu</Badge>}
                      {p.disetujui_oleh ? <><br /><span className="p-note">{p.disetujui_oleh}</span></> : null}
                    </td>
                    <td>
                      <div className="a-aksi">
                        <button type="button" className="btn sm" onClick={() => {
                          setPesan("");
                          setFormProduk({ id: p.id, nama: p.nama, harga_rp: String(p.harga_rp), aktif: p.aktif });
                        }}>Ubah</button>
                        <button type="button" className="btn sm" disabled={sibuk || !bisaSetujui}
                          title={bisaSetujui ? undefined : "hanya kesiswaan (F-115)"}
                          onClick={() => void kirim(
                            { aksi: "setujui", produk_id: p.id, setuju: !p.disetujui_kesiswaan },
                            p.disetujui_kesiswaan ? `Persetujuan ${p.nama} dicabut.` : `${p.nama} disetujui.`)}>
                          {p.disetujui_kesiswaan ? "Cabut" : "Setujui"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(data?.produk ?? []).length === 0 && !sedang ? (
                  <tr><td colSpan={4} className="p-note">Belum ada produk.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {!bisaSetujui ? (
            <CatatanKaki>
              Persetujuan produk hanya bisa dilakukan peran <b>kesiswaan</b>. Yang memutuskan boleh
              tidaknya sebuah makanan dijual ke anak asrama bukan orang yang mengisi stoknya.
            </CatatanKaki>
          ) : null}
        </Panel>
      </div>

      <Panel judul="Planogram"
        sub={aktifKode ? `${slot.length} slot di ${aktifKode}` : undefined}
        aksi={mesin.length > 0 ? (
          <select value={aktifKode} onChange={e => setPilihMesin(e.target.value)}>
            {mesin.map(m => <option key={m.kode} value={m.kode}>{m.kode} — {m.nama}</option>)}
          </select>
        ) : null}>

        {formSlot ? (
          <div className="a-form" style={{ marginBottom: 12 }}>
            <div className="field">
              <label className="f" htmlFor="s-slot">Slot</label>
              <input id="s-slot" type="text" maxLength={6} value={formSlot.slot}
                onChange={e => setFormSlot({ ...formSlot, slot: e.target.value.toUpperCase() })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="s-produk">Produk</label>
              <select id="s-produk" value={formSlot.produk_id}
                onChange={e => setFormSlot({ ...formSlot, produk_id: e.target.value })}>
                <option value="">kosongkan slot</option>
                {(data?.produk ?? []).map(p => (
                  <option key={p.id} value={String(p.id)}>
                    {p.nama}{p.disetujui_kesiswaan ? "" : " (belum disetujui)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="f" htmlFor="s-kap">Kapasitas</label>
              <input id="s-kap" type="number" min={1} max={100} value={formSlot.kapasitas}
                onChange={e => setFormSlot({ ...formSlot, kapasitas: e.target.value })} />
            </div>
            <div className="field">
              <div className="a-aksi">
                <button type="button" className="btn pri" disabled={sibuk || formSlot.slot.trim() === ""}
                  onClick={async () => {
                    const ok = await kirim({
                      aksi: "slot", device_kode: formSlot.device, slot: formSlot.slot.trim(),
                      produk_id: formSlot.produk_id === "" ? undefined : Number(formSlot.produk_id),
                      kapasitas: formSlot.kapasitas === "" ? undefined : Number(formSlot.kapasitas),
                    }, `Slot ${formSlot.slot} disimpan.`);
                    if (ok) setFormSlot(null);
                  }}>Simpan slot</button>
                <button type="button" className="btn" onClick={() => setFormSlot(null)}>Batal</button>
              </div>
            </div>
          </div>
        ) : null}

        {restock ? (
          <div className="a-form" style={{ marginBottom: 12 }}>
            <div className="field">
              <label className="f" htmlFor="r-tambah">Ditambah (batang/botol)</label>
              <input id="r-tambah" type="number" min={0} max={100} value={restock.ditambah}
                onChange={e => setRestock({ ...restock, ditambah: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="r-fisik">Stok fisik terhitung (opsional)</label>
              <input id="r-fisik" type="number" min={0} max={100} value={restock.stok_fisik}
                onChange={e => setRestock({ ...restock, stok_fisik: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="r-catatan">Catatan</label>
              <input id="r-catatan" type="text" maxLength={200} value={restock.catatan}
                onChange={e => setRestock({ ...restock, catatan: e.target.value })} />
            </div>
            <div className="field">
              <div className="a-aksi">
                <button type="button" className="btn pri" disabled={sibuk || restock.ditambah === ""}
                  onClick={async () => {
                    const ok = await kirim({
                      aksi: "restock", device_kode: restock.device, slot: restock.slot,
                      ditambah: Number(restock.ditambah),
                      stok_fisik: restock.stok_fisik === "" ? undefined : Number(restock.stok_fisik),
                      catatan: restock.catatan.trim() || undefined,
                    }, `Slot ${restock.slot} diisi ulang.`);
                    if (ok) setRestock(null);
                  }}>Catat restock</button>
                <button type="button" className="btn" onClick={() => setRestock(null)}>Batal</button>
              </div>
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <div className="p-note">
                Isi <b>stok fisik terhitung</b> kalau kamu menghitung isi slot saat mengisi. Server
                membandingkannya dengan angka yang dicatat sistem dan menyimpan selisihnya —
                selisih yang berulang di slot yang sama biasanya berarti sensor, bukan kehilangan.
              </div>
            </div>
          </div>
        ) : null}

        {pulihkan ? (
          <div className="a-err" style={{ marginBottom: 12 }}>
            Slot <b>{pulihkan.slot}</b> ditandai bermasalah karena sensor pernah gagal mendeteksi
            barang jatuh. Pulihkan hanya setelah kamu <b>membuka mesin dan memastikan tidak ada
            barang tersangkut</b> — kalau tidak, siswa berikutnya membayar untuk barang yang tidak
            keluar.
            <div className="field" style={{ marginTop: 10 }}>
              <label className="f" htmlFor="pl-catatan">Hasil pemeriksaan fisik</label>
              <input id="pl-catatan" type="text" maxLength={200} value={pulihkan.catatan} style={{ width: "100%", maxWidth: 460 }}
                onChange={e => setPulihkan({ ...pulihkan, catatan: e.target.value })}
                placeholder="mis. spiral tersangkut, sudah dibetulkan" />
            </div>
            <div className="a-aksi">
              <button type="button" className="btn danger" disabled={sibuk}
                onClick={async () => {
                  const ok = await kirim({
                    aksi: "pulihkan", device_kode: pulihkan.device, slot: pulihkan.slot,
                    catatan: pulihkan.catatan.trim() || undefined,
                  }, `Slot ${pulihkan.slot} dipulihkan.`);
                  if (ok) setPulihkan(null);
                }}>Sudah dicek — pulihkan</button>
              <button type="button" className="btn" onClick={() => setPulihkan(null)}>Batal</button>
            </div>
          </div>
        ) : null}

        <div className="a-aksi" style={{ marginBottom: 10 }}>
          <button type="button" className="btn sm" disabled={!aktifKode}
            onClick={() => { setPesan(""); setFormSlot({ device: aktifKode, slot: "", produk_id: "", kapasitas: "" }); }}>
            + Tambah / ubah slot
          </button>
        </div>

        <div className="tw">
          <table>
            <thead>
              <tr><th>Slot</th><th>Produk</th><th className="num">Harga</th><th className="num">Stok</th>
                <th className="num">Terjual</th><th>Keadaan</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {slot.map(s => (
                <tr key={s.slot_id}>
                  <td className="mono"><b>{s.slot}</b></td>
                  <td>{s.produk ?? <span className="p-note">kosong</span>}
                    {s.produk && s.disetujui_kesiswaan === false
                      ? <><br /><Badge warna="warn">belum disetujui</Badge></> : null}</td>
                  <td className="num">{s.harga_rp !== null ? rp(s.harga_rp) : "—"}</td>
                  <td className="num">{s.stok}/{s.kapasitas}
                    {s.selisih_terakhir !== null && s.selisih_terakhir !== 0
                      ? <><br /><span className="p-note">selisih {s.selisih_terakhir > 0 ? "+" : ""}{s.selisih_terakhir}</span></> : null}</td>
                  <td className="num">{s.terjual_hari_ini}</td>
                  <td>{
                    s.bermasalah ? <Badge warna="crit">bermasalah</Badge>
                      : !s.aktif ? <Badge warna="mute">nonaktif</Badge>
                        : s.bisa_dibeli ? <Badge warna="good">siap</Badge>
                          : <Badge warna="warn">tidak dijual</Badge>
                  }</td>
                  <td>
                    <div className="a-aksi">
                      <button type="button" className="btn sm" onClick={() => {
                        setPesan("");
                        setFormSlot({
                          device: s.device, slot: s.slot,
                          produk_id: s.produk_id === null ? "" : String(s.produk_id),
                          kapasitas: String(s.kapasitas),
                        });
                      }}>Ubah</button>
                      <button type="button" className="btn sm" onClick={() => {
                        setPesan("");
                        setRestock({ device: s.device, slot: s.slot, ditambah: "", stok_fisik: "", catatan: "" });
                      }}>Restock</button>
                      {s.bermasalah ? (
                        <button type="button" className="btn sm" disabled={!bisaMesin}
                          title={bisaMesin ? undefined : "hanya admin IT setelah cek fisik"}
                          onClick={() => { setPesan(""); setPulihkan({ device: s.device, slot: s.slot, catatan: "" }); }}>
                          Pulihkan
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {slot.length === 0 && !sedang ? (
                <tr><td colSpan={7} className="p-note">Mesin ini belum punya slot terkonfigurasi.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="row2">
        <Panel judul="Transaksi gagal terakhir" sub="sensor tidak mendeteksi barang jatuh">
          <div className="tw">
            <table>
              <thead><tr><th>Waktu</th><th>Mesin</th><th>Slot</th><th>Produk</th><th>Refund</th></tr></thead>
              <tbody>
                {(data?.gagal_terakhir ?? []).slice(0, 15).map(g => (
                  <tr key={g.transaksi_id}>
                    <td>{waktuSingkat(g.mulai)}</td>
                    <td className="mono">{g.device}</td>
                    <td className="mono">{g.slot}</td>
                    <td>{g.produk ?? "—"}{g.alasan_batal ? <><br /><span className="p-note">{g.alasan_batal}</span></> : null}</td>
                    <td>{g.refund_transaksi_id
                      ? <Badge warna="good">#{g.refund_transaksi_id}</Badge>
                      : <Badge warna="warn">tidak ada</Badge>}</td>
                  </tr>
                ))}
                {(data?.gagal_terakhir ?? []).length === 0 && !sedang ? (
                  <tr><td colSpan={5} className="p-note">Tidak ada transaksi gagal.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Uang dikembalikan otomatis saat sensor melapor gagal — kolom refund yang kosong
            berarti pengembaliannya belum terjadi dan perlu diperiksa keuangan.
          </CatatanKaki>
        </Panel>

        <Panel judul="Sengketa menunggu" sub="dilaporkan siswa lewat portal">
          <div className="tw">
            <table>
              <thead><tr><th>Dilaporkan</th><th>Siswa</th><th className="num">Nilai</th><th>Catatan</th></tr></thead>
              <tbody>
                {(data?.sengketa_menunggu ?? []).map(s => (
                  <tr key={s.id}>
                    <td>{waktuSingkat(s.dibuat)}</td>
                    <td>{s.nama}</td>
                    <td className="num">{rp(s.total_rp)}</td>
                    <td>{s.catatan ?? "—"}</td>
                  </tr>
                ))}
                {(data?.sengketa_menunggu ?? []).length === 0 && !sedang ? (
                  <tr><td colSpan={4} className="p-note">Tidak ada sengketa menunggu.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Keputusan sengketa mengembalikan uang sungguhan, jadi tombolnya belum ada di sini —
            menyusul bersama modul keuangan, setelah alur persetujuannya diputuskan.
          </CatatanKaki>
        </Panel>
      </div>
    </>
  );
}

/** "06:00:00" → "06.00" */
function jam(x: string | null | undefined): string {
  if (!x) return "—";
  return x.slice(0, 5).replace(":", ".");
}
