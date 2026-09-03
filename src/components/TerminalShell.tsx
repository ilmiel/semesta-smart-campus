"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ambilKunci, apiTerminal, hapusKunci, simpanKunci } from "@/lib/terminal";

/**
 * Kerangka bersama terminal layanan (laundry, perpustakaan, vending).
 *
 * Mengurus tiga hal yang sama di semua terminal: kunci perangkat, memuat
 * snapshot (identitas perangkat + kebijakan + data layanan), dan menandai
 * kalau server tidak terjangkau.
 *
 * Terminal kasir TIDAK memakai kerangka ini — ia punya antrian offline,
 * keranjang, dan tab sendiri yang membuat header-nya berbeda. Kalau nanti
 * ketiganya menyatu, kasir bisa ikut pindah ke sini.
 */

export interface Snapshot<T = unknown> {
  device: { kode: string; nama: string; layanan: string; lokasi: string | null };
  kebijakan: { ambang_pin_rp: number; limit_offline_rp: number; kumulatif_offline_rp: number; limit_harian_rp: number };
  menu?: T[];
  tarif?: T[];
}

export default function TerminalShell({ judul, layanan, anak }: {
  judul: string;
  /** Untuk pesan kesalahan yang jelas kalau kunci milik jenis terminal lain. */
  layanan: "laundry" | "perpustakaan" | "vending";
  anak: (s: { snap: Snapshot; muatUlang: () => Promise<void>; terjangkau: boolean }) => ReactNode;
}) {
  const [kunci, setKunci] = useState<string | null>(null);
  const [draf, setDraf] = useState("");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [terjangkau, setTerjangkau] = useState(true);
  const [pesan, setPesan] = useState("");
  const [siap, setSiap] = useState(false);

  const muat = useCallback(async () => {
    const r = await apiTerminal<Snapshot>("/api/terminal/snapshot");
    if (r.putus) { setTerjangkau(false); setSiap(true); return; }
    if (!r.ok) {
      setPesan(r.pesan ?? "Kunci perangkat ditolak server.");
      if (r.kode === "DEVICE_TIDAK_DIKENAL" || r.kode === "DEVICE_NONAKTIF" || r.status === 401) {
        hapusKunci(); setKunci(null);
      }
      setSiap(true); return;
    }
    setTerjangkau(true);
    setSnap(r.data!);
    if (r.data!.device.layanan !== layanan) {
      setPesan(`Kunci ini milik terminal ${r.data!.device.layanan}, bukan ${layanan}.`);
    } else {
      setPesan("");
    }
    setSiap(true);
  }, [layanan]);

  useEffect(() => {
    const k = ambilKunci();
    setKunci(k);
    if (k) void muat(); else setSiap(true);
  }, [muat]);

  if (!siap) {
    return <div className="root"><div className="t-shell"><p className="p-note">Memuat terminal…</p></div></div>;
  }

  if (!kunci) {
    return (
      <div className="root">
        <div className="t-shell" style={{ maxWidth: 560 }}>
          <section className="t-panel">
            <h1 style={{ fontSize: 18, margin: "0 0 6px" }}>{judul} — pengaturan</h1>
            <p className="p-note" style={{ marginTop: 0 }}>
              Masukkan kunci perangkat dari dashboard admin (Perangkat → Daftarkan).
              Kunci disimpan di penyimpanan lokal terminal ini.
            </p>
            {pesan ? <div className="t-err" style={{ marginBottom: 10 }}>{pesan}</div> : null}
            <div className="field">
              <label className="f" htmlFor="kunci">Kunci perangkat</label>
              <input id="kunci" type="password" style={{ width: "100%" }} value={draf}
                onChange={e => setDraf(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && draf.trim()) { simpanKunci(draf); setKunci(draf.trim()); void muat(); } }} />
            </div>
            <button type="button" className="btn pri blok" disabled={!draf.trim()}
              onClick={() => { simpanKunci(draf); setKunci(draf.trim()); void muat(); }}>
              Simpan &amp; hubungkan
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="root">
      <div className="t-shell" style={{ maxWidth: 900 }}>
        <div className="t-head">
          <span className="id">{snap?.device.kode ?? "…"}</span> · {snap?.device.nama ?? judul} ·{" "}
          <span className={`ks-status ${terjangkau ? "on" : "off"}`}>● {terjangkau ? "Online" : "Offline"}</span>
          <span style={{ marginLeft: "auto" }}>
            <button type="button" className="btn sm" onClick={() => { hapusKunci(); setKunci(null); setDraf(""); setSnap(null); }}>
              Ganti kunci
            </button>
          </span>
        </div>
        {pesan ? <div className="t-err" style={{ marginBottom: 12 }}>{pesan}</div> : null}
        {!terjangkau ? (
          <div className="t-err" style={{ marginBottom: 12 }}>
            Server tidak terjangkau. Terminal ini tidak punya mode offline — semua
            transaksinya butuh pemeriksaan server (PIN, kepemilikan, stok).
          </div>
        ) : null}
        {snap ? anak({ snap, muatUlang: muat, terjangkau }) : null}
      </div>
    </div>
  );
}
