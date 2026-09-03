"use client";

import { useCallback, useEffect, useState } from "react";
import TerminalShell from "@/components/TerminalShell";
import { rp } from "@/lib/format";
import { apiTerminal, kunciIdem } from "@/lib/terminal";

/**
 * Layar mesin vending — dua fase (F-111).
 *
 *   Fase 1  vending/mulai      → saldo DITAHAN, transaksi berstatus pending
 *   Fase 2  vending/konfirmasi → sensor jatuh?  ya  = selesai, stok berkurang
 *                                               tidak = batal + refund seketika
 *
 * Di mesin sungguhan, fase 2 dikirim oleh controller berdasarkan sensor.
 * Di layar ini tombolnya manual supaya alurnya bisa diuji dan didemokan —
 * itu satu-satunya bagian yang "simulasi"; uang dan stoknya sungguhan.
 *
 * Tidak ada mode offline (F-110): mesin menolak melayani kalau server tidak
 * terjangkau, karena saldo tidak bisa ditahan tanpa server.
 */

interface Slot {
  slot_id: number; slot: string; produk: string | null; harga_rp: number | null;
  stok: number; kapasitas: number; aktif: boolean; bermasalah: boolean;
  disetujui_kesiswaan: boolean | null; bisa_dibeli: boolean; terjual_hari_ini: number;
}
interface Mulai { transaksi_id: number; baru: boolean; produk: string; harga_rp: number; nama: string; saldo_rp: number }
interface Konfirmasi { status: string; saldo_rp: number; refund_transaksi_id: number | null }

export default function TerminalVending() {
  return <TerminalShell judul="Mesin Vending" layanan="vending" anak={() => <Isi />} />;
}

function Isi() {
  const [slot, setSlot] = useState<Slot[]>([]);
  const [pilih, setPilih] = useState<Slot | null>(null);
  const [uid, setUid] = useState("");
  const [tahap, setTahap] = useState<"planogram" | "kartu" | "menunggu" | "hasil">("planogram");
  const [pending, setPending] = useState<Mulai | null>(null);
  const [hasil, setHasil] = useState<Konfirmasi | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  const muat = useCallback(async () => {
    const r = await apiTerminal<{ slot: Slot[] }>("/api/terminal/vending/planogram");
    if (r.ok) setSlot(r.data!.slot);
  }, []);
  useEffect(() => { void muat(); }, [muat]);

  function ulang() {
    setPilih(null); setUid(""); setPending(null); setHasil(null); setGalat("");
    setTahap("planogram"); void muat();
  }

  async function mulai() {
    if (!pilih) return;
    setSibuk(true); setGalat("");
    const r = await apiTerminal<Mulai>("/api/terminal/vending/mulai", {
      metode: "POST", body: { idem: kunciIdem(), uid: uid.trim().toUpperCase(), slot: pilih.slot },
    });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan ?? "Pembelian ditolak"); return; }
    setPending(r.data!); setTahap("menunggu");
  }

  async function konfirmasi(sensorOk: boolean) {
    if (!pending) return;
    setSibuk(true); setGalat("");
    const r = await apiTerminal<Konfirmasi>("/api/terminal/vending/konfirmasi", {
      metode: "POST",
      body: { transaksi_id: pending.transaksi_id, sensor_ok: sensorOk, alasan: sensorOk ? undefined : "Barang tidak terdeteksi jatuh" },
    });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan ?? "Konfirmasi gagal"); return; }
    setHasil(r.data!); setTahap("hasil");
  }

  return (
    <>
      {galat ? <div className="t-err" style={{ marginBottom: 12 }}>{galat}</div> : null}

      {tahap === "hasil" && hasil ? (
        <section className="t-panel">
          <div className={hasil.status === "selesai" ? "t-ok" : "t-err"}>
            {hasil.status === "selesai" ? (
              <>✓ Barang keluar. Sisa saldo {rp(hasil.saldo_rp)}.</>
            ) : (
              <>
                ✕ Sensor tidak mendeteksi barang jatuh — transaksi dibatalkan dan
                <b> uang dikembalikan seketika</b>. Saldo {rp(hasil.saldo_rp)}.
                {hasil.refund_transaksi_id ? <> Refund #{hasil.refund_transaksi_id}.</> : null}
                <br />Slot ditandai bermasalah supaya tidak dipakai siswa berikutnya.
              </>
            )}
          </div>
          <button type="button" className="btn pri blok" style={{ marginTop: 12 }} onClick={ulang}>Selesai</button>
        </section>
      ) : tahap === "menunggu" && pending ? (
        <section className="t-panel">
          <p className="t-big" style={{ margin: "0 0 4px" }}>
            <b>{pending.produk}</b> · {rp(pending.harga_rp)} · {pending.nama}
          </p>
          <div className="t-ok" style={{ marginTop: 8 }}>
            Saldo <b>ditahan</b>, belum dipotong permanen. Menunggu sensor.
          </div>
          <p className="p-note" style={{ margin: "10px 0" }}>
            Di mesin sungguhan, dua tombol di bawah ini dikirim otomatis oleh controller
            berdasarkan sensor jatuh. Di sini manual supaya alurnya bisa diuji.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn pri" style={{ flex: 1, justifyContent: "center", minHeight: 52 }}
              disabled={sibuk} onClick={() => void konfirmasi(true)}>Sensor: barang jatuh ✓</button>
            <button type="button" className="btn danger" style={{ flex: 1, justifyContent: "center", minHeight: 52 }}
              disabled={sibuk} onClick={() => void konfirmasi(false)}>Sensor: gagal ✕</button>
          </div>
        </section>
      ) : tahap === "kartu" && pilih ? (
        <section className="t-panel">
          <p className="t-big" style={{ margin: "0 0 4px" }}>
            <b>{pilih.produk}</b> · slot {pilih.slot} · {pilih.harga_rp !== null ? rp(pilih.harga_rp) : "—"}
          </p>
          <div className="field" style={{ marginTop: 10 }}>
            <label className="f" htmlFor="uid">Tap kartu (UID)</label>
            <input id="uid" autoFocus style={{ width: "100%", fontFamily: "monospace" }} value={uid}
              onChange={e => setUid(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === "Enter" && uid.trim().length >= 8) void mulai(); }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn pri" style={{ flex: 1, justifyContent: "center", minHeight: 52 }}
              disabled={sibuk || uid.trim().length < 8} onClick={() => void mulai()}>
              {sibuk ? "Memproses…" : "Beli"}
            </button>
            <button type="button" className="btn" style={{ flex: 1, justifyContent: "center" }} onClick={ulang}>Batal</button>
          </div>
          <p className="p-note" style={{ margin: "10px 0 0" }}>
            Batas harian vending per kartu ditegakkan server — transaksi yang tertahan
            (pending) ikut dihitung.
          </p>
        </section>
      ) : (
        <section className="t-panel">
          <div className="hd" style={{ marginBottom: 8 }}>
            <h2 style={{ fontSize: 15 }}>Pilih produk</h2>
            <div className="r"><button type="button" className="btn sm" onClick={() => void muat()}>Muat ulang</button></div>
          </div>
          {slot.length === 0 ? <p className="p-note" style={{ margin: 0 }}>Belum ada slot terkonfigurasi untuk mesin ini.</p> : null}
          <div className="ks-menu">
            {slot.map(s => (
              <button key={s.slot_id} type="button" disabled={!s.bisa_dibeli}
                onClick={() => { setPilih(s); setTahap("kartu"); }}
                title={!s.bisa_dibeli ? "Tidak tersedia" : undefined}>
                <span className="em">{s.slot}</span>
                {s.produk ?? "(kosong)"}
                <span className="hg">
                  {s.harga_rp !== null ? rp(s.harga_rp) : "—"} · stok {s.stok}
                  {s.bermasalah ? " · bermasalah" : !s.aktif ? " · nonaktif" : s.stok <= 0 ? " · habis" : ""}
                </span>
              </button>
            ))}
          </div>
          <p className="p-note" style={{ margin: "12px 0 0" }}>
            Produk hanya muncul kalau sudah disetujui kesiswaan (F-115). Slot bermasalah
            dinonaktifkan otomatis setelah sensor gagal, sampai petugas memulihkannya.
          </p>
        </section>
      )}
    </>
  );
}
