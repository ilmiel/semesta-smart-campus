"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { CatatanKaki, Panel } from "@/components/ui";
import { api, waktuSingkat } from "@/lib/api";

/**
 * Penampil jejak audit.
 *
 * Sampai sekarang audit_log hanya bisa dibaca lewat psql, yang berarti
 * praktis tidak pernah dibaca. Catatan yang tidak pernah dilihat siapa pun
 * memberi rasa aman tanpa memberi keamanan: ia baru berguna kalau ada orang
 * yang benar-benar membukanya saat curiga.
 *
 * Halaman ini sengaja BACA SAJA dan tidak punya tombol apa pun. Tidak ada
 * hapus, tidak ada ubah, tidak ada ekspor sebagian. audit_log adalah catatan
 * yang hanya bertambah; layar yang bisa mengubahnya menghapus seluruh
 * gunanya.
 *
 * `meta` ditampilkan apa adanya. Isinya kadang memuat nilai sebelum dan
 * sesudah suatu perubahan — itulah yang menjawab "berubah dari berapa jadi
 * berapa", pertanyaan yang biasanya muncul beberapa bulan kemudian.
 */

interface Baris {
  id: number; waktu: string; aktor: string; peran: string | null;
  aksi: string; objek: string | null; ip: string | null; meta: unknown;
}

export default function Bagian() {
  const [aktor, setAktor] = useState("");
  const [aksi, setAksi] = useState("");
  const [objek, setObjek] = useState("");
  const [limit, setLimit] = useState("200");
  const [baris, setBaris] = useState<Baris[]>([]);
  const [galat, setGalat] = useState("");
  const [sedang, setSedang] = useState(true);
  const [buka, setBuka] = useState<number | null>(null);

  const urut = useRef(0);
  const muat = useCallback(async () => {
    const punyaku = ++urut.current;
    setSedang(true);
    const p = new URLSearchParams();
    if (aktor.trim()) p.set("aktor", aktor.trim());
    if (aksi.trim()) p.set("aksi", aksi.trim());
    if (objek.trim()) p.set("objek", objek.trim());
    p.set("limit", limit);
    const r = await api<{ audit: Baris[] }>(`/api/admin/audit?${p.toString()}`);
    if (punyaku !== urut.current) return;
    setSedang(false);
    if (!r.ok) { setGalat(r.pesan ?? "Gagal memuat jejak audit"); return; }
    setGalat(""); setBaris(r.data!.audit);
  }, [aktor, aksi, objek, limit]);

  useEffect(() => {
    const t = setTimeout(() => { void muat(); }, 300);
    return () => clearTimeout(t);
  }, [muat]);

  return (
    <>
      <div className="top">
        <div>
          <h1>Jejak audit</h1>
          <div className="sub">
            Siapa melakukan apa, kapan, dari mana. Catatan ini hanya bertambah — tidak ada
            yang bisa mengubah atau menghapusnya dari layar mana pun.
          </div>
        </div>
        <div className="right">
          <button type="button" className="btn" onClick={() => void muat()}>Muat ulang</button>
        </div>
      </div>

      {galat ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div> : null}

      <Panel judul="Saring">
        <div className="a-form">
          <div className="field">
            <label className="f" htmlFor="f-aktor">Aktor (email persis)</label>
            <input id="f-aktor" type="search" maxLength={80} value={aktor}
              onChange={e => setAktor(e.target.value)} placeholder="tu@semesta.sch.id" />
          </div>
          <div className="field">
            <label className="f" htmlFor="f-aksi">Aksi (persis)</label>
            <input id="f-aksi" type="search" maxLength={40} value={aksi}
              onChange={e => setAksi(e.target.value)} placeholder="reset_pin" />
          </div>
          <div className="field">
            <label className="f" htmlFor="f-objek">Objek (persis)</label>
            <input id="f-objek" type="search" maxLength={120} value={objek}
              onChange={e => setObjek(e.target.value)} placeholder="siswa:12" />
          </div>
          <div className="field">
            <label className="f" htmlFor="f-limit">Jumlah baris</label>
            <select id="f-limit" value={limit} onChange={e => setLimit(e.target.value)}>
              <option value="50">50</option>
              <option value="200">200</option>
              <option value="1000">1000</option>
            </select>
          </div>
        </div>
        <CatatanKaki>
          Ketiga saringan mencocokkan <b>persis</b>, bukan sebagian — server sengaja tidak
          menyediakan pencarian bebas di tabel ini supaya kueri yang berat tidak bisa dipicu
          dari layar. Objek berformat <code>jenis:id</code>, misalnya <code>siswa:12</code>,
          <code>kartu:8</code>, <code>kebijakan:limit_harian_rp</code>, atau
          <code>staf:tu@semesta.sch.id</code>.
        </CatatanKaki>
      </Panel>

      <Panel judul="Jejak" sub={sedang ? "memuat…" : `${baris.length} baris`}>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Waktu</th><th>Aktor</th><th>Peran</th><th>Aksi</th><th>Objek</th><th>IP</th><th></th></tr>
            </thead>
            <tbody>
              {baris.map(b => (
                <Fragment key={b.id}>
                <tr>
                  <td>{waktuSingkat(b.waktu)}</td>
                  <td className="mono">{b.aktor}</td>
                  <td>{b.peran ?? "—"}</td>
                  <td><b>{b.aksi}</b></td>
                  <td className="mono">
                    {b.objek ? (
                      <button type="button" className="btn sm" title="saring ke objek ini"
                        onClick={() => setObjek(b.objek!)}>{b.objek}</button>
                    ) : "—"}
                  </td>
                  <td className="mono">{b.ip ?? "—"}</td>
                  <td>
                    {b.meta !== null && b.meta !== undefined ? (
                      <button type="button" className="btn sm" onClick={() => setBuka(buka === b.id ? null : b.id)}>
                        {buka === b.id ? "Tutup" : "Rincian"}
                      </button>
                    ) : null}
                  </td>
                </tr>
                {buka === b.id ? (
                  <tr>
                    <td colSpan={7}>
                      <pre style={{
                        margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
                        font: "12px var(--font-mono)", color: "var(--ink-2)",
                      }}>{JSON.stringify(b.meta, null, 2)}</pre>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              ))}
              {baris.length === 0 && !sedang ? (
                <tr><td colSpan={7} className="p-note">Tidak ada baris yang cocok.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <CatatanKaki>
          Jejak ini mencatat pembacaan data anak juga, bukan hanya perubahan — membuka halaman
          detail siswa menghasilkan baris <code>lihat_siswa</code>, dan membuka peta loker
          menghasilkan <code>lihat_peta_loker</code> (PRD §8.1).
        </CatatanKaki>
      </Panel>
    </>
  );
}
