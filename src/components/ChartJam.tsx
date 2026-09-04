"use client";

import { useRef, useState } from "react";

export interface Jam { jam: number; jumlah: number; nilai_rp?: number | null }

/**
 * Grafik batang transaksi per jam.
 *
 * Skala Y dihitung dari data, tidak dipatok konstanta seperti sebelumnya:
 * sumbu yang dipatok membuat hari sibuk terpotong dan hari sepi terlihat
 * seperti tidak ada transaksi sama sekali.
 *
 * Jam yang tidak punya transaksi tidak dikirim server (view-nya GROUP BY),
 * jadi jam 6–21 diisi di sini supaya sumbu X tetap utuh dan jam kosong
 * terlihat sebagai kosong — bukan sebagai jam yang hilang.
 */
const MULAI = 6;
const SELESAI = 21;

export default function ChartJam({ data }: { data: Jam[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; jam: number; n: number } | null>(null);

  const peta = new Map(data.map(d => [d.jam, d.jumlah]));
  const baris: Jam[] = [];
  for (let j = MULAI; j <= SELESAI; j++) baris.push({ jam: j, jumlah: peta.get(j) ?? 0 });

  const puncak = Math.max(...baris.map(b => b.jumlah), 1);
  const maks = tingkatBulat(puncak);
  // Set: saat maks = 1 (hari yang belum ada transaksinya), 0/1/1 akan
  // menghasilkan dua anak dengan key sama — dan itu justru keadaan setiap
  // pagi sebelum transaksi pertama.
  const ticks = [...new Set([0, Math.round(maks / 2), maks])];

  return (
    <div className="chart" ref={ref}>
      <div className="plot">
        {ticks.filter(t => t > 0).map(t => (
          <div key={t} className="gline" style={{ top: `${(1 - t / maks) * 100}%` }} />
        ))}
        <div className="bars">
          {baris.map(({ jam, jumlah }) => (
            <div key={jam} className="bcol"
              onMouseMove={e => {
                const r = ref.current?.getBoundingClientRect();
                if (!r) return;
                let x = e.clientX - r.left + 12;
                if (x + 150 > r.width) x -= 165;
                setTip({ x, y: e.clientY - r.top - 10, jam, n: jumlah });
              }}
              onMouseLeave={() => setTip(null)}>
              <div className="bar" style={{ height: `${(jumlah / maks) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>
      {ticks.map(t => (
        <div key={t} className="ylab" style={{ top: `calc((100% - 22px) * ${(1 - t / maks)})` }}>{t}</div>
      ))}
      <div className="xlab">
        {baris.map(({ jam }) => (
          <span key={jam}>{jam % 3 === 0 ? String(jam).padStart(2, "0") : ""}</span>
        ))}
      </div>
      {tip ? (
        <div className="tip" style={{ display: "block", left: tip.x, top: tip.y }}>
          <b>{tip.n} transaksi</b><br />
          <span className="t2">{String(tip.jam).padStart(2, "0")}.00–{String(tip.jam).padStart(2, "0")}.59</span>
        </div>
      ) : null}
    </div>
  );
}

/** Bulatkan batas atas ke angka yang enak dibaca (10, 20, 50, 100, …). */
function tingkatBulat(n: number): number {
  const pangkat = 10 ** Math.floor(Math.log10(n));
  for (const k of [1, 2, 5, 10]) {
    if (n <= k * pangkat) return k * pangkat;
  }
  return 10 * pangkat;
}
