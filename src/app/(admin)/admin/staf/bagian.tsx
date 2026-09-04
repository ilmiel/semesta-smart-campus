"use client";

import { useState } from "react";
import { Badge, CatatanKaki, Panel } from "@/components/ui";
import { apiAdmin, useMuat, waktuSingkat } from "@/lib/admin";

/**
 * Akun staf & peran (RBAC).
 *
 * Peran di sinilah yang menentukan apa yang bisa dilakukan seseorang di
 * seluruh sistem — bukan tombol yang disembunyikan di layar. Setiap route API
 * memanggil `wajibPeran()` sendiri, jadi menghapus peran di halaman ini
 * langsung menutup aksesnya walaupun orang itu menyimpan URL-nya.
 *
 * Email harus akun Google Workspace sekolah: login lewat Google, dan email
 * yang tidak terdaftar di sini bisa masuk tapi tidak punya akses apa pun.
 *
 * Menonaktifkan staf TIDAK menghapus barisnya — jejak audit lama menunjuk ke
 * email ini, dan menghapusnya membuat riwayat "siapa menyetujui apa" jadi
 * tidak bisa dibaca.
 */

const PERAN: { kode: string; label: string; jelas: string }[] = [
  { kode: "admin_it", label: "Admin IT", jelas: "perangkat, kartu, akun staf" },
  { kode: "keuangan", label: "Keuangan", jelas: "rekonsiliasi, refund, koreksi" },
  { kode: "tu", label: "Tata Usaha", jelas: "reset PIN, top-up tunai, kartu" },
  { kode: "kasir", label: "Kasir", jelas: "rekap kantin sendiri" },
  { kode: "laundry", label: "Laundry", jelas: "order & tarif laundry" },
  { kode: "asrama", label: "Pembina Asrama", jelas: "loker, denda asrama" },
  { kode: "pustakawan", label: "Pustakawan", jelas: "katalog & sirkulasi" },
  { kode: "kesiswaan", label: "Kesiswaan", jelas: "indikator siswa, tanpa rupiah" },
  { kode: "wali_kelas", label: "Wali Kelas", jelas: "siswa kelasnya, tanpa rupiah" },
  { kode: "manajemen", label: "Manajemen", jelas: "dashboard lintas modul" },
];

interface Staf {
  id: number; email: string; nama: string; peran: string[];
  aktif: boolean; dibuat: string | null; diubah: string | null;
}

const KOSONG = { email: "", nama: "", peran: [] as string[], aktif: true };

export default function Bagian() {
  const { data, galat, sedang, muatUlang } = useMuat<{ staf: Staf[] }>("/api/admin/staf");
  const staf = data?.staf ?? [];
  const [form, setForm] = useState<typeof KOSONG | null>(null);
  const [ubahEmail, setUbahEmail] = useState<string | null>(null);
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  const adminAktif = staf.filter(s => s.aktif && s.peran.includes("admin_it")).length;

  function buka(s?: Staf) {
    setPesan("");
    setUbahEmail(s?.email ?? null);
    setForm(s ? { email: s.email, nama: s.nama, peran: [...s.peran], aktif: s.aktif } : { ...KOSONG });
  }

  /**
   * Aktifkan/nonaktifkan satu akun, lewat PATCH.
   *
   * Bukan lewat form di atas: form itu mengirim seluruh baris dan
   * memvalidasi ulang nama, email, serta setiap peran. Baris warisan bisa
   * gagal di situ — dan yang gagal justru pencabutan akses, hal yang paling
   * mendesak saat ada masalah. PATCH hanya menyentuh kolom `aktif`.
   */
  async function ubahStatus(s: Staf) {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await apiAdmin("/api/admin/staf", {
      metode: "PATCH", body: { email: s.email, aktif: !s.aktif },
    });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Gagal mengubah status"); return; }
    setPesan(`${s.nama} ${s.aktif ? "dinonaktifkan" : "diaktifkan"}.`);
    await muatUlang();
  }

  async function simpan() {
    if (!form) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await apiAdmin<{ id: number }>("/api/admin/staf", { metode: "POST", body: form });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Gagal menyimpan"); return; }
    setForm(null); setUbahEmail(null);
    setPesan(`Tersimpan: ${form.nama}.`);
    await muatUlang();
  }

  return (
    <>
      <div className="top">
        <div>
          <h1>Staf &amp; Peran</h1>
          <div className="sub">
            Peran menentukan akses di seluruh sistem. Email tanpa baris di sini bisa login,
            tapi tidak punya akses apa pun.
          </div>
        </div>
        <div className="right">
          <button type="button" className="btn" onClick={() => void muatUlang()}>Muat ulang</button>
          <button type="button" className="btn pri" onClick={() => buka()}>+ Staf baru</button>
        </div>
      </div>

      {galat ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div> : null}
      {pesan && !form ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 12 }}>{pesan}</div> : null}

      {form ? (
        <Panel judul={ubahEmail ? `Ubah ${ubahEmail}` : "Staf baru"}
          sub={ubahEmail ? "email tidak bisa diubah — buat baris baru kalau emailnya ganti" : "email akun Google Workspace sekolah"}>
          <div className="a-form">
            <div className="field">
              <label className="f" htmlFor="s-email">Email</label>
              <input id="s-email" type="email" value={form.email} disabled={Boolean(ubahEmail)}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="nama@semesta.sch.id" />
            </div>
            <div className="field">
              <label className="f" htmlFor="s-nama">Nama</label>
              <input id="s-nama" type="text" value={form.nama}
                onChange={e => setForm({ ...form, nama: e.target.value })} />
            </div>
            <div className="field">
              <label className="f" htmlFor="s-aktif">Status</label>
              <select id="s-aktif" value={form.aktif ? "1" : "0"}
                onChange={e => setForm({ ...form, aktif: e.target.value === "1" })}>
                <option value="1">aktif</option>
                <option value="0">nonaktif</option>
              </select>
            </div>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label className="f">Peran</label>
            <div className="a-peran">
              {PERAN.map(p => (
                <label key={p.kode} title={p.jelas}>
                  <input type="checkbox" checked={form.peran.includes(p.kode)}
                    onChange={e => setForm({
                      ...form,
                      peran: e.target.checked
                        ? [...form.peran, p.kode]
                        : form.peran.filter(x => x !== p.kode),
                    })} />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
            <div className="p-note" style={{ marginTop: 6 }}>
              Beri peran sesempit mungkin. Seorang kasir tidak butuh peran keuangan, dan
              wali kelas tidak melihat rupiah sama sekali.
            </div>
          </div>

          {pesan ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginTop: 10 }}>{pesan}</div> : null}

          <div className="a-aksi" style={{ marginTop: 12 }}>
            <button type="button" className="btn pri"
              disabled={sibuk || form.nama.trim().length < 2 || !form.email.includes("@")}
              onClick={() => void simpan()}>
              {sibuk ? "Menyimpan…" : "Simpan"}
            </button>
            <button type="button" className="btn" onClick={() => { setForm(null); setUbahEmail(null); setPesan(""); }}>
              Batal
            </button>
          </div>
        </Panel>
      ) : null}

      <Panel judul="Akun staf" sub={sedang ? "memuat…" : `${staf.filter(s => s.aktif).length} aktif · ${adminAktif} admin IT`}
        aksi={adminAktif <= 1 ? <Badge warna="warn">hanya 1 admin IT</Badge> : null}>
        <div className="tw">
          <table>
            <thead>
              <tr><th>Nama</th><th>Email</th><th>Peran</th><th>Status</th><th>Diubah</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {staf.map(s => (
                <tr key={s.id}>
                  <td>{s.aktif ? <b>{s.nama}</b> : <span style={{ color: "var(--ink-3)" }}>{s.nama}</span>}</td>
                  <td className="mono">{s.email}</td>
                  <td>
                    {s.peran.length === 0
                      ? <span style={{ color: "var(--ink-3)" }}>tanpa akses</span>
                      : s.peran.map(p => (
                        <span key={p} className="badge mute" style={{ marginRight: 4 }}>
                          {PERAN.find(x => x.kode === p)?.label ?? p}
                        </span>
                      ))}
                  </td>
                  <td>{s.aktif ? <Badge warna="good">aktif</Badge> : <Badge warna="mute">nonaktif</Badge>}</td>
                  <td>{waktuSingkat(s.diubah)}</td>
                  <td>
                    <div className="a-aksi">
                      <button type="button" className="btn sm" onClick={() => buka(s)}>Ubah</button>
                      <button type="button" className="btn sm" disabled={sibuk}
                        onClick={() => void ubahStatus(s)}>
                        {s.aktif ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {staf.length === 0 && !sedang ? (
                <tr><td colSpan={6} className="p-note">Belum ada akun staf.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <CatatanKaki>
          Menonaktifkan staf tidak menghapus barisnya: jejak audit lama menunjuk ke email ini,
          dan menghapusnya membuat riwayat persetujuan tidak bisa dibaca. Server menolak
          mencabut peran admin IT terakhir yang masih aktif — kalau tidak, tidak ada lagi yang
          bisa memperbaikinya selain lewat SQL.
        </CatatanKaki>
      </Panel>
    </>
  );
}
