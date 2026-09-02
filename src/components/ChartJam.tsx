"use client";

import { useRef, useState } from "react";
import { TRANSAKSI_PER_JAM } from "@/lib/data";

const MAKS = 140;
const TICKS = [0, 50, 100];

/** Grafik batang transaksi per jam dengan tooltip hover. */
export default function ChartJam() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; jam: number; n: number } | null>(null);

  return (
    <div className="chart" ref={ref}>
      <div className="plot">
        {TICKS.filter(t => t > 0).map(t => (
          <div key={t} className="gline" style={{ top: `${(1 - t / MAKS) * 100}%` }} />
        ))}
        <div className="bars">
          {TRANSAKSI_PER_JAM.map(({ jam, jumlah }) => (
            <div key={jam} className="bcol"
              onMouseMove={e => {
                const r = ref.current?.getBoundingClientRect();
                if (!r) return;
                let x = e.clientX - r.left + 12;
                if (x + 150 > r.width) x -= 165;
                setTip({ x, y: e.clientY - r.top - 10, jam, n: jumlah });
              }}
              onMouseLeave={() => setTip(null)}>
              <div className="bar" style={{ height: `${(jumlah / MAKS) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>
      {TICKS.map(t => (
        <div key={t} className="ylab" style={{ top: `calc((100% - 22px) * ${(1 - t / MAKS)})` }}>{t}</div>
      ))}
      <div className="xlab">
        {TRANSAKSI_PER_JAM.map(({ jam }) => (
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
