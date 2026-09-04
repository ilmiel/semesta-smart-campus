"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, CatatanKaki, Panel, Tile } from "@/components/ui";
import { apiAdmin, useMuat, waktuSingkat } from "@/lib/admin";
import { rp } from "@/lib/format";

/**
 * Halaman 360° satu siswa — dan tempat TU mengerjakan hampir semua
 * pekerjaan hariannya: kartu hilang, PIN lupa, siswa pindah.
 *
 * Tiga hal yang sengaja dibuat merepotkan, karena konsekuensinya nyata:
 *
 *   - Cabut kartu minta alasan. Kartu yang dicabut tidak bisa dipakai lagi,
 *     dan pertanyaan "kenapa kartu ini mati" muncul berbulan kemudian.
 *   - Reset PIN menampilkan PIN sementara SEKALI dan harus disampaikan
 *     langsung ke siswa yang hadir. Server tidak menyimpannya dalam bentuk
 *     yang bisa dibaca lagi.
 *
 *     Catatan penting yang layarnya sekarang sebutkan apa adanya: PIN itu
 *     LANGSUNG BERLAKU PENUH. Kolom `harus_ganti` (F-30) hanya menandai
 *     "ini PIN dari TU" — tidak ada satu pun jalur pembayaran yang
 *     memeriksanya. Sampai penegakannya ada, PIN sementara adalah kredensial
 *     pembayaran hidup yang diucapkan di meja TU.
 *   - Ubah status ke lulus/keluar minta konfirmasi terpisah — itu mematikan
 *     kartu dan menghentikan transaksi baru.
 *
 * Peran tanpa hak uang (kesiswaan, wali kelas) menerima halaman yang sama
 * dengan rupiah dihilangkan server. Bukan disembunyikan CSS — memang tidak
 * dikirim.
 */

interface Siswa {
  id: number; nis: string; nama: string; email: string | null; jenjang: string;
  boarding: boolean; status: string; kelas: string | null; kartu: string;
  saldo_rp: number | null; limit_harian_rp: number | null; tagihan_menunggu: number;
}
interface Kartu { id: number; uid: string; status: string; terbit: string | null; dicabut: string | null; alasan: string | null }
interface Wali { id: number; nama: string; hubungan: string | null; whatsapp: string | null; email: string | null; utama: boolean }
interface Pin { ada: boolean; terkunci: boolean; terkunci_hingga: string | null; harus_ganti: boolean; gagal: number }
interface Riwayat { waktu: string; layanan: string | null; jenis: string; item: string | null; total_rp?: number | null }
interface Tagihan { id: number; sumber: string; keterangan: string | null; nominal_rp: number | null; status: string; dibuat: string }
interface Kelas { kelas: string; tahun_ajaran: string; wali_email: string | null }

interface Isi {
  siswa: Siswa; kartu: Kartu[]; wali: Wali[]; pin: Pin;
  riwayat: Riwayat[]; kelas: Kelas[]; tagihan: Tagihan[];
  pinjaman: Record<string, unknown>[]; laundry: Record<string, unknown>[];
  loker: Record<string, unknown> | null; po: Record<string, unknown>[];
  limit: { efektif_rp: number; plafon_rp: number; terpakai_rp: number } | null;
}

type Dialog =
  | { t: "terbit" }
  | { t: "cabut"; kartu: Kartu }
  | { t: "aktifkan"; kartu: Kartu }
  | { t: "reset_pin" }
  | { t: "buka_pin" }
  | { t: "status" }
  | { t: "wali"; wali?: Wali }
  | { t: "ubah" };

export default function Bagian({ nis }: { nis: string }) {
  const jalur = `/api/admin/siswa/${encodeURIComponent(nis)}`;
  const { data, galat, sedang, muatUlang } = useMuat<Isi>(jalur);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [rahasia, setRahasia] = useState<string | null>(null);
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  // Isian dialog — satu set dipakai bergantian; direset tiap dialog dibuka.
  const [uid, setUid] = useState("");
  const [alasan, setAlasan] = useState("");
  const [statusBaru, setStatusBaru] = useState("aktif");
  const [wali, setWali] = useState({ nama: "", hubungan: "", whatsapp: "", email: "", utama: false });
  const [ubah, setUbah] = useState({ nama: "", email: "", kelas: "", jenjang: "SMP", boarding: true });

  function buka(d: Dialog) {
    setPesan(""); setGagal(false); setRahasia(null);
    setUid(""); setAlasan("");
    // `statusBaru` dipakai dua dialog dengan daftar pilihan berbeda; kalau
    // tidak direset, dialog cabut kartu terbuka dengan nilai "aktif" yang
    // tidak ada di pilihannya.
    if (d.t === "status") setStatusBaru(data?.siswa.status ?? "aktif");
    if (d.t === "cabut") setStatusBaru("hilang");
    if (d.t === "wali") {
      setWali(d.wali
        ? { nama: d.wali.nama, hubungan: d.wali.hubungan ?? "", whatsapp: d.wali.whatsapp ?? "", email: d.wali.email ?? "", utama: d.wali.utama }
        : { nama: "", hubungan: "", whatsapp: "", email: "", utama: false });
    }
    if (d.t === "ubah" && data) {
      setUbah({
        nama: data.siswa.nama, email: data.siswa.email ?? "", kelas: data.siswa.kelas ?? "",
        jenjang: data.siswa.jenjang, boarding: data.siswa.boarding,
      });
    }
    setDialog(d);
  }

  async function kirim(sub: string, body: unknown, metode = "POST") {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await apiAdmin<Record<string, unknown>>(`${jalur}${sub}`, { metode, body });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Aksi ditolak"); return false; }
    if (typeof r.data?.pin_sementara === "string") setRahasia(r.data.pin_sementara);
    setDialog(null);
    await muatUlang();
    return true;
  }

  if (galat) return <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div>;
  if (!data) return <p className="p-note">{sedang ? "Memuat data siswa…" : "Tidak ada data."}</p>;

  const s = data.siswa;
  const kartuAktif = data.kartu.find(k => k.status === "aktif");
  const bisaUang = s.saldo_rp !== null;

  return (
    <>
      <div className="top">
        <div>
          <h1>{s.nama}</h1>
          <div className="sub">
            <span className="mono">{s.nis}</span> · {s.jenjang} · {s.kelas ?? "tanpa kelas"} ·{" "}
            {s.boarding ? "boarding" : "pulang-pergi"} ·{" "}
            {s.status === "aktif" ? <Badge warna="good">aktif</Badge> : <Badge warna="crit">{s.status}</Badge>}
          </div>
        </div>
        <div className="right">
          <Link href="/admin/siswa" className="btn">← Daftar siswa</Link>
          <button type="button" className="btn" onClick={() => buka({ t: "ubah" })}>Ubah data</button>
          <button type="button" className="btn" onClick={() => buka({ t: "status" })}>Ubah status</button>
        </div>
      </div>

      {pesan && !dialog ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 12 }}>{pesan}</div> : null}

      {rahasia ? (
        <Panel judul="PIN sementara" sub="hanya ditampilkan sekali">
          <div className="a-rahasia">
            <div style={{ fontWeight: 600, fontSize: 13 }}>Sampaikan langsung ke siswa yang sedang berdiri di depanmu.</div>
            <code className="nilai">{rahasia}</code>
            <div className="p-note" style={{ margin: 0 }}>
              Jangan dikirim lewat WhatsApp atau dititipkan ke teman sekelas. PIN ini
              <b> langsung berlaku penuh</b> untuk transaksi dan tetap berlaku sampai siswa
              menggantinya sendiri di portal — jadi selama belum diganti, siapa pun yang
              sempat mendengarnya bisa memakainya. Ingatkan siswa menggantinya hari itu juga.
            </div>
          </div>
          <div className="a-aksi" style={{ marginTop: 10 }}>
            <button type="button" className="btn" onClick={() => setRahasia(null)}>Sudah disampaikan</button>
          </div>
        </Panel>
      ) : null}

      {dialog ? (
        <Panel judul={judulDialog(dialog)}>
          {dialog.t === "terbit" ? (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
                Tempelkan kartu baru ke reader, atau ketik UID-nya. Kartu lama yang masih aktif
                otomatis ditandai <b>diganti</b> — tidak perlu dicabut lebih dulu.
              </p>
              <div className="field">
                <label className="f" htmlFor="d-uid">UID kartu</label>
                <input id="d-uid" autoFocus type="text" value={uid} style={{ fontFamily: "var(--font-mono)", width: "100%", maxWidth: 340 }}
                  onChange={e => setUid(e.target.value.toUpperCase())} />
              </div>
              <Aksi sibuk={sibuk} nonaktif={uid.trim().length < 8}
                label="Terbitkan kartu" onKlik={() => void kirim("/kartu", { aksi: "terbit", uid: uid.trim() })}
                onBatal={() => setDialog(null)} />
            </>
          ) : dialog.t === "cabut" ? (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
                Kartu <code>{dialog.kartu.uid}</code> berhenti berlaku seketika. Saldo siswa
                <b> tidak</b> ikut hilang — saldo menempel pada siswa, bukan kartu.
              </p>
              <div className="a-form">
                <div className="field">
                  <label className="f" htmlFor="d-st">Sebabnya</label>
                  <select id="d-st" value={statusBaru} onChange={e => setStatusBaru(e.target.value)}>
                    <option value="hilang">hilang</option>
                    <option value="rusak">rusak</option>
                    <option value="ditarik">ditarik sekolah</option>
                  </select>
                </div>
                <div className="field">
                  <label className="f" htmlFor="d-al">Catatan (tercatat di audit)</label>
                  <input id="d-al" type="text" value={alasan} onChange={e => setAlasan(e.target.value)} />
                </div>
              </div>
              <Aksi sibuk={sibuk} bahaya label="Cabut kartu"
                onKlik={() => void kirim("/kartu", {
                  aksi: "cabut", kartu_id: dialog.kartu.id,
                  status: ["hilang", "rusak", "ditarik"].includes(statusBaru) ? statusBaru : "hilang",
                  alasan: alasan.trim() || undefined,
                })}
                onBatal={() => setDialog(null)} />
            </>
          ) : dialog.t === "aktifkan" ? (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
                Pakai ini hanya kalau kartu yang dilaporkan hilang benar-benar ditemukan dan
                belum ada kartu pengganti. Kalau penggantinya sudah terbit, terbitkan ulang
                saja — jangan hidupkan dua kartu sekaligus.
              </p>
              <Aksi sibuk={sibuk} label="Aktifkan lagi"
                onKlik={() => void kirim("/kartu", { aksi: "aktifkan", kartu_id: dialog.kartu.id })}
                onBatal={() => setDialog(null)} />
            </>
          ) : dialog.t === "reset_pin" ? (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
                Lakukan hanya kalau siswanya <b>hadir dan sudah kamu kenali</b>. PIN sementara
                akan ditampilkan sekali di layar ini.
              </p>
              <Aksi sibuk={sibuk} label="Reset PIN" onKlik={() => void kirim("/pin", { aksi: "reset" })}
                onBatal={() => setDialog(null)} />
            </>
          ) : dialog.t === "buka_pin" ? (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
                PIN lama tetap berlaku — ini hanya menghapus kuncinya. Kalau siswa memang lupa
                PIN-nya, yang dibutuhkan adalah reset, bukan buka kunci.
              </p>
              <Aksi sibuk={sibuk} label="Buka kunci" onKlik={() => void kirim("/pin", { aksi: "buka_kunci" })}
                onBatal={() => setDialog(null)} />
            </>
          ) : dialog.t === "status" ? (
            <>
              <div className="a-form">
                <div className="field">
                  <label className="f" htmlFor="d-status">Status baru</label>
                  <select id="d-status" value={statusBaru} onChange={e => setStatusBaru(e.target.value)}>
                    {["aktif", "cuti", "pindah", "lulus", "keluar"].map(x => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="f" htmlFor="d-alasan">Alasan</label>
                  <input id="d-alasan" type="text" value={alasan} onChange={e => setAlasan(e.target.value)} />
                </div>
              </div>
              {statusBaru !== "aktif" ? (
                <div className="a-err" style={{ marginTop: 10 }}>
                  Status selain aktif menghentikan transaksi baru dan mematikan kartunya.
                  {bisaUang && (s.saldo_rp ?? 0) > 0
                    ? ` Saldo ${rp(s.saldo_rp ?? 0)} masih tercatat dan harus diselesaikan keuangan — tidak hangus sendiri.`
                    : ""}
                </div>
              ) : null}
              <Aksi sibuk={sibuk} bahaya={statusBaru !== "aktif"} label="Simpan status"
                onKlik={() => void kirim("/status", { status: statusBaru, alasan: alasan.trim() || undefined })}
                onBatal={() => setDialog(null)} />
            </>
          ) : dialog.t === "wali" ? (
            <>
              <div className="a-form">
                <div className="field">
                  <label className="f" htmlFor="w-nama">Nama wali</label>
                  <input id="w-nama" type="text" value={wali.nama} onChange={e => setWali({ ...wali, nama: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="w-hub">Hubungan</label>
                  <input id="w-hub" type="text" value={wali.hubungan} placeholder="ayah / ibu / wali"
                    onChange={e => setWali({ ...wali, hubungan: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="w-wa">WhatsApp</label>
                  <input id="w-wa" type="text" value={wali.whatsapp} placeholder="628…"
                    onChange={e => setWali({ ...wali, whatsapp: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="w-email">Email portal</label>
                  <input id="w-email" type="email" value={wali.email}
                    onChange={e => setWali({ ...wali, email: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="w-utama">Wali utama</label>
                  <select id="w-utama" value={wali.utama ? "1" : "0"}
                    onChange={e => setWali({ ...wali, utama: e.target.value === "1" })}>
                    <option value="0">bukan</option><option value="1">ya</option>
                  </select>
                </div>
              </div>
              <div className="p-note" style={{ marginTop: 8 }}>
                Email di sini yang dipakai untuk login portal orang tua. Salah ketik satu huruf
                berarti orang tua tidak bisa masuk — dan orang lain mungkin bisa.
              </div>
              <Aksi sibuk={sibuk} nonaktif={wali.nama.trim().length < 2} label="Simpan wali"
                onKlik={() => void kirim("/wali", {
                  id: dialog.wali?.id, nama: wali.nama.trim(),
                  hubungan: wali.hubungan.trim() || undefined,
                  whatsapp: wali.whatsapp.trim() || undefined,
                  email: wali.email.trim() || undefined,
                  utama: wali.utama,
                })}
                onBatal={() => setDialog(null)} />
            </>
          ) : (
            <>
              <div className="a-form">
                <div className="field">
                  <label className="f" htmlFor="e-nama">Nama</label>
                  <input id="e-nama" type="text" value={ubah.nama} onChange={e => setUbah({ ...ubah, nama: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="e-email">Email sekolah</label>
                  <input id="e-email" type="email" value={ubah.email} onChange={e => setUbah({ ...ubah, email: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="e-kelas">Kelas</label>
                  <input id="e-kelas" type="text" value={ubah.kelas} onChange={e => setUbah({ ...ubah, kelas: e.target.value })} />
                </div>
                <div className="field">
                  <label className="f" htmlFor="e-jenjang">Jenjang</label>
                  <select id="e-jenjang" value={ubah.jenjang} onChange={e => setUbah({ ...ubah, jenjang: e.target.value })}>
                    <option value="SMP">SMP</option><option value="SMA">SMA</option>
                  </select>
                </div>
                <div className="field">
                  <label className="f" htmlFor="e-boarding">Tinggal</label>
                  <select id="e-boarding" value={ubah.boarding ? "1" : "0"}
                    onChange={e => setUbah({ ...ubah, boarding: e.target.value === "1" })}>
                    <option value="1">boarding</option><option value="0">pulang-pergi</option>
                  </select>
                </div>
              </div>
              <Aksi sibuk={sibuk} nonaktif={ubah.nama.trim().length < 2} label="Simpan"
                onKlik={() => void kirim("", {
                  nama: ubah.nama.trim(),
                  email: ubah.email.trim() || null,
                  kelas: ubah.kelas.trim() || undefined,
                  jenjang: ubah.jenjang, boarding: ubah.boarding,
                }, "PATCH")}
                onBatal={() => setDialog(null)} />
            </>
          )}
          {pesan ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginTop: 10 }}>{pesan}</div> : null}
        </Panel>
      ) : null}

      {bisaUang ? (
        <div className="kpis">
          <Tile label="Saldo" value={rp(s.saldo_rp ?? 0)} />
          <Tile label="Limit harian" value={rp(data.limit?.efektif_rp ?? s.limit_harian_rp ?? 0)}
            sub={data.limit ? `terpakai hari ini ${rp(data.limit.terpakai_rp)}` : undefined} />
          <Tile label="Tagihan menunggu" value={s.tagihan_menunggu}
            sub={s.tagihan_menunggu > 0 ? "dibayar orang tua lewat portal" : "tidak ada"} />
        </div>
      ) : null}

      <div className="row2">
        <Panel judul="Kartu"
          aksi={<button type="button" className="btn sm pri" onClick={() => buka({ t: "terbit" })}>Terbitkan kartu baru</button>}>
          <div className="tw">
            <table>
              <thead><tr><th>UID</th><th>Status</th><th>Terbit</th><th>Dicabut</th><th>Aksi</th></tr></thead>
              <tbody>
                {data.kartu.map(k => (
                  <tr key={k.id}>
                    <td className="mono">{k.uid}</td>
                    <td>{k.status === "aktif" ? <Badge warna="good">aktif</Badge> : <Badge warna="mute">{k.status}</Badge>}
                      {k.alasan ? <><br /><span className="p-note">{k.alasan}</span></> : null}</td>
                    <td>{waktuSingkat(k.terbit)}</td>
                    <td>{waktuSingkat(k.dicabut)}</td>
                    <td>
                      <div className="a-aksi">
                        {k.status === "aktif" ? (
                          <button type="button" className="btn sm" onClick={() => buka({ t: "cabut", kartu: k })}>Cabut</button>
                        ) : k.status === "hilang" && !kartuAktif ? (
                          <button type="button" className="btn sm" onClick={() => buka({ t: "aktifkan", kartu: k })}>Ketemu</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.kartu.length === 0 ? <tr><td colSpan={5} className="p-note">Belum pernah punya kartu.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Saldo menempel pada siswa, bukan pada kartu — mengganti kartu tidak memindahkan
            atau menghanguskan uang.
          </CatatanKaki>
        </Panel>

        <Panel judul="PIN">
          <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
            {!data.pin.ada ? <>Siswa ini <b>belum punya PIN</b>. Transaksi di atas ambang PIN akan ditolak sampai PIN dibuat lewat reset.</>
              : data.pin.terkunci ? <><Badge warna="crit">terkunci</Badge> sampai {waktuSingkat(data.pin.terkunci_hingga)} · {data.pin.gagal} percobaan gagal</>
                : data.pin.harus_ganti ? <><Badge warna="warn">PIN sementara</Badge> — masih PIN dari TU, berlaku penuh, belum diganti siswa</>
                  : <><Badge warna="good">aktif</Badge> · {data.pin.gagal} percobaan gagal terakhir</>}
          </p>
          <div className="a-aksi">
            <button type="button" className="btn" onClick={() => buka({ t: "reset_pin" })}>Reset PIN (siswa hadir)</button>
            {data.pin.terkunci ? (
              <button type="button" className="btn" onClick={() => buka({ t: "buka_pin" })}>Buka kunci</button>
            ) : null}
          </div>
          <CatatanKaki>
            PIN disimpan sebagai hash — tidak ada satu pun layar yang bisa menampilkan PIN
            siswa yang sedang berlaku, termasuk halaman ini.
          </CatatanKaki>
        </Panel>
      </div>

      <div className="row2">
        <Panel judul="Wali & kontak"
          aksi={<button type="button" className="btn sm" onClick={() => buka({ t: "wali" })}>+ Tambah wali</button>}>
          <div className="tw">
            <table>
              <thead><tr><th>Nama</th><th>Hubungan</th><th>WhatsApp</th><th>Email portal</th><th></th></tr></thead>
              <tbody>
                {data.wali.map(w => (
                  <tr key={w.id}>
                    <td>{w.nama} {w.utama ? <Badge warna="info">utama</Badge> : null}</td>
                    <td>{w.hubungan ?? "—"}</td>
                    <td className="mono">{w.whatsapp ?? "—"}</td>
                    <td className="mono">{w.email ?? "—"}</td>
                    <td><button type="button" className="btn sm" onClick={() => buka({ t: "wali", wali: w })}>Ubah</button></td>
                  </tr>
                ))}
                {data.wali.length === 0 ? <tr><td colSpan={5} className="p-note">Belum ada wali terdaftar — orang tua tidak bisa membuka portal.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel judul="Riwayat terakhir" sub={bisaUang ? "60 transaksi terakhir" : "pola belanja, tanpa rupiah"}>
          <div className="tw">
            <table>
              <thead><tr><th>Waktu</th><th>Layanan</th><th>Jenis</th><th>Item</th>{bisaUang ? <th className="num">Nilai</th> : null}</tr></thead>
              <tbody>
                {data.riwayat.slice(0, 15).map((r, i) => (
                  <tr key={i}>
                    <td>{waktuSingkat(r.waktu)}</td>
                    <td>{r.layanan ?? "—"}</td>
                    <td>{r.jenis}</td>
                    <td>{r.item ?? "—"}</td>
                    {bisaUang ? <td className="num">{typeof r.total_rp === "number" ? rp(r.total_rp) : "—"}</td> : null}
                  </tr>
                ))}
                {data.riwayat.length === 0 ? <tr><td colSpan={bisaUang ? 5 : 4} className="p-note">Belum ada transaksi.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Setiap pembukaan halaman ini tercatat di audit_log — data anak, siapa yang melihat
            dan kapan (PRD §8.1).
          </CatatanKaki>
        </Panel>
      </div>

      {data.kelas.length > 0 ? (
        <Panel judul="Riwayat kelas">
          <div className="tw">
            <table>
              <thead><tr><th>Tahun ajaran</th><th>Kelas</th><th>Wali kelas</th></tr></thead>
              <tbody>
                {data.kelas.map((k, i) => (
                  <tr key={i}><td>{k.tahun_ajaran}</td><td>{k.kelas}</td><td className="mono">{k.wali_email ?? "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </>
  );
}

function judulDialog(d: Dialog): string {
  switch (d.t) {
    case "terbit": return "Terbitkan kartu baru";
    case "cabut": return "Cabut kartu";
    case "aktifkan": return "Aktifkan kartu yang ditemukan";
    case "reset_pin": return "Reset PIN";
    case "buka_pin": return "Buka kunci PIN";
    case "status": return "Ubah status siswa";
    case "wali": return d.wali ? `Ubah wali — ${d.wali.nama}` : "Tambah wali";
    case "ubah": return "Ubah data siswa";
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
