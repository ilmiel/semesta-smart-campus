"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { AksiContoh, TautanContoh } from "@/components/Mock";
import { useToast } from "@/components/Toast";
import { MENU_KANTIN } from "@/lib/data";
import { rp } from "@/lib/format";

/** Saklar + jadwal PO (F-49). State lokal — nanti tersimpan di server. */
export function PengaturanPO() {
  const toast = useToast();
  const [aktif, setAktif] = useState(true);
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="hd">
        <h2>Pra-pesan (PO)</h2>
        <Badge warna={aktif ? "good" : "crit"}>{aktif ? "aktif · buka 05.30–10.30" : "nonaktif"}</Badge>
        <div className="r" style={{ alignItems: "center" }}>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>aktifkan PO</span>
          <label className="switch">
            <input type="checkbox" checked={aktif}
              onChange={e => {
                setAktif(e.target.checked);
                toast(e.target.checked
                  ? "PO diaktifkan — portal menampilkan jam buka"
                  : "PO dinonaktifkan — portal langsung menampilkan PO tutup");
              }} />
            <i />
          </label>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, alignItems: "end" }}>
        <div className="field" style={{ margin: 0 }}>
          <label className="f" htmlFor="po-buka">Jam buka PO</label>
          <input type="text" id="po-buka" defaultValue="05.30" style={{ width: "100%" }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="f" htmlFor="po-tutup">Jam tutup PO</label>
          <input type="text" id="po-tutup" defaultValue="10.30" style={{ width: "100%" }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="f" htmlFor="po-ambil">Jendela pengambilan</label>
          <input type="text" id="po-ambil" defaultValue="11.30 – 13.30" style={{ width: "100%" }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="f" htmlFor="po-kebijakan">Tidak diambil sampai tutup</label>
          <select id="po-kebijakan" style={{ width: "100%" }} defaultValue="Tetap ditagih (makanan sudah dibuat)">
            <option>Tetap ditagih (makanan sudah dibuat)</option>
            <option>Refund otomatis</option>
          </select>
        </div>
        <AksiContoh kelas="btn pri" gaya={{ minHeight: 42 }}>Simpan pengaturan</AksiContoh>
      </div>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 14, fontSize: 13, color: "var(--ink-2)" }}>
        <span>Hari ini: <b>74 PO</b> · lunas semua saat pesan</span>
        <span>Sudah diambil: <b>58</b></span>
        <span>Siap menunggu: <b>16</b></span>
        <span>Batal sebelum tutup (refund otomatis): <b>3</b></span>
      </div>
      <div className="p-note" style={{ marginTop: 10 }}>
        Batal sebelum jam tutup → refund otomatis penuh (F-48). PO membawa rincian item — data menu untuk
        dapur tetap ada meski kasir memakai mode nominal (F-47). Setiap perubahan pengaturan tercatat di audit log (F-49).
      </div>
    </div>
  );
}

/** Kartu menu dengan saklar aktif/nonaktif (state lokal). */
export function GridMenu() {
  const [menu, setMenu] = useState(MENU_KANTIN);
  return (
    <div className="menu-grid">
      {menu.map((m, i) => (
        <div key={m.nama} className={`mcard${m.aktif ? "" : " offm"}`}>
          <div className="mn">{m.nama}</div>
          <div className="mk">{m.kategori}{m.aktif ? "" : ` · nonaktif${m.catatan ? ` — ${m.catatan}` : ""}`}</div>
          <div className="mp">{rp(m.hargaRp)}</div>
          <div className="mrow">
            <label className="switch">
              <input type="checkbox" checked={m.aktif}
                onChange={() => setMenu(v => v.map((x, j) => j === i ? { ...x, aktif: !x.aktif } : x))} />
              <i />
            </label>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{m.aktif ? "aktif" : "nonaktif"}</span>
            <span className="e"><TautanContoh>Ubah</TautanContoh></span>
          </div>
        </div>
      ))}
    </div>
  );
}
