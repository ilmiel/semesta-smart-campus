"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { AksiContoh } from "@/components/Mock";
import { LOKER, statusLoker, type StatusLoker } from "@/lib/data";

type Blok = "A" | "B" | "C";

/** Peta loker interaktif + panel detail yang menyesuaikan status pintu. */
export default function LokerMap() {
  const [blok, setBlok] = useState<Blok>("A");
  const [nomor, setNomor] = useState(117);

  const cfg = LOKER[blok];
  const s = statusLoker(blok, nomor);
  const kode = `${blok}-${String(nomor).padStart(3, "0")}`;
  const spesialRafif = blok === "A" && nomor === 117;

  const badge: { warna: "good" | "crit" | "mute"; label: string } =
    s === "isi" ? { warna: "good", label: "terisi" } :
    s === "rusak" ? { warna: "crit", label: "rusak" } : { warna: "mute", label: "kosong" };

  return (
    <div className="row">
      <section className="panel">
        <div className="hd">
          <h2>Peta loker</h2>
          <div className="r">
            <select aria-label="Pilih blok" value={blok}
              onChange={e => { const b = e.target.value as Blok; setBlok(b); setNomor(b === "A" ? 117 : 1); }}>
              <option value="A">Blok A — Asrama Putra (120)</option>
              <option value="B">Blok B — Asrama Putri (120)</option>
              <option value="C">Blok C — Gedung Akademik (132)</option>
            </select>
          </div>
        </div>
        <div className="lgrid" role="listbox" aria-label={`Peta loker blok ${blok}`}>
          {Array.from({ length: cfg.jumlah }, (_, i) => i + 1).map(n => {
            const st = statusLoker(blok, n);
            return (
              <button key={n} type="button" role="option" aria-selected={n === nomor}
                aria-label={`Loker ${blok}-${String(n).padStart(3, "0")}`}
                className={`lcell${st === "isi" ? " isi" : st === "rusak" ? " rusak" : ""}${n === nomor ? " sel" : ""}`}
                onClick={() => setNomor(n)}>
                {String(n).padStart(3, "0")}
              </button>
            );
          })}
        </div>
        <div className="lgd">
          <span><i style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)" }} /> terisi</span>
          <span><i style={{ background: "var(--surface)", border: "1px solid var(--rule)" }} /> kosong</span>
          <span><i style={{ background: "var(--crit-soft)", border: "1px solid var(--critical)" }} /> rusak</span>
          <span style={{ marginLeft: "auto" }}>klik loker untuk detail →</span>
        </div>
      </section>

      <section className="panel">
        <div className="hd"><h2>Loker {kode}</h2><Badge warna={badge.warna}>{badge.label}</Badge></div>
        <DetailKV blok={blok} nomor={nomor} s={s} spesialRafif={spesialRafif} />
        <AksiLoker s={s} />
        {s === "isi" ? (
          <div style={{ borderTop: "1px solid var(--rule)", marginTop: 14, paddingTop: 12 }}>
            <div className="hd"><h2>Riwayat akses loker ini</h2></div>
            <div className="tw">
              <table><tbody>
                <tr><td className="mono">06.31</td><td>dibuka — tap kartu</td><td><Badge warna="good">✓</Badge></td></tr>
                <tr><td className="mono">Kemarin 21.44</td><td>dibuka — tap kartu</td><td><Badge warna="good">✓</Badge></td></tr>
                <tr><td className="mono">Kemarin 06.28</td><td>dibuka — tap kartu</td><td><Badge warna="good">✓</Badge></td></tr>
              </tbody></table>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function DetailKV({ blok, nomor, s, spesialRafif }: { blok: Blok; nomor: number; s: StatusLoker; spesialRafif: boolean }) {
  const cfg = LOKER[blok];
  if (spesialRafif) {
    return (
      <dl className="kv">
        <dt>Penghuni</dt><dd>Rafif Gamma Wisanggeni · 7.A</dd>
        <dt>Penugasan</dt><dd>TA 2026/2027 · sejak 15 Jul 2026</dd>
        <dt>Biaya</dt><dd>{cfg.biaya}</dd>
        <dt>Buka terakhir</dt><dd>Hari ini 06.31 ✓</dd>
        <dt>Kartu</dt><dd><span className="st-chip blokir">diblokir</span> — tap kartu lama otomatis ditolak (F-03)</dd>
      </dl>
    );
  }
  if (s === "kosong") {
    return (
      <dl className="kv">
        <dt>Penghuni</dt><dd>— kosong</dd>
        <dt>Penugasan</dt><dd>Belum ada untuk TA 2026/2027</dd>
        <dt>Biaya</dt><dd>{cfg.biaya}</dd>
        <dt>Catatan</dt><dd>Bisa ditugaskan dari halaman siswa atau wizard massal</dd>
      </dl>
    );
  }
  if (s === "rusak") {
    return (
      <dl className="kv">
        <dt>Penghuni</dt><dd>Dipindah sementara</dd>
        <dt>Masalah</dt><dd>Solenoid tidak merespons</dd>
        <dt>Dilaporkan</dt><dd>Via portal siswa</dd>
        <dt>Akses barang</dt><dd>Kunci mekanik master + pendampingan pembina, tercatat</dd>
      </dl>
    );
  }
  return (
    <dl className="kv">
      <dt>Penghuni</dt><dd>{cfg.nama[nomor % cfg.nama.length]}</dd>
      <dt>Penugasan</dt><dd>TA 2026/2027 · sejak 15 Jul 2026</dd>
      <dt>Biaya</dt><dd>{cfg.biaya}</dd>
      <dt>Buka terakhir</dt><dd>Hari ini {String(6 + (nomor % 2)).padStart(2, "0")}.{String(10 + (nomor * 7) % 50).padStart(2, "0")} ✓</dd>
      <dt>Lokasi</dt><dd>{cfg.area}, lantai {nomor <= cfg.jumlah / 2 ? 1 : 2}</dd>
    </dl>
  );
}

function AksiLoker({ s }: { s: StatusLoker }) {
  if (s === "kosong") {
    return (
      <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <AksiContoh kelas="btn pri">Tugaskan ke siswa</AksiContoh>
        </div>
        <div className="p-note" style={{ marginTop: 10 }}>
          Penugasan mengikuti tahun ajaran — berakhir otomatis saat TA ditutup, barang diinventarisasi sebelum dialihkan.
        </div>
      </>
    );
  }
  if (s === "rusak") {
    return (
      <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <AksiContoh kelas="btn pri">Jadwalkan servis</AksiContoh>
          <AksiContoh>Tandai selesai diperbaiki</AksiContoh>
        </div>
        <div className="p-note" style={{ marginTop: 10 }}>
          Selama rusak, pintu tidak menerima tap. Akses barang lewat kunci mekanik master dengan pendampingan pembina — tercatat.
        </div>
      </>
    );
  }
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        <AksiContoh kelas="btn pri">🔓 Buka darurat</AksiContoh>
        <AksiContoh>Tandai rusak</AksiContoh>
        <AksiContoh>Kosongkan / alihkan</AksiContoh>
      </div>
      <div className="p-note" style={{ marginTop: 10 }}>
        Buka darurat butuh alasan &amp; nama petugas — masuk audit log dan ortu bisa melihatnya di riwayat
        kalau menyangkut barang anak.
      </div>
    </>
  );
}
