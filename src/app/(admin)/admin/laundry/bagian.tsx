"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, CatatanKaki, Panel } from "@/components/ui";
import { api, useMuat, waktuSingkat } from "@/lib/api";
import { rp } from "@/lib/format";

/**
 * Laundry asrama — order berjalan, tunggakan, tarif, dan daftar rak.
 *
 * Batas berat per order TIDAK diatur di sini: `laundry_maks_kg` dan
 * `laundry_min_kg` adalah kebijakan global, diubah di halaman Kebijakan,
 * dan dibaca ulang setiap terminal menyusun tiket.
 *
 * Rak di halaman ini adalah SARAN untuk terminal, bukan pembatas. Petugas
 * tetap boleh mengetik rak yang tidak ada dalam daftar — asrama sering
 * memakai rak sementara, dan sistem tidak boleh menghentikan pekerjaan yang
 * sedang berjalan hanya karena daftarnya belum diperbarui.
 */

interface Order {
  id: number; kode: string; status: string; siswa_id: number; nama: string; kelas: string | null;
  berat_kg: string | number | null; express: boolean; total_rp: number; rak: string | null;
  dibuat: string; siap_pada: string | null; petugas: string | null; item: string | null;
}
interface Tunggakan { id: number; kode: string; nama: string; total_rp: number; rak: string | null; siap_pada: string; hari_menunggu: number }
interface Tarif { id: number; kode: string; nama: string; jenis: string; harga_rp: number; aktif: boolean }
interface Rak { kode: string; lokasi: string | null; aktif: boolean; urutan: number }

interface Isi {
  aktif: Order[]; tunggakan: Tunggakan[]; tarif: Tarif[]; rak: Rak[];
  selesai_terakhir: { id: number; kode: string; nama: string; total_rp: number; diambil_pada: string }[];
}

export default function Bagian() {
  const { data, galat, sedang, muatUlang } = useMuat<Isi>("/api/admin/laundry");
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [rakBaru, setRakBaru] = useState({ kode: "", lokasi: "", urutan: "" });
  const [tarifUbah, setTarifUbah] = useState<Tarif | null>(null);
  const [pindah, setPindah] = useState<{ o: Order; rak: string } | null>(null);

  async function kirim(body: unknown) {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api("/api/admin/laundry", { metode: "POST", body });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Aksi ditolak"); return false; }
    await muatUlang();
    return true;
  }

  const d = data;

  return (
    <>
      <div className="top">
        <div>
          <h1>Laundry</h1>
          <div className="sub">
            Batas berat per order diatur di <Link href="/admin/kebijakan">Kebijakan</Link> (laundry_min_kg,
            laundry_maks_kg), bukan di sini.
          </div>
        </div>
        <div className="right">
          <button type="button" className="btn" onClick={() => void muatUlang()}>Muat ulang</button>
        </div>
      </div>

      {galat ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div> : null}
      {pesan ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 12 }}>{pesan}</div> : null}
      {sedang && !d ? <p className="p-note">Memuat data laundry…</p> : null}

      {pindah ? (
        <Panel judul={`Tandai siap — ${pindah.o.kode}`}>
          <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
            Cucian <b>{pindah.o.nama}</b> ditandai siap diambil. Isi rak tempat cucian disimpan
            supaya petugas jaga bisa menemukannya tanpa bertanya.
          </p>
          <div className="field">
            <label className="f" htmlFor="p-rak">Rak</label>
            <input id="p-rak" list="rak-tersedia" value={pindah.rak} style={{ maxWidth: 260 }}
              onChange={e => setPindah({ ...pindah, rak: e.target.value.toUpperCase() })} />
            <datalist id="rak-tersedia">
              {(d?.rak ?? []).filter(r => r.aktif).map(r => <option key={r.kode} value={r.kode}>{r.lokasi ?? ""}</option>)}
            </datalist>
          </div>
          <div className="a-aksi">
            <button type="button" className="btn pri" disabled={sibuk}
              onClick={async () => {
                if (await kirim({ aksi: "status", order_id: pindah.o.id, status: "siap", rak: pindah.rak.trim() || undefined })) setPindah(null);
              }}>{sibuk ? "Menyimpan…" : "Tandai siap"}</button>
            <button type="button" className="btn" onClick={() => setPindah(null)}>Batal</button>
          </div>
        </Panel>
      ) : null}

      <Panel judul="Order berjalan" sub={d ? `${d.aktif.length} order` : "memuat…"}>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Kode</th><th>Siswa</th><th>Isi</th><th>Status</th><th>Rak</th>
                <th className="num">Total</th><th>Petugas</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {(d?.aktif ?? []).map(o => (
                <tr key={o.id}>
                  <td className="mono">{o.kode}<br /><span className="p-note">{waktuSingkat(o.dibuat)}</span></td>
                  <td>{o.nama} <span className="kls">{o.kelas ?? "—"}</span></td>
                  <td>{o.item ?? (o.berat_kg ? `${o.berat_kg} kg` : "—")}{o.express ? <> · <Badge warna="warn">express</Badge></> : null}</td>
                  <td><Badge warna={o.status === "siap" ? "good" : o.status === "diproses" ? "info" : "mute"}>{o.status}</Badge></td>
                  <td className="mono">{o.rak ?? "—"}</td>
                  <td className="num">{rp(o.total_rp)}</td>
                  <td>{o.petugas ?? "—"}</td>
                  <td>
                    <div className="a-aksi">
                      {o.status === "diterima" ? (
                        <button type="button" className="btn sm" disabled={sibuk}
                          onClick={() => void kirim({ aksi: "status", order_id: o.id, status: "diproses" })}>Mulai proses</button>
                      ) : null}
                      {o.status !== "siap" ? (
                        <button type="button" className="btn sm" onClick={() => setPindah({ o, rak: o.rak ?? "" })}>Tandai siap</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {d && d.aktif.length === 0 ? <tr><td colSpan={8} className="p-note">Tidak ada order berjalan.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <CatatanKaki>
          Status <b>diambil</b> tidak bisa disetel dari sini — order berpindah ke sana hanya
          lewat pembayaran di terminal, supaya tidak ada cucian yang tercatat diambil tanpa
          transaksi. Pembatalan juga tidak disediakan di layar ini karena wajib beralasan;
          minta lewat terminal.
        </CatatanKaki>
      </Panel>

      {d && d.tunggakan.length > 0 ? (
        <Panel judul="Sudah siap tapi belum diambil" sub="melewati batas hari di kebijakan">
          <div className="tw">
            <table>
              <thead><tr><th>Kode</th><th>Siswa</th><th>Rak</th><th className="num">Total</th><th className="num">Menunggu</th></tr></thead>
              <tbody>
                {d.tunggakan.map(t => (
                  <tr key={t.id}>
                    <td className="mono">{t.kode}</td><td>{t.nama}</td>
                    <td className="mono">{t.rak ?? "—"}</td>
                    <td className="num">{rp(t.total_rp)}</td>
                    <td className="num" style={{ color: "var(--warn-text)", fontWeight: 700 }}>{t.hari_menunggu} hari</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <div className="row2">
        <Panel judul="Rak" sub="saran untuk terminal — ketik bebas tetap diterima">
          <div className="a-form">
            <div className="field">
              <label className="f" htmlFor="r-kode">Kode rak</label>
              <input id="r-kode" type="text" value={rakBaru.kode} placeholder="A-01"
                onChange={e => setRakBaru({ ...rakBaru, kode: e.target.value.toUpperCase() })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="r-lokasi">Lokasi</label>
              <input id="r-lokasi" type="text" value={rakBaru.lokasi} placeholder="Asrama Putra lantai 1"
                onChange={e => setRakBaru({ ...rakBaru, lokasi: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="r-urutan">Urutan</label>
              <input id="r-urutan" type="number" min={0} value={rakBaru.urutan}
                onChange={e => setRakBaru({ ...rakBaru, urutan: e.target.value })} />
            </div>
          </div>
          <div className="a-aksi" style={{ marginTop: 10 }}>
            <button type="button" className="btn pri" disabled={sibuk || rakBaru.kode.trim().length < 1}
              onClick={async () => {
                const ok = await kirim({
                  aksi: "rak", kode: rakBaru.kode.trim(),
                  lokasi: rakBaru.lokasi.trim() || undefined,
                  urutan: rakBaru.urutan === "" ? undefined : Number(rakBaru.urutan),
                });
                if (ok) setRakBaru({ kode: "", lokasi: "", urutan: "" });
              }}>Simpan rak</button>
          </div>

          <div className="tw" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Kode</th><th>Lokasi</th><th className="num">Urutan</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>
                {(d?.rak ?? []).map(r => (
                  <tr key={r.kode}>
                    <td className="mono"><b>{r.kode}</b></td>
                    <td>{r.lokasi ?? "—"}</td>
                    <td className="num">{r.urutan}</td>
                    <td>{r.aktif ? <Badge warna="good">dipakai</Badge> : <Badge warna="mute">disembunyikan</Badge>}</td>
                    <td>
                      <button type="button" className="btn sm" disabled={sibuk}
                        onClick={() => void kirim({ aksi: "rak", kode: r.kode, lokasi: r.lokasi ?? undefined, aktif: !r.aktif, urutan: r.urutan })}>
                        {r.aktif ? "Sembunyikan" : "Pakai lagi"}
                      </button>
                    </td>
                  </tr>
                ))}
                {d && d.rak.length === 0 ? <tr><td colSpan={5} className="p-note">Belum ada rak terdaftar.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Menyembunyikan rak tidak mengubah order yang sudah tersimpan di rak itu — hanya
            menghilangkannya dari saran terminal.
          </CatatanKaki>
        </Panel>

        <Panel judul="Tarif">
          {tarifUbah ? (
            <>
              <div className="a-form">
                <div className="field">
                  <label className="f" htmlFor="t-nama">Nama</label>
                  <input id="t-nama" type="text" value={tarifUbah.nama}
                    onChange={e => setTarifUbah({ ...tarifUbah, nama: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="t-harga">Harga (Rp)</label>
                  <input id="t-harga" type="number" min={1} value={tarifUbah.harga_rp}
                    onChange={e => setTarifUbah({ ...tarifUbah, harga_rp: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="t-aktif">Status</label>
                  <select id="t-aktif" value={tarifUbah.aktif ? "1" : "0"}
                    onChange={e => setTarifUbah({ ...tarifUbah, aktif: e.target.value === "1" })}>
                    <option value="1">aktif</option><option value="0">nonaktif</option>
                  </select>
                </div>
              </div>
              <div className="a-aksi" style={{ marginTop: 10 }}>
                <button type="button" className="btn pri" disabled={sibuk || tarifUbah.harga_rp < 100}
                  onClick={async () => {
                    const ok = await kirim({
                      aksi: "tarif", kode: tarifUbah.kode, nama: tarifUbah.nama,
                      jenis: tarifUbah.jenis, harga_rp: tarifUbah.harga_rp, aktif: tarifUbah.aktif,
                    });
                    if (ok) setTarifUbah(null);
                  }}>Simpan tarif</button>
                <button type="button" className="btn" onClick={() => setTarifUbah(null)}>Batal</button>
              </div>
            </>
          ) : null}

          <div className="tw" style={{ marginTop: tarifUbah ? 12 : 0 }}>
            <table>
              <thead><tr><th>Nama</th><th>Jenis</th><th className="num">Harga</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {(d?.tarif ?? []).map(t => (
                  <tr key={t.id}>
                    <td>{t.nama}<br /><span className="p-note mono">{t.kode}</span></td>
                    <td>{t.jenis}</td>
                    <td className="num">{rp(t.harga_rp)}{t.jenis === "kiloan" ? <span className="p-note"> /kg</span> : null}</td>
                    <td>{t.aktif ? <Badge warna="good">aktif</Badge> : <Badge warna="mute">nonaktif</Badge>}</td>
                    <td><button type="button" className="btn sm" onClick={() => setTarifUbah({ ...t })}>Ubah</button></td>
                  </tr>
                ))}
                {d && d.tarif.length === 0 ? <tr><td colSpan={5} className="p-note">Belum ada tarif.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Mengubah tarif tidak mengubah order yang sudah dibuat — harga dikunci saat tiket
            disusun, supaya nota yang sudah dipegang orang tua tidak berubah sendiri.
          </CatatanKaki>
        </Panel>
      </div>
    </>
  );
}
