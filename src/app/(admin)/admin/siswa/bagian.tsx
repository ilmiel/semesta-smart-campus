"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, CatatanKaki, Panel } from "@/components/ui";
import { apiAdmin } from "@/lib/admin";
import { rp } from "@/lib/format";

/**
 * Daftar siswa.
 *
 * Penyaringan dikerjakan server, bukan di browser: daftar siswa satu sekolah
 * terlalu besar untuk diunduh seluruhnya, dan yang lebih penting — beberapa
 * kolom memang tidak boleh dikirim ke semua peran. Server memangkas `saldo_rp`
 * untuk peran tanpa hak uang, dan `uid` kartu untuk selain TU/admin IT.
 *
 * UID kartu adalah kredensial: di bawah ambang PIN, transaksi cukup berbekal
 * UID. Karena itu kolomnya tidak pernah tampil apa adanya di daftar; hanya
 * status kartunya.
 */

interface Siswa {
  id: number; nis: string; nama: string; email: string | null;
  jenjang: string; boarding: boolean; status: string; kelas: string | null;
  kartu: string; uid: string | null; saldo_rp: number | null;
  pin_terkunci: boolean; pin_ada: boolean;
  limit_harian_rp: number | null; tagihan_menunggu: number;
}

const STATUS = ["", "aktif", "cuti", "pindah", "lulus", "keluar"];
const KARTU = ["", "aktif", "hilang", "rusak", "ditarik", "diganti", "belum"];

export default function Bagian() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("aktif");
  const [kelas, setKelas] = useState("");
  const [kartu, setKartu] = useState("");
  const [siswa, setSiswa] = useState<Siswa[]>([]);
  const [galat, setGalat] = useState("");
  const [sedang, setSedang] = useState(true);
  const [tambah, setTambah] = useState<null | { nis: string; nama: string; email: string; jenjang: string; boarding: boolean; kelas: string }>(null);
  const [pesan, setPesan] = useState("");
  const [gagalTambah, setGagalTambah] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  // Pencarian sambil mengetik bisa membuat jawaban lama tiba setelah jawaban
  // baru. Tanpa nomor urut, tabelnya menampilkan hasil kata kunci sebelumnya
  // — kesalahan yang sulit disadari karena layarnya tetap terlihat wajar.
  const urut = useRef(0);

  const muat = useCallback(async () => {
    const punyaku = ++urut.current;
    setSedang(true);
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status) p.set("status", status);
    if (kelas.trim()) p.set("kelas", kelas.trim());
    if (kartu) p.set("kartu", kartu);
    const r = await apiAdmin<{ siswa: Siswa[] }>(`/api/admin/siswa?${p.toString()}`);
    if (punyaku !== urut.current) return;
    setSedang(false);
    if (!r.ok) { setGalat(r.pesan ?? "Gagal memuat daftar siswa"); return; }
    setGalat("");
    setSiswa(r.data!.siswa);
  }, [q, status, kelas, kartu]);

  // Tunda 300 ms supaya mengetik di kotak cari tidak memicu satu permintaan
  // per huruf. Filter dropdown ikut jalur yang sama — tidak apa-apa, jedanya
  // tidak terasa.
  useEffect(() => {
    const t = setTimeout(() => { void muat(); }, 300);
    return () => clearTimeout(t);
  }, [muat]);

  async function simpanBaru() {
    if (!tambah) return;
    setSibuk(true); setPesan(""); setGagalTambah(false);
    const r = await apiAdmin<{ id: number }>("/api/admin/siswa", {
      metode: "POST",
      body: {
        nis: tambah.nis.trim(), nama: tambah.nama.trim(),
        email: tambah.email.trim() || undefined,
        jenjang: tambah.jenjang, boarding: tambah.boarding,
        kelas: tambah.kelas.trim() || undefined,
      },
    });
    setSibuk(false);
    if (!r.ok) { setGagalTambah(true); setPesan(r.pesan ?? "Gagal menambah siswa"); return; }
    setPesan(`${tambah.nama} ditambahkan. Terbitkan kartunya dari halaman detail.`);
    setTambah(null);
    await muat();
  }

  const adaSaldo = siswa.some(s => s.saldo_rp !== null);

  return (
    <>
      <div className="top">
        <div>
          <h1>Siswa &amp; Kartu</h1>
          <div className="sub">Penyaringan dikerjakan server — yang tampil hanya yang boleh dilihat peranmu.</div>
        </div>
        <div className="right">
          <button type="button" className="btn pri" onClick={() => {
            setPesan("");
            setTambah({ nis: "", nama: "", email: "", jenjang: "SMP", boarding: true, kelas: "" });
          }}>+ Siswa baru</button>
        </div>
      </div>

      {galat ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div> : null}
      {pesan && !tambah ? <div className={gagalTambah ? "a-err" : "a-ok"} style={{ marginBottom: 12 }}>{pesan}</div> : null}

      {tambah ? (
        <Panel judul="Siswa baru" sub="NIS harus unik dan tidak bisa diubah setelah ada transaksi">
          <div className="a-form">
            <div className="field">
              <label className="f" htmlFor="n-nis">NIS</label>
              <input id="n-nis" type="text" value={tambah.nis} onChange={e => setTambah({ ...tambah, nis: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="n-nama">Nama lengkap</label>
              <input id="n-nama" type="text" value={tambah.nama} onChange={e => setTambah({ ...tambah, nama: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="n-email">Email sekolah (opsional)</label>
              <input id="n-email" type="email" value={tambah.email} onChange={e => setTambah({ ...tambah, email: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="n-jenjang">Jenjang</label>
              <select id="n-jenjang" value={tambah.jenjang} onChange={e => setTambah({ ...tambah, jenjang: e.target.value })}>
                <option value="SMP">SMP</option><option value="SMA">SMA</option>
              </select>
            </div>
            <div className="field">
              <label className="f" htmlFor="n-boarding">Tinggal</label>
              <select id="n-boarding" value={tambah.boarding ? "1" : "0"}
                onChange={e => setTambah({ ...tambah, boarding: e.target.value === "1" })}>
                <option value="1">boarding</option><option value="0">pulang-pergi</option>
              </select>
            </div>
            <div className="field">
              <label className="f" htmlFor="n-kelas">Kelas (opsional)</label>
              <input id="n-kelas" type="text" value={tambah.kelas} placeholder="7.A"
                onChange={e => setTambah({ ...tambah, kelas: e.target.value })} />
            </div>
          </div>
          {pesan ? <div className={gagalTambah ? "a-err" : "a-ok"} style={{ marginTop: 10 }}>{pesan}</div> : null}
          <div className="a-aksi" style={{ marginTop: 12 }}>
            <button type="button" className="btn pri"
              disabled={sibuk || tambah.nis.trim().length < 3 || tambah.nama.trim().length < 2}
              onClick={() => void simpanBaru()}>{sibuk ? "Menyimpan…" : "Simpan"}</button>
            <button type="button" className="btn" onClick={() => { setTambah(null); setPesan(""); }}>Batal</button>
          </div>
        </Panel>
      ) : null}

      <Panel judul="Cari siswa">
        <div className="a-form">
          <div className="field">
            <label className="f" htmlFor="f-q">Nama atau NIS</label>
            <input id="f-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ketik untuk mencari" />
          </div>
          <div className="field">
            <label className="f" htmlFor="f-kelas">Kelas</label>
            <input id="f-kelas" type="text" value={kelas} onChange={e => setKelas(e.target.value)} placeholder="semua" />
          </div>
          <div className="field">
            <label className="f" htmlFor="f-status">Status siswa</label>
            <select id="f-status" value={status} onChange={e => setStatus(e.target.value)}>
              {STATUS.map(s => <option key={s} value={s}>{s || "semua"}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="f" htmlFor="f-kartu">Status kartu</label>
            <select id="f-kartu" value={kartu} onChange={e => setKartu(e.target.value)}>
              {KARTU.map(s => <option key={s} value={s}>{s || "semua"}</option>)}
            </select>
          </div>
        </div>
      </Panel>

      <Panel judul="Hasil" sub={sedang ? "memuat…" : `${siswa.length} siswa`}>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>NIS</th><th>Nama</th><th>Kelas</th><th>Status</th><th>Kartu</th><th>PIN</th>
                {adaSaldo ? <th className="num">Saldo</th> : null}
                <th className="num">Tagihan</th>
              </tr>
            </thead>
            <tbody>
              {siswa.map(s => (
                <tr key={s.id}>
                  <td className="mono">{s.nis}</td>
                  <td>
                    <Link href={`/admin/siswa/${encodeURIComponent(s.nis)}`}>{s.nama}</Link>
                    {s.boarding ? <span className="kls" style={{ marginLeft: 6 }}>boarding</span> : null}
                  </td>
                  <td>{s.kelas ?? "—"}</td>
                  <td>{s.status === "aktif" ? <Badge warna="good">aktif</Badge> : <Badge warna="mute">{s.status}</Badge>}</td>
                  <td>{
                    s.kartu === "aktif" ? <Badge warna="good">aktif</Badge>
                      : s.kartu === "belum" ? <Badge warna="warn">belum ada</Badge>
                        : <Badge warna="crit">{s.kartu}</Badge>
                  }</td>
                  <td>{
                    s.pin_terkunci ? <Badge warna="crit">terkunci</Badge>
                      : s.pin_ada ? <Badge warna="good">ada</Badge>
                        : <Badge warna="mute">belum</Badge>
                  }</td>
                  {adaSaldo ? <td className="num">{s.saldo_rp === null ? "—" : rp(s.saldo_rp)}</td> : null}
                  <td className="num">{s.tagihan_menunggu > 0
                    ? <span style={{ color: "var(--warn-text)", fontWeight: 700 }}>{s.tagihan_menunggu}</span>
                    : "—"}</td>
                </tr>
              ))}
              {siswa.length === 0 && !sedang ? (
                <tr><td colSpan={adaSaldo ? 8 : 7} className="p-note">Tidak ada siswa yang cocok.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <CatatanKaki>
          Daftar dibatasi 200 baris per permintaan — persempit pencarian kalau yang dicari belum muncul.
          Kolom saldo hanya tampil untuk peran keuangan, TU, admin IT, dan manajemen; UID kartu tidak
          pernah ditampilkan di daftar karena itu kredensial pembayaran.
        </CatatanKaki>
      </Panel>
    </>
  );
}
