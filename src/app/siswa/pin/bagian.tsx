"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Siswa mengganti PIN-nya sendiri.
 *
 * Sampai layar ini ada, siswa tidak punya satu pun cara mengganti PIN —
 * termasuk PIN sementara yang baru saja diucapkan TU di depan meja, dengan
 * antrean di belakangnya. PIN itu berlaku penuh untuk pembayaran dan tetap
 * berlaku selamanya kalau tidak diganti.
 *
 * Aturan yang ditegakkan server, bukan layar ini: PIN lama wajib benar
 * (F-102), PIN baru 6 digit, tidak boleh 6 angka sama atau berurutan, dan
 * tidak boleh sama dengan yang lama. Salah PIN lama berkali-kali tetap
 * mengunci akun seperti di terminal — jadi layar ini juga tidak bisa dipakai
 * menebak PIN orang lain, bahkan oleh pemilik akunnya sendiri.
 */

interface Saya {
  siswa: {
    nama: string; nis: string; kelas: string | null;
    pin_ada: boolean; pin_terkunci: boolean; pin_harus_ganti: boolean | null;
  };
}

export default function Bagian() {
  const [saya, setSaya] = useState<Saya | null>(null);
  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [ulang, setUlang] = useState("");
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [selesai, setSelesai] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await api<Saya>("/api/siswa/saya");
      if (r.ok) setSaya(r.data!);
    })();
  }, []);

  const digit = (x: string) => /^\d{6}$/.test(x);
  const cocok = baru === ulang;
  const bisa = digit(lama) && digit(baru) && cocok && baru !== lama;

  async function simpan() {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api("/api/siswa/pin", { metode: "POST", body: { pin_lama: lama, pin_baru: baru } });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "PIN gagal diganti"); return; }
    setLama(""); setBaru(""); setUlang(""); setSelesai(true);
  }

  return (
    <div className="root">
      <div className="t-shell" style={{ maxWidth: 480 }}>
        <section className="panel">
          <h1 style={{ fontSize: 18, margin: "0 0 6px" }}>Ganti PIN</h1>
          {saya ? (
            <p className="p-note" style={{ marginTop: 0 }}>
              {saya.siswa.nama} · {saya.siswa.kelas ?? saya.siswa.nis}
            </p>
          ) : null}

          {selesai ? (
            <>
              <div className="t-ok">PIN berhasil diganti.</div>
              <p className="p-note" style={{ marginTop: 10 }}>
                Pakai PIN baru ini di kasir kantin dan meja laundry. Jangan beri tahu siapa pun,
                termasuk teman sekamar — PIN ini yang menahan orang lain memakai saldomu kalau
                kartumu terbawa atau hilang.
              </p>
              <Link href="/siswa" className="btn pri blok" style={{ marginTop: 12 }}>Kembali ke portal</Link>
            </>
          ) : saya?.siswa.pin_terkunci ? (
            <div className="t-err">
              PIN-mu sedang terkunci karena terlalu banyak percobaan salah. Datang ke TU untuk
              membukanya — PIN tidak bisa diganti selama terkunci.
            </div>
          ) : saya && !saya.siswa.pin_ada ? (
            <div className="t-err">
              Kamu belum punya PIN. Datang ke TU untuk mendapatkan PIN pertama, lalu ganti di
              halaman ini.
            </div>
          ) : (
            <>
              {saya?.siswa.pin_harus_ganti ? (
                <div className="t-err" style={{ marginBottom: 12 }}>
                  PIN yang kamu pakai sekarang masih PIN sementara dari TU. PIN itu diucapkan di
                  meja TU dan berlaku penuh untuk pembayaran — ganti sekarang.
                </div>
              ) : null}

              <div className="field">
                <label className="f" htmlFor="p-lama">PIN sekarang</label>
                <input id="p-lama" type="password" inputMode="numeric" autoComplete="current-password"
                  maxLength={6} value={lama} style={{ width: "100%", fontFamily: "var(--font-mono)" }}
                  onChange={e => setLama(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="field">
                <label className="f" htmlFor="p-baru">PIN baru (6 angka)</label>
                <input id="p-baru" type="password" inputMode="numeric" autoComplete="new-password"
                  maxLength={6} value={baru} style={{ width: "100%", fontFamily: "var(--font-mono)" }}
                  onChange={e => setBaru(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="field">
                <label className="f" htmlFor="p-ulang">Ulangi PIN baru</label>
                <input id="p-ulang" type="password" inputMode="numeric" autoComplete="new-password"
                  maxLength={6} value={ulang} style={{ width: "100%", fontFamily: "var(--font-mono)" }}
                  onChange={e => setUlang(e.target.value.replace(/\D/g, ""))} />
              </div>

              {baru && ulang && !cocok ? (
                <div className="a-err" style={{ marginBottom: 10 }}>PIN baru dan ulangannya belum sama.</div>
              ) : null}
              {baru && baru === lama ? (
                <div className="a-err" style={{ marginBottom: 10 }}>PIN baru harus berbeda dari PIN sekarang.</div>
              ) : null}
              {pesan ? <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 10 }}>{pesan}</div> : null}

              <button type="button" className="btn pri blok" disabled={sibuk || !bisa} onClick={() => void simpan()}>
                {sibuk ? "Menyimpan…" : "Ganti PIN"}
              </button>

              <p className="p-note" style={{ marginTop: 12 }}>
                Jangan pakai tanggal lahirmu, 6 angka yang sama, atau angka berurutan — semuanya
                ditolak server. Salah memasukkan PIN sekarang berkali-kali akan mengunci akunmu,
                sama seperti di kasir.
              </p>
              <Link href="/siswa" style={{ display: "inline-block", marginTop: 10 }}>← Kembali ke portal</Link>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
