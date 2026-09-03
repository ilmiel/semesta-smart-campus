"use client";

import { useState } from "react";

/**
 * Keypad PIN 6 digit — dipakai kasir, laundry, dan perpustakaan.
 *
 * PIN dipegang di state komponen ini saja, dikirim sekali lewat `onLengkap`,
 * lalu segera dilupakan. Jangan pernah menyimpannya di localStorage, mengirim
 * ke analitik, atau menaruhnya di URL (F-33).
 */
export default function PinPad({ onLengkap, onBatal, labelBatal = "batal", sibuk = false }: {
  onLengkap: (pin: string) => void;
  onBatal?: () => void;
  labelBatal?: string;
  sibuk?: boolean;
}) {
  const [pin, setPin] = useState("");

  const tekan = (d: string) => {
    if (sibuk || pin.length >= 6) return;
    const baru = pin + d;
    setPin(baru);
    if (baru.length === 6) {
      setTimeout(() => { setPin(""); onLengkap(baru); }, 150);
    }
  };

  return (
    <>
      <div className="pin-dots" aria-label={`${pin.length} dari 6 digit`} style={{ marginTop: 12 }}>
        {[0, 1, 2, 3, 4, 5].map(i => <i key={i} className={i < pin.length ? "f" : undefined} />)}
      </div>
      <div className="keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => (
          <button key={d} type="button" disabled={sibuk} onClick={() => tekan(d)}>{d}</button>
        ))}
        <button type="button" className="fn" disabled={sibuk} onClick={() => setPin(v => v.slice(0, -1))}>hapus</button>
        <button type="button" disabled={sibuk} onClick={() => tekan("0")}>0</button>
        <button type="button" className="fn" onClick={() => { setPin(""); onBatal?.(); }}>{labelBatal}</button>
      </div>
    </>
  );
}
