"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, CatatanKaki, Panel, Tile } from "@/components/ui";
import { apiAdmin, waktuSingkat } from "@/lib/admin";
import { rp } from "@/lib/format";

/**
 * Perpustakaan: katalog, pinjaman berjalan, dan aturan pinjam.
 *
 * Dua hal yang ditegakkan server dan tercermin di sini:
 *
 *   - Buku SELALU diterima kembali, bahkan kalau saldo siswa kosong (F-71).
 *     Denda keterlambatan menjadi tagihan untuk orang tua kalau tidak
 *     dipotong dari saldo dengan PIN. Tidak ada buku yang ditahan karena
 *     uang — anak tidak boleh berhenti membaca karena tunggakan.
 *   - Membebaskan denda selalu butuh alasan tertulis dan tercatat di audit.
 *     Pembebasan tanpa jejak adalah cara paling mudah uang sekolah hilang
 *     tanpa ada yang bisa menjelaskannya.
 */

interface Pinjaman {
  id: number; siswa_id: number; nama: string; nis: string; kelas: string | null;
  judul: string; pengarang: string | null; barcode: string; rak: string | null;
  dipinjam: string; jatuh_tempo: string; diperpanjang: number;
  hari_telat: number; denda_berjalan_rp: number | null;
}
interface Populer { id: number; judul: string; pengarang: string | null; kategori: string | null; kali_dipinjam: number; dipinjam_30hari: number }
interface Buku {
  id: number; judul: string; pengarang: string | null; kategori: string | null;
  rak: string | null; referensi: boolean; eksemplar: number; tersedia: number;
}
interface Aturan {
  jenjang: string; maks_buku: number; lama_hari: number;
  denda_per_hari: number; maks_denda_rp: number; boleh_perpanjang: number;
}
interface Isi { pinjaman_aktif: Pinjaman[]; populer: Populer[]; katalog: Buku[]; aturan: Aturan[] }

type Dialog =
  | { t: "buku" }
  | { t: "bebaskan"; p: Pinjaman }
  | { t: "hilang"; p: Pinjaman }
  | { t: "aturan"; a: Aturan };

export default function Bagian() {
  const [data, setData] = useState<Isi | null>(null);
  const [galat, setGalat] = useState("");
  const [sedang, setSedang] = useState(true);
  const [cari, setCari] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  const [formBuku, setFormBuku] = useState({
    judul: "", pengarang: "", kategori: "", isbn: "", rak: "",
    referensi: false, jumlah_eksemplar: "1", prefix_barcode: "",
  });
  const [alasan, setAlasan] = useState("");
  const [nominal, setNominal] = useState("");
  const [formAturan, setFormAturan] = useState<Aturan | null>(null);

  const urut = useRef(0);
  const muat = useCallback(async () => {
    const punyaku = ++urut.current;
    setSedang(true);
    const r = await apiAdmin<Isi>(`/api/admin/perpus${cari.trim() ? `?q=${encodeURIComponent(cari.trim())}` : ""}`);
    if (punyaku !== urut.current) return;
    setSedang(false);
    if (!r.ok) { setGalat(r.pesan ?? "Gagal memuat data perpustakaan"); return; }
    setGalat(""); setData(r.data!);
  }, [cari]);

  useEffect(() => {
    const t = setTimeout(() => { void muat(); }, 300);
    return () => clearTimeout(t);
  }, [muat]);

  function buka(d: Dialog) {
    setPesan(""); setGagal(false); setAlasan(""); setNominal("");
    if (d.t === "aturan") setFormAturan({ ...d.a });
    setDialog(d);
  }

  async function kirim(body: Record<string, unknown>, sukses: string) {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await apiAdmin("/api/admin/perpus", { metode: "POST", body });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Aksi ditolak"); return; }
    setDialog(null); setPesan(sukses);
    await muat();
  }

  const pinjaman = data?.pinjaman_aktif ?? [];
  const telat = pinjaman.filter(p => p.hari_telat > 0);
  const dendaTotal = telat.reduce((a, p) => a + (p.denda_berjalan_rp ?? 0), 0);

  return (
    <>
      <div className="top">
        <div>
          <h1>Perpustakaan</h1>
          <div className="sub">Katalog, pinjaman berjalan, dan aturan pinjam per jenjang.</div>
        </div>
        <div className="right">
          <button type="button" className="btn" onClick={() => void muat()}>Muat ulang</button>
          <button type="button" className="btn pri" onClick={() => { setPesan(""); setDialog({ t: "buku" }); }}>
            + Tambah buku
          </button>
        </div>
      </div>

      {galat ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div> : null}
      {pesan && !dialog ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 14 }}>{pesan}</div> : null}

      <div className="kpis">
        <Tile label="Judul di katalog" value={data?.katalog.length ?? 0}
          sub={cari.trim() ? "hasil pencarian" : "maksimal 200 ditampilkan"} />
        <Tile label="Sedang dipinjam" value={pinjaman.length} />
        <Tile label="Terlambat" value={telat.length}
          valueStyle={telat.length > 0 ? { color: "var(--warn-text)" } : undefined}
          sub={telat.length > 0 ? "buku tetap diterima kembali" : "tidak ada"} />
        <Tile label="Denda berjalan" value={rp(dendaTotal)}
          sub="belum menjadi tagihan sampai buku dikembalikan" />
      </div>

      {dialog ? (
        <Panel judul={judul(dialog)}>
          {dialog.t === "buku" ? (
            <>
              <div className="a-form">
                <div className="field">
                  <label className="f" htmlFor="k-judul">Judul</label>
                  <input id="k-judul" type="text" maxLength={200} value={formBuku.judul}
                    onChange={e => setFormBuku({ ...formBuku, judul: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="k-pengarang">Pengarang</label>
                  <input id="k-pengarang" type="text" maxLength={120} value={formBuku.pengarang}
                    onChange={e => setFormBuku({ ...formBuku, pengarang: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="k-kategori">Kategori</label>
                  <input id="k-kategori" type="text" maxLength={60} value={formBuku.kategori}
                    onChange={e => setFormBuku({ ...formBuku, kategori: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="k-isbn">ISBN</label>
                  <input id="k-isbn" type="text" maxLength={20} value={formBuku.isbn}
                    onChange={e => setFormBuku({ ...formBuku, isbn: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="k-rak">Rak</label>
                  <input id="k-rak" type="text" maxLength={20} value={formBuku.rak}
                    onChange={e => setFormBuku({ ...formBuku, rak: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="k-jumlah">Jumlah eksemplar</label>
                  <input id="k-jumlah" type="number" min={0} max={100} value={formBuku.jumlah_eksemplar}
                    onChange={e => setFormBuku({ ...formBuku, jumlah_eksemplar: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="k-prefix">Awalan barcode</label>
                  <input id="k-prefix" type="text" maxLength={20} value={formBuku.prefix_barcode}
                    onChange={e => setFormBuku({ ...formBuku, prefix_barcode: e.target.value.toUpperCase() })}
                    placeholder="mis. FIK" />
                </div>
                <div className="field">
                  <label className="f" htmlFor="k-ref">Buku referensi</label>
                  <select id="k-ref" value={formBuku.referensi ? "1" : "0"}
                    onChange={e => setFormBuku({ ...formBuku, referensi: e.target.value === "1" })}>
                    <option value="0">bisa dipinjam</option>
                    <option value="1">hanya baca di tempat</option>
                  </select>
                </div>
              </div>
              <div className="p-note" style={{ marginTop: 8 }}>
                Barcode tiap eksemplar dibuat server dari awalan ini — hanya huruf, angka, dan
                tanda hubung. Eksemplar tambahan untuk judul yang sudah ada: tambahkan lagi dengan
                awalan yang sama.
              </div>
              <Aksi sibuk={sibuk} label="Tambahkan"
                nonaktif={formBuku.judul.trim().length < 2 || !/^[A-Za-z0-9-]+$/.test(formBuku.prefix_barcode)}
                onKlik={() => void kirim({
                  aksi: "buku", judul: formBuku.judul.trim(),
                  pengarang: formBuku.pengarang.trim() || undefined,
                  kategori: formBuku.kategori.trim() || undefined,
                  isbn: formBuku.isbn.trim() || undefined,
                  rak: formBuku.rak.trim() || undefined,
                  referensi: formBuku.referensi,
                  jumlah_eksemplar: Number(formBuku.jumlah_eksemplar),
                  prefix_barcode: formBuku.prefix_barcode.trim(),
                }, `${formBuku.judul} ditambahkan.`)}
                onBatal={() => setDialog(null)} />
            </>
          ) : dialog.t === "bebaskan" ? (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
                Bebaskan denda <b>{rp(dialog.p.denda_berjalan_rp ?? 0)}</b> untuk <b>{dialog.p.nama}</b>{" "}
                atas <i>{dialog.p.judul}</i> ({dialog.p.hari_telat} hari terlambat).
              </p>
              <div className="field">
                <label className="f" htmlFor="b-alasan">Alasan (wajib, tercatat di audit)</label>
                <input id="b-alasan" type="text" maxLength={200} value={alasan} style={{ width: "100%", maxWidth: 500 }}
                  onChange={e => setAlasan(e.target.value)}
                  placeholder="mis. siswa sakit, ada surat dari wali kelas" />
              </div>
              <Aksi sibuk={sibuk} label="Bebaskan denda" nonaktif={alasan.trim().length < 5}
                onKlik={() => void kirim({ aksi: "bebaskan", pinjaman_id: dialog.p.id, alasan: alasan.trim() },
                  `Denda ${dialog.p.nama} dibebaskan.`)}
                onBatal={() => setDialog(null)} />
            </>
          ) : dialog.t === "hilang" ? (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
                Tandai <i>{dialog.p.judul}</i> (<span className="mono">{dialog.p.barcode}</span>) hilang.
                Eksemplarnya keluar dari katalog dan pinjamannya ditutup.
              </p>
              <div className="a-form">
                <div className="field">
                  <label className="f" htmlFor="h-nominal">Biaya ganti (Rp)</label>
                  <input id="h-nominal" type="number" min={0} value={nominal}
                    onChange={e => setNominal(e.target.value)} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="h-alasan">Catatan</label>
                  <input id="h-alasan" type="text" maxLength={200} value={alasan}
                    onChange={e => setAlasan(e.target.value)} />
                </div>
              </div>
              <div className="a-ok" style={{ marginTop: 10 }}>
                Biaya ganti menjadi <b>tagihan untuk orang tua</b>, bukan potongan saldo anak.
                Isi 0 kalau sekolah tidak menagih.
              </div>
              <Aksi sibuk={sibuk} bahaya label="Tandai hilang"
                onKlik={() => void kirim({
                  aksi: "hilang", barcode: dialog.p.barcode,
                  nominal_ganti: nominal === "" ? 0 : Number(nominal),
                  alasan: alasan.trim() || undefined,
                }, `${dialog.p.judul} ditandai hilang.`)}
                onBatal={() => setDialog(null)} />
            </>
          ) : formAturan ? (
            <>
              <div className="a-form">
                <div className="field">
                  <label className="f" htmlFor="a-maks">Maksimal buku</label>
                  <input id="a-maks" type="number" min={1} max={20} value={formAturan.maks_buku}
                    onChange={e => setFormAturan({ ...formAturan, maks_buku: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="a-lama">Lama pinjam (hari)</label>
                  <input id="a-lama" type="number" min={1} max={60} value={formAturan.lama_hari}
                    onChange={e => setFormAturan({ ...formAturan, lama_hari: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="a-denda">Denda per hari (Rp)</label>
                  <input id="a-denda" type="number" min={0} value={formAturan.denda_per_hari}
                    onChange={e => setFormAturan({ ...formAturan, denda_per_hari: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="a-maksdenda">Denda maksimal per buku (Rp)</label>
                  <input id="a-maksdenda" type="number" min={0} value={formAturan.maks_denda_rp}
                    onChange={e => setFormAturan({ ...formAturan, maks_denda_rp: Number(e.target.value) })} />
                </div>
              </div>
              <div className="p-note" style={{ marginTop: 8 }}>
                Batas denda per buku itu penting: tanpa batas, buku yang terlupakan sebulan
                menghasilkan tagihan yang tidak masuk akal untuk orang tua — dan yang biasanya
                terjadi berikutnya adalah bukunya tidak pernah dikembalikan sama sekali.
              </div>
              <Aksi sibuk={sibuk} label={`Simpan aturan ${formAturan.jenjang}`}
                nonaktif={formAturan.maks_buku < 1 || formAturan.maks_buku > 20
                  || formAturan.lama_hari < 1 || formAturan.lama_hari > 60
                  || formAturan.denda_per_hari < 0 || formAturan.maks_denda_rp < 0}
                onKlik={() => void kirim({
                  aksi: "aturan", jenjang: formAturan.jenjang, maks_buku: formAturan.maks_buku,
                  lama_hari: formAturan.lama_hari, denda_per_hari: formAturan.denda_per_hari,
                  maks_denda_rp: formAturan.maks_denda_rp,
                }, `Aturan ${formAturan.jenjang} disimpan.`)}
                onBatal={() => setDialog(null)} />
            </>
          ) : null}
          {pesan ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginTop: 10 }}>{pesan}</div> : null}
        </Panel>
      ) : null}

      <Panel judul="Sedang dipinjam" sub={sedang ? "memuat…" : `${pinjaman.length} eksemplar`}>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Buku</th><th>Siswa</th><th>Dipinjam</th><th>Jatuh tempo</th>
                <th className="num">Telat</th><th className="num">Denda berjalan</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {pinjaman.map(p => (
                <tr key={p.id}>
                  <td><b>{p.judul}</b><br /><span className="p-note mono">{p.barcode}</span></td>
                  <td>{p.nama} <span className="kls">{p.kelas ?? p.nis}</span></td>
                  <td>{waktuSingkat(p.dipinjam)}</td>
                  <td>{p.jatuh_tempo}{p.diperpanjang > 0 ? <><br /><span className="p-note">diperpanjang {p.diperpanjang}×</span></> : null}</td>
                  <td className="num">{p.hari_telat > 0
                    ? <span style={{ color: "var(--warn-text)", fontWeight: 700 }}>{p.hari_telat} hari</span>
                    : "—"}</td>
                  <td className="num">{p.denda_berjalan_rp ? rp(p.denda_berjalan_rp) : "—"}</td>
                  <td>
                    <div className="a-aksi">
                      {(p.denda_berjalan_rp ?? 0) > 0 ? (
                        <button type="button" className="btn sm" onClick={() => buka({ t: "bebaskan", p })}>Bebaskan denda</button>
                      ) : null}
                      <button type="button" className="btn sm" onClick={() => buka({ t: "hilang", p })}>Hilang</button>
                    </div>
                  </td>
                </tr>
              ))}
              {pinjaman.length === 0 && !sedang ? (
                <tr><td colSpan={7} className="p-note">Tidak ada pinjaman berjalan.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <CatatanKaki>
          Denda di sini masih berjalan, belum menjadi tagihan — perhitungannya baru dikunci saat
          buku dikembalikan di meja sirkulasi. Buku selalu diterima kembali, bahkan kalau saldo
          siswa kosong.
        </CatatanKaki>
      </Panel>

      <Panel judul="Katalog"
        aksi={
          <input type="search" value={cari} onChange={e => setCari(e.target.value)}
            placeholder="judul, pengarang, atau ISBN" style={{ minWidth: 240 }} />
        }>
        <div className="tw">
          <table>
            <thead><tr><th>Judul</th><th>Pengarang</th><th>Kategori</th><th>Rak</th>
              <th className="num">Eksemplar</th><th>Status</th></tr></thead>
            <tbody>
              {(data?.katalog ?? []).map(b => (
                <tr key={b.id}>
                  <td><b>{b.judul}</b></td>
                  <td>{b.pengarang ?? "—"}</td>
                  <td>{b.kategori ?? "—"}</td>
                  <td className="mono">{b.rak ?? "—"}</td>
                  <td className="num">{b.tersedia}/{b.eksemplar}</td>
                  <td>{b.referensi
                    ? <Badge warna="info">referensi</Badge>
                    : b.tersedia > 0 ? <Badge warna="good">tersedia</Badge> : <Badge warna="warn">habis dipinjam</Badge>}</td>
                </tr>
              ))}
              {(data?.katalog ?? []).length === 0 && !sedang ? (
                <tr><td colSpan={6} className="p-note">
                  {cari.trim() ? "Tidak ada judul yang cocok." : "Katalog masih kosong."}
                </td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="row2">
        <Panel judul="Aturan pinjam" sub="per jenjang">
          <div className="tw">
            <table>
              <thead><tr><th>Jenjang</th><th className="num">Maks buku</th><th className="num">Lama</th>
                <th className="num">Denda/hari</th><th className="num">Maks denda</th><th></th></tr></thead>
              <tbody>
                {(data?.aturan ?? []).map(a => (
                  <tr key={a.jenjang}>
                    <td><b>{a.jenjang === "*" ? "lainnya" : a.jenjang}</b></td>
                    <td className="num">{a.maks_buku}</td>
                    <td className="num">{a.lama_hari} hari</td>
                    <td className="num">{rp(a.denda_per_hari)}</td>
                    <td className="num">{rp(a.maks_denda_rp)}</td>
                    <td><button type="button" className="btn sm" onClick={() => buka({ t: "aturan", a })}>Ubah</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel judul="Paling sering dipinjam" sub="30 hari terakhir">
          <div className="tw">
            <table>
              <thead><tr><th>Judul</th><th>Kategori</th><th className="num">30 hari</th><th className="num">Total</th></tr></thead>
              <tbody>
                {(data?.populer ?? []).slice(0, 12).map(b => (
                  <tr key={b.id}>
                    <td>{b.judul}<br /><span className="p-note">{b.pengarang ?? "—"}</span></td>
                    <td>{b.kategori ?? "—"}</td>
                    <td className="num"><b>{b.dipinjam_30hari}</b></td>
                    <td className="num">{b.kali_dipinjam}</td>
                  </tr>
                ))}
                {(data?.populer ?? []).length === 0 && !sedang ? (
                  <tr><td colSpan={4} className="p-note">Belum ada data peminjaman.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Berguna untuk keputusan pengadaan: judul yang selalu habis dipinjam layak ditambah
            eksemplarnya, bukan diganti judul baru.
          </CatatanKaki>
        </Panel>
      </div>
    </>
  );
}

function judul(d: Dialog): string {
  switch (d.t) {
    case "buku": return "Tambah buku";
    case "bebaskan": return "Bebaskan denda";
    case "hilang": return "Tandai buku hilang";
    case "aturan": return `Aturan pinjam — ${d.a.jenjang === "*" ? "lainnya" : d.a.jenjang}`;
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
