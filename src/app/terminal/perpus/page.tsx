"use client";

import { useState } from "react";
import PinPad from "@/components/PinPad";

export default function TerminalPerpus() {
  const [tab, setTab] = useState<"pinjam" | "kembali">("pinjam");
  const [tahapPinjam, setTahapPinjam] = useState<"scan" | "kartu" | "selesai">("scan");
  const [tolakBatas, setTolakBatas] = useState(false);
  const [tahapKembali, setTahapKembali] = useState<"scan" | "rincian" | "selesai">("scan");
  const [pesanKembali, setPesanKembali] = useState("");

  const selesaiKembali = (dipotong: boolean) => {
    setPesanKembali(dipotong
      ? "✓ Buku diterima — denda Rp 3.000 dipotong dari saldo Rafif. Kembalikan ke rak F-12. Pinjaman aktif Rafif sekarang: 1 (Wonder, jatuh tempo 5 Sep)."
      : "✓ Buku diterima — denda Rp 3.000 jadi tagihan menunggu di wallet Rafif. Ortu diberi tahu. Kembalikan buku ke rak F-12.");
    setTahapKembali("selesai");
  };

  return (
    <div className="root">
      <div className="t-shell">
        <div className="t-head">
          <span className="id">PERPUS-01</span> · Perpustakaan · <span className="on">● Online</span>
          <span style={{ marginLeft: "auto" }}>Petugas: Bu Sari · Selasa 2 Sep, 09.40</span>
        </div>
        <div className="t-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "pinjam"} className={tab === "pinjam" ? "on" : undefined} onClick={() => setTab("pinjam")}>📖 Pinjam</button>
          <button type="button" role="tab" aria-selected={tab === "kembali"} className={tab === "kembali" ? "on" : undefined} onClick={() => setTab("kembali")}>📚 Kembali</button>
        </div>

        {tab === "pinjam" ? (
          tahapPinjam === "scan" ? (
            <div className="t-panel">
              <p className="t-big" style={{ margin: "0 0 14px" }}><b>Langkah 1.</b> Scan barcode buku.</p>
              <button type="button" className="tapbtn" onClick={() => setTahapPinjam("kartu")}>▮▮ &nbsp;Simulasi: scan &quot;Harry Potter #1&quot;</button>
              <p className="p-note" style={{ margin: "12px 0 0" }}>
                Scanner barcode USB mode keyboard — sama seperti reader kartu, tanpa driver. Buku referensi
                otomatis ditolak di langkah ini (baca di tempat).
              </p>
            </div>
          ) : tahapPinjam === "kartu" ? (
            <div className="t-panel">
              <div className="t-siswa">
                <div className="foto">📕</div>
                <div><b>Harry Potter and the Philosopher&apos;s Stone</b><small>J.K. Rowling · Fiksi Inggris · eks. #2 dari 4 · rak F-21</small></div>
                <span className="badge good" style={{ marginLeft: "auto" }}>bisa dipinjam</span>
              </div>
              <p className="t-big" style={{ margin: "0 0 6px" }}><b>Langkah 2.</b> Tap kartu siswa.</p>
              <button type="button" className="tapbtn" onClick={() => setTahapPinjam("selesai")}>💳 &nbsp;Simulasi: tap kartu Keenan — pinjaman 1 dari 3</button>
              <button type="button" className="tapbtn alt" onClick={() => setTolakBatas(true)}>💳 Simulasi: tap kartu Nayla — pinjaman sudah 3 dari 3</button>
              {tolakBatas ? (
                <div className="t-err" style={{ marginTop: 12 }}>
                  ✕ Batas pinjam SMP: 3 buku — Nayla harus mengembalikan satu dulu. Terminal tidak punya
                  tombol pengecualian; izin khusus hanya dari dashboard pustakawan, dan tercatat.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="t-panel">
              <div className="t-ok">
                ✓ Dipinjam — <b>Harry Potter #1</b> oleh Keenan Alvaro (8.B).<br />
                Jatuh tempo <b>9 Sep</b> (7 hari, jenjang SMP). Pengingat otomatis H-1 lewat portal.
              </div>
              <p className="p-note" style={{ margin: "12px 0 0" }}>
                Tercatat di riwayat bacaan — terlihat oleh siswa, ortu, dan wali kelas (F-72). Tidak ada uang
                berpindah saat pinjam, jadi langkah ini tetap bisa saat offline.
              </p>
              <button type="button" className="btn blok" style={{ marginTop: 12 }}
                onClick={() => { setTahapPinjam("scan"); setTolakBatas(false); }}>Pinjam buku berikutnya</button>
            </div>
          )
        ) : (
          tahapKembali === "scan" ? (
            <div className="t-panel">
              <p className="t-big" style={{ margin: "0 0 14px" }}><b>Langkah 1.</b> Scan barcode buku yang dikembalikan.</p>
              <button type="button" className="tapbtn" onClick={() => setTahapKembali("rincian")}>▮▮ &nbsp;Simulasi: scan &quot;Bumi&quot; (pinjaman Rafif)</button>
            </div>
          ) : tahapKembali === "rincian" ? (
            <div className="t-panel">
              <div className="t-siswa">
                <div className="foto">📗</div>
                <div><b>Bumi — Tere Liye</b><small>dipinjam Rafif G. Wisanggeni (7.A) · 22 Agu · jatuh tempo 29 Agu</small></div>
                <span className="badge crit" style={{ marginLeft: "auto" }}>telat 3 hari</span>
              </div>
              <div className="t-total" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
                <span className="l">Denda keterlambatan (3 × Rp 1.000)</span><span className="v">Rp 3.000</span>
              </div>
              <p className="t-big" style={{ margin: "14px 0 0", textAlign: "center" }}>
                <b>Langkah 2.</b> Potong denda dari wallet — siswa masukkan PIN.
              </p>
              <PinPad onLengkap={() => selesaiKembali(true)} onBatal={() => selesaiKembali(false)} labelBatal="tanpa PIN" />
              <p className="p-note" style={{ textAlign: "center", margin: "12px 0 0" }}>
                &quot;Tanpa PIN&quot; = siswa tidak bawa kartu / saldo kurang — <b>buku tetap diterima</b>, denda
                jadi tagihan menunggu di wallet dan ortu diberi tahu (F-71).
              </p>
            </div>
          ) : (
            <div className="t-panel">
              <div className="t-ok">{pesanKembali}</div>
              <p className="p-note" style={{ margin: "12px 0 0" }}>
                Denda tercatat sebagai transaksi <span className="mono">denda</span> di ledger dengan rujukan
                pinjaman — muncul di riwayat siswa &amp; ortu seperti transaksi lain.
              </p>
              <button type="button" className="btn blok" style={{ marginTop: 12 }}
                onClick={() => setTahapKembali("scan")}>Terima buku berikutnya</button>
            </div>
          )
        )}

        <p className="p-note" style={{ marginTop: 16, textAlign: "center" }}>
          Pinjam/kembali bisa offline; hanya pemotongan denda yang butuh online (PIN dicek server, F-33).
        </p>
      </div>
    </div>
  );
}
