"use client";

import { useState } from "react";

/**
 * Keypad PIN 6 digit — dipakai kasir, laundry, dan perpustakaan.
 * PIN tidak pernah disimpan: mockup langsung memanggil onLengkap;
 * di produksi nilainya dikirim ke server untuk verifikasi (F-33).
 */
export default function PinPad({ onLengkap, onBatal, labelBatal = "batal" }: {
  onLengkap: () => void;
  onBatal?: () => void;
  labelBatal?: string;
}) {
  const [n, setN] = useState(0); // hanya jumlah digit, bukan PIN-nya

  const tekan = () => {
    const baru = n + 1;
    setN(baru);
    if (baru === 6) setTimeout(() => { setN(0); onLengkap(); }, 250);
  };

  return (
    <>
      <div className="pin-dots" aria-label={`${n} dari 6 digit`} style={{ marginTop: 12 }}>
        {[0, 1, 2, 3, 4, 5].map(i => <i key={i} className={i < n ? "f" : undefined} />)}
      </div>
      <div className="keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => (
          <button key={d} type="button" onClick={tekan}>{d}</button>
        ))}
        <button type="button" className="fn" onClick={() => setN(v => Math.max(0, v - 1))}>hapus</button>
        <button type="button" onClick={tekan}>0</button>
        <button type="button" className="fn" onClick={() => { setN(0); onBatal?.(); }}>{labelBatal}</button>
      </div>
    </>
  );
}
