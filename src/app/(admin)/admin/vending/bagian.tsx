"use client";

import { useState } from "react";
import { TautanContoh } from "@/components/Mock";
import { VENDING } from "@/lib/data";
import { rp } from "@/lib/format";

/** Planogram per mesin: slot → produk, harga, stok (F-114). */
export default function Planogram() {
  const [mesin, setMesin] = useState<"V1" | "V2">("V1");
  return (
    <section className="panel">
      <div className="hd">
        <h2>Planogram</h2>
        <div className="r">
          <select aria-label="Pilih mesin" value={mesin} onChange={e => setMesin(e.target.value as "V1" | "V2")}>
            <option value="V1">VEND-01 — Gd. Akademik lt. 1</option>
            <option value="V2">VEND-02 — Asrama Putra</option>
          </select>
        </div>
      </div>
      <div className="menu-grid">
        {VENDING[mesin].map(s => {
          const bermasalah = s.stok < 0, habis = s.stok === 0, tipis = s.stok > 0 && s.stok <= 4;
          const pct = bermasalah ? 0 : Math.round((s.stok / s.kapasitas) * 100);
          return (
            <div key={s.slot} className={`mcard${habis || bermasalah ? " offm" : ""}`}>
              <div className="mn"><span className="mono" style={{ color: "var(--ink-3)" }}>{s.slot}</span> {s.nama}</div>
              <div className="mk">
                {bermasalah ? <span style={{ color: "var(--crit-text)", fontWeight: 600 }}>slot dinonaktifkan — sensor</span>
                  : habis ? <span style={{ color: "var(--crit-text)", fontWeight: 600 }}>habis</span>
                  : tipis ? <span style={{ color: "var(--warn-text)", fontWeight: 600 }}>menipis — sisa {s.stok}</span>
                  : `stok ${s.stok}/${s.kapasitas}`}
              </div>
              <div className="mp">{rp(s.hargaRp)}</div>
              <div className="limitbar"><i className={tipis || habis ? "hot" : undefined} style={{ width: `${pct}%` }} /></div>
              <div className="mrow" style={{ marginTop: 8 }}>
                <span className="e"><TautanContoh>{bermasalah ? "Aktifkan setelah dicek" : "Ubah"}</TautanContoh></span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="p-note" style={{ marginTop: 12 }}>
        Stok berkurang otomatis per transaksi <span className="mono">selesai</span> (bukan{" "}
        <span className="mono">pending</span>). Selisih hitungan sistem vs fisik saat restock tampil untuk
        dicek — selisih besar = ada yang salah di sensor atau ada kehilangan.
      </div>
    </section>
  );
}
