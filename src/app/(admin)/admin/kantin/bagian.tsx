"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, CatatanKaki, Panel, Tile } from "@/components/ui";
import { apiAdmin, waktuSingkat } from "@/lib/admin";
import { rp, ribuan } from "@/lib/format";

/**
 * Kantin: menu, pra-pesan (PO), dan penutupan hari.
 *
 * Sebelumnya halaman ini punya saklar "aktifkan PO" dan toggle aktif/nonaktif
 * per menu yang HANYA mengubah state lokal — layarnya berubah, lalu semuanya
 * kembali saat halaman dimuat ulang. Tombol mati itu jujur; tombol yang
 * berpura-pura berhasil membuat staf mengira menu sudah dinonaktifkan
 * padahal kasir masih menjualnya.
 *
 * Pengaturan PO di sini menulis ke tabel `kebijakan` yang sama dengan halaman
 * Kebijakan — bukan ke tempat lain. Jam PO memang kebijakan sekolah, bukan
 * pengaturan modul; kalau disimpan terpisah, dua layar akan menampilkan dua
 * jam yang berbeda dan tidak ada yang tahu mana yang dipakai server.
 */

interface Menu {
  id: number; nama: string; kategori_id: number | null; kategori: string | null;
  harga_rp: number; aktif: boolean; po_bisa: boolean; foto_url: string | null;
}
interface Kategori { id: number; nama: string; urutan: number }
interface Pesanan {
  id: number; kode: string; status: string; total_rp: number; dipesan_oleh: string | null;
  dibuat: string; diambil_pada: string | null; nama: string; nis: string; item: string | null;
}
interface Dapur { tanggal: string; nama: string; qty: number; nilai_rp: number; jumlah_pesanan: number }
interface Jendela {
  buka: boolean; alasan: string | null;
  jam_buka: string; jam_tutup: string; ambil_mulai: string; ambil_selesai: string;
}
interface Kebijakan { kunci: string; nilai: unknown }

const KUNCI_PO = ["po_aktif", "po_buka", "po_tutup", "po_ambil_mulai", "po_ambil_selesai", "po_tidak_diambil"];

export default function Bagian() {
  const [menu, setMenu] = useState<Menu[]>([]);
  const [kategori, setKategori] = useState<Kategori[]>([]);
  const [pesanan, setPesanan] = useState<Pesanan[]>([]);
  const [dapur, setDapur] = useState<Dapur[]>([]);
  const [jendela, setJendela] = useState<Jendela | null>(null);
  const [po, setPo] = useState<Record<string, string>>({});
  const [poAwal, setPoAwal] = useState<Record<string, string>>({});
  const [galat, setGalat] = useState("");
  const [sedang, setSedang] = useState(true);
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [form, setForm] = useState<null | { id?: number; nama: string; kategori_id: string; harga_rp: string; aktif: boolean; po_bisa: boolean }>(null);
  const [tutupHari, setTutupHari] = useState(false);

  const muat = useCallback(async () => {
    setSedang(true);
    const [m, p, k] = await Promise.all([
      apiAdmin<{ menu: Menu[]; kategori: Kategori[] }>("/api/admin/kantin/menu"),
      apiAdmin<{ pesanan: Pesanan[]; dapur: Dapur[]; jendela: Jendela }>("/api/admin/kantin/po"),
      apiAdmin<{ kebijakan: Kebijakan[] }>("/api/admin/kebijakan"),
    ]);
    setSedang(false);
    const rusak = [m, p, k].find(x => !x.ok);
    if (rusak) { setGalat(rusak.pesan ?? "Gagal memuat data kantin"); return; }
    setGalat("");
    setMenu(m.data!.menu); setKategori(m.data!.kategori);
    setPesanan(p.data!.pesanan); setDapur(p.data!.dapur); setJendela(p.data!.jendela);
    const isi: Record<string, string> = {};
    for (const b of k.data!.kebijakan) {
      if (KUNCI_PO.includes(b.kunci)) isi[b.kunci] = String(b.nilai ?? "");
    }
    setPo(isi); setPoAwal(isi);
  }, []);

  useEffect(() => { void muat(); }, [muat]);

  async function simpanMenu() {
    if (!form) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await apiAdmin("/api/admin/kantin/menu", {
      metode: "POST",
      body: {
        id: form.id, nama: form.nama.trim(),
        kategori_id: form.kategori_id === "" ? undefined : Number(form.kategori_id),
        harga_rp: Number(form.harga_rp), aktif: form.aktif, po_bisa: form.po_bisa,
      },
    });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Gagal menyimpan menu"); return; }
    setForm(null); setPesan("Menu tersimpan.");
    await muat();
  }

  /**
   * Toggle satu kolom boolean pada menu — dikirim ke server, bukan state lokal.
   *
   * Lewat PATCH, bukan POST: POST menegakkan aturan data baru (harga kelipatan
   * Rp 100, nama minimal 2 huruf), dan baris lama belum tentu memenuhinya.
   * Kalau toggle ini lewat POST, menu warisan tidak bisa dihentikan
   * penjualannya — padahal itu justru yang mendesak saat ada masalah.
   */
  async function ubahMenu(m: Menu, ubah: { aktif?: boolean; po_bisa?: boolean }) {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await apiAdmin("/api/admin/kantin/menu", {
      metode: "PATCH", body: { id: m.id, ...ubah },
    });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Gagal mengubah menu"); return; }
    await muat();
  }

  async function simpanPO() {
    const berubah = KUNCI_PO.filter(k => po[k] !== poAwal[k]);
    if (berubah.length === 0) return;
    setSibuk(true); setPesan(""); setGagal(false);
    // Satu permintaan per kunci: kebijakan_set memvalidasi tipe & rentang per
    // kunci, dan pesan penolakannya menyebut kunci mana yang salah. Mengirim
    // sekaligus akan menyembunyikan itu.
    const tersimpan: string[] = [];
    for (const k of berubah) {
      const nilai: unknown = k === "po_aktif" ? po[k] === "true" : po[k];
      const r = await apiAdmin("/api/admin/kebijakan", { metode: "PUT", body: { kunci: k, nilai } });
      if (!r.ok) {
        setSibuk(false); setGagal(true);
        // Penyimpanan tidak atomik: kunci sebelum yang gagal SUDAH tersimpan.
        // Menyebutkannya penting — kalau tidak, orang mengira tidak ada yang
        // berubah lalu mencoba ulang dari keadaan yang sudah bergeser.
        setPesan(
          `${k}: ${r.pesan ?? "ditolak server"}`
          + (tersimpan.length > 0 ? ` — tapi ${tersimpan.join(", ")} sudah tersimpan.` : ""),
        );
        await muat();
        return;
      }
      tersimpan.push(k);
    }
    setSibuk(false); setPesan("Pengaturan PO tersimpan.");
    await muat();
  }

  async function jalankanTutupHari() {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await apiAdmin<Record<string, unknown>>("/api/admin/kantin/po", {
      metode: "POST", body: { aksi: "tutup_hari" },
    });
    setSibuk(false); setTutupHari(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Penutupan gagal"); return; }
    setPesan("Penutupan hari selesai — pesanan yang tidak diambil sudah diproses sesuai kebijakan.");
    await muat();
  }

  const poBerubah = KUNCI_PO.some(k => po[k] !== poAwal[k]);
  const belumDiambil = pesanan.filter(p => p.status === "dibayar").length;
  const totalPO = pesanan.reduce((a, p) => a + (p.status === "dibatalkan" ? 0 : p.total_rp), 0);

  return (
    <>
      <div className="top">
        <div>
          <h1>Kantin</h1>
          <div className="sub">Menu, pra-pesan, dan penutupan hari. Harga di sini yang dipakai terminal kasir.</div>
        </div>
        <div className="right">
          <button type="button" className="btn" onClick={() => void muat()}>Muat ulang</button>
          <button type="button" className="btn pri"
            onClick={() => { setPesan(""); setForm({ nama: "", kategori_id: "", harga_rp: "", aktif: true, po_bisa: true }); }}>
            + Tambah menu
          </button>
        </div>
      </div>

      {galat ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div> : null}
      {pesan ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 14 }}>{pesan}</div> : null}
      {sedang && menu.length === 0 ? <p className="p-note">Memuat data kantin…</p> : null}

      <div className="kpis">
        <Tile label="Menu aktif" value={menu.filter(m => m.aktif).length}
          sub={`${menu.length} total · ${menu.filter(m => m.aktif && m.po_bisa).length} bisa dipra-pesan`} />
        <Tile label="Pesanan PO hari ini" value={pesanan.length}
          sub={belumDiambil > 0 ? `${belumDiambil} belum diambil` : "semua sudah diambil"} />
        <Tile label="Nilai PO hari ini" value={rp(totalPO)} />
        <Tile label="Jendela PO"
          value={jendela?.buka
            ? <span style={{ color: "var(--good-text)" }}>terbuka</span>
            : <span style={{ color: "var(--ink-2)" }}>tertutup</span>}
          sub={jendela?.alasan ?? (jendela ? `${jam(jendela.jam_buka)}–${jam(jendela.jam_tutup)}` : undefined)} />
      </div>

      {form ? (
        <Panel judul={form.id ? `Ubah menu — ${form.nama}` : "Menu baru"}>
          <div className="a-form">
            <div className="field">
              <label className="f" htmlFor="m-nama">Nama</label>
              <input id="m-nama" type="text" maxLength={80} value={form.nama}
                onChange={e => setForm({ ...form, nama: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="m-kat">Kategori</label>
              <select id="m-kat" value={form.kategori_id} onChange={e => setForm({ ...form, kategori_id: e.target.value })}>
                <option value="">tanpa kategori</option>
                {kategori.map(k => <option key={k.id} value={String(k.id)}>{k.nama}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="f" htmlFor="m-harga">Harga (Rp)</label>
              <input id="m-harga" type="number" min={100} step={100} value={form.harga_rp}
                onChange={e => setForm({ ...form, harga_rp: e.target.value })} />
              <div className="p-note" style={{ marginTop: 4 }}>kelipatan Rp 100</div>
            </div>
            <div className="field">
              <label className="f" htmlFor="m-aktif">Dijual</label>
              <select id="m-aktif" value={form.aktif ? "1" : "0"} onChange={e => setForm({ ...form, aktif: e.target.value === "1" })}>
                <option value="1">ya</option><option value="0">tidak</option>
              </select>
            </div>
            <div className="field">
              <label className="f" htmlFor="m-po">Bisa dipra-pesan</label>
              <select id="m-po" value={form.po_bisa ? "1" : "0"} onChange={e => setForm({ ...form, po_bisa: e.target.value === "1" })}>
                <option value="1">ya</option><option value="0">tidak</option>
              </select>
            </div>
          </div>
          <div className="a-aksi" style={{ marginTop: 12 }}>
            <button type="button" className="btn pri"
              disabled={sibuk || form.nama.trim().length < 2 || Number(form.harga_rp) < 100
                || Number(form.harga_rp) % 100 !== 0}
              onClick={() => void simpanMenu()}>{sibuk ? "Menyimpan…" : "Simpan"}</button>
            <button type="button" className="btn" onClick={() => setForm(null)}>Batal</button>
          </div>
          <CatatanKaki>
            Mengubah harga tidak mengubah transaksi yang sudah terjadi — harga dicatat pada
            transaksinya, bukan dibaca ulang dari tabel menu.
          </CatatanKaki>
        </Panel>
      ) : null}

      <Panel judul="Menu" sub={sedang ? "memuat…" : `${menu.length} item`}>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Nama</th><th>Kategori</th><th className="num">Harga</th><th>Dijual</th><th>Pra-pesan</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {menu.map(m => (
                <tr key={m.id}>
                  <td>{m.aktif ? <b>{m.nama}</b> : <span style={{ color: "var(--ink-3)" }}>{m.nama}</span>}</td>
                  <td>{m.kategori ?? "—"}</td>
                  <td className="num">{rp(m.harga_rp)}</td>
                  <td>{m.aktif ? <Badge warna="good">dijual</Badge> : <Badge warna="mute">tidak</Badge>}</td>
                  <td>{m.po_bisa ? <Badge warna="info">bisa</Badge> : <Badge warna="mute">tidak</Badge>}</td>
                  <td>
                    <div className="a-aksi">
                      <button type="button" className="btn sm" onClick={() => {
                        setPesan("");
                        setForm({
                          id: m.id, nama: m.nama, kategori_id: m.kategori_id === null ? "" : String(m.kategori_id),
                          harga_rp: String(m.harga_rp), aktif: m.aktif, po_bisa: m.po_bisa,
                        });
                      }}>Ubah</button>
                      <button type="button" className="btn sm" disabled={sibuk}
                        onClick={() => void ubahMenu(m, { aktif: !m.aktif })}>
                        {m.aktif ? "Hentikan" : "Jual lagi"}
                      </button>
                      <button type="button" className="btn sm" disabled={sibuk}
                        onClick={() => void ubahMenu(m, { po_bisa: !m.po_bisa })}>
                        {m.po_bisa ? "Tutup PO" : "Buka PO"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {menu.length === 0 && !sedang ? <tr><td colSpan={6} className="p-note">Belum ada menu.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <CatatanKaki>
          Menu yang dihentikan langsung hilang dari terminal kasir pada sinkron berikutnya.
          &ldquo;Tutup PO&rdquo; hanya menutup jalur pra-pesan — menunya tetap bisa dibeli langsung di kantin.
        </CatatanKaki>
      </Panel>

      <div className="row2">
        <Panel judul="Pengaturan pra-pesan"
          sub="tersimpan di tabel kebijakan — sama dengan halaman Kebijakan">
          <div className="a-form">
            <div className="field">
              <label className="f" htmlFor="po-aktif">Pra-pesan</label>
              <select id="po-aktif" value={po.po_aktif ?? "true"} onChange={e => setPo({ ...po, po_aktif: e.target.value })}>
                <option value="true">aktif</option><option value="false">nonaktif</option>
              </select>
            </div>
            <div className="field">
              <label className="f" htmlFor="po-buka">Pesan dibuka</label>
              <input id="po-buka" type="time" value={(po.po_buka ?? "").slice(0, 5)}
                onChange={e => setPo({ ...po, po_buka: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="po-tutup">Pesan ditutup</label>
              <input id="po-tutup" type="time" value={(po.po_tutup ?? "").slice(0, 5)}
                onChange={e => setPo({ ...po, po_tutup: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="po-am">Ambil mulai</label>
              <input id="po-am" type="time" value={(po.po_ambil_mulai ?? "").slice(0, 5)}
                onChange={e => setPo({ ...po, po_ambil_mulai: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="po-as">Ambil selesai</label>
              <input id="po-as" type="time" value={(po.po_ambil_selesai ?? "").slice(0, 5)}
                onChange={e => setPo({ ...po, po_ambil_selesai: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="po-td">Kalau tidak diambil</label>
              <select id="po-td" value={po.po_tidak_diambil ?? "tetap_ditagih"}
                onChange={e => setPo({ ...po, po_tidak_diambil: e.target.value })}>
                <option value="tetap_ditagih">tetap ditagih</option>
                <option value="refund">dikembalikan</option>
              </select>
            </div>
          </div>
          <div className="a-aksi" style={{ marginTop: 12 }}>
            <button type="button" className="btn pri" disabled={sibuk || !poBerubah} onClick={() => void simpanPO()}>
              {sibuk ? "Menyimpan…" : "Simpan pengaturan"}
            </button>
            {poBerubah ? <button type="button" className="btn" onClick={() => setPo(poAwal)}>Batal</button> : null}
          </div>
          <CatatanKaki>
            Setelah jam tutup, siswa tidak bisa memesan <b>maupun membatalkan</b> — dapur sudah
            memasak berdasarkan angka itu. Karena itu &ldquo;kalau tidak diambil&rdquo; adalah keputusan
            kebijakan, bukan teknis: pilih <i>refund</i> hanya kalau sekolah bersedia menanggung
            makanan yang terlanjur dimasak.
          </CatatanKaki>
        </Panel>

        <Panel judul="Pra-pesan hari ini"
          sub={jendela ? (jendela.buka ? "jendela terbuka" : jendela.alasan ?? "tertutup") : undefined}
          aksi={<button type="button" className="btn sm" onClick={() => { setPesan(""); setTutupHari(true); }}>Tutup hari</button>}>
          {tutupHari ? (
            <div className="a-err" style={{ marginBottom: 12 }}>
              Penutupan memproses semua pesanan yang belum diambil sesuai kebijakan
              (<b>{po.po_tidak_diambil === "refund" ? "dikembalikan" : "tetap ditagih"}</b>) dan tidak bisa
              dibatalkan. Biasanya ini berjalan otomatis; jalankan manual hanya kalau tugas
              terjadwalnya tidak jalan.
              <div className="a-aksi" style={{ marginTop: 10 }}>
                <button type="button" className="btn danger" disabled={sibuk} onClick={() => void jalankanTutupHari()}>
                  {sibuk ? "Memproses…" : "Ya, tutup hari ini"}
                </button>
                <button type="button" className="btn" onClick={() => setTutupHari(false)}>Batal</button>
              </div>
            </div>
          ) : null}

          {dapur.length > 0 ? (
            <>
              <div className="p-note" style={{ marginBottom: 6 }}>Rekap untuk dapur</div>
              <div className="tw" style={{ marginBottom: 12 }}>
                <table>
                  <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Pesanan</th><th className="num">Nilai</th></tr></thead>
                  <tbody>
                    {dapur.map(d => (
                      <tr key={d.nama}>
                        <td><b>{d.nama}</b></td>
                        <td className="num"><b>{ribuan(d.qty)}</b></td>
                        <td className="num">{d.jumlah_pesanan}</td>
                        <td className="num">{rp(d.nilai_rp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <div className="tw">
            <table>
              <thead><tr><th>Kode</th><th>Siswa</th><th>Isi</th><th>Status</th><th className="num">Total</th></tr></thead>
              <tbody>
                {pesanan.map(p => (
                  <tr key={p.id}>
                    <td className="mono">{p.kode}<br /><span className="p-note">{waktuSingkat(p.dibuat)}</span></td>
                    <td>{p.nama} <span className="kls">{p.nis}</span></td>
                    <td>{p.item ?? "—"}</td>
                    <td>{
                      p.status === "diambil" ? <Badge warna="good">diambil</Badge>
                        : p.status === "dibayar" ? <Badge warna="warn">menunggu diambil</Badge>
                          : <Badge warna="mute">{p.status}</Badge>
                    }</td>
                    <td className="num">{rp(p.total_rp)}</td>
                  </tr>
                ))}
                {pesanan.length === 0 && !sedang ? (
                  <tr><td colSpan={5} className="p-note">Belum ada pra-pesan hari ini.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Pesanan berpindah ke &ldquo;diambil&rdquo; lewat terminal kantin, bukan dari layar ini —
            supaya tidak ada makanan yang tercatat diambil tanpa ada yang mengambilnya.
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
