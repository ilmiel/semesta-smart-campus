"use client";

import { useState } from "react";
import { CatatanKaki, Panel } from "@/components/ui";
import { apiAdmin, useMuat, waktuSingkat } from "@/lib/admin";
import { rp } from "@/lib/format";

/**
 * Pengaturan kebijakan global.
 *
 * Semua angka yang mengatur uang, PIN, jam PO, dan batas layanan hidup di
 * tabel `kebijakan` dan dibaca ulang oleh fungsi SQL setiap transaksi —
 * mengubahnya di sini langsung berlaku, tanpa deploy.
 *
 * Dua hal yang sengaja tidak bisa dilakukan dari sini, karena server
 * menolaknya:
 *
 *   - Ambang PIN dan limit offline tidak bisa diubah terpisah (F-33). Kalau
 *     ambang PIN lebih tinggi dari limit offline, terminal offline bisa
 *     memotong saldo di atas ambang tanpa pernah meminta PIN. Keduanya
 *     diubah oleh satu nilai.
 *   - Nilai di luar akal (pin_maks_gagal < 3, laundry_min_kg > maks) ditolak
 *     `kebijakan_set` beserta alasannya. Pesan servernya ditampilkan apa
 *     adanya di baris yang bersangkutan.
 *
 * Setiap perubahan tercatat di audit_log dengan nilai sebelum & sesudah.
 */

interface Kebijakan {
  kunci: string;
  nilai: unknown;
  keterangan: string | null;
  diubah: string | null;
  diubah_oleh: string | null;
}

const KELOMPOK: { judul: string; sub: string; kunci: string[] }[] = [
  {
    judul: "Uang & limit siswa", sub: "berlaku untuk semua siswa; wali hanya bisa menurunkan limit harian",
    kunci: ["limit_harian_rp", "plafon_saldo_rp", "topup_min_rp", "topup_max_rp", "saldo_rendah_rp"],
  },
  {
    judul: "PIN & mode offline", sub: "ambang PIN mengikat limit offline — F-33",
    kunci: ["ambang_pin_rp", "kumulatif_offline_rp", "pin_maks_gagal", "pin_kunci_menit"],
  },
  { judul: "Kasir", sub: "pembatalan transaksi oleh kasir", kunci: ["batal_kasir_menit"] },
  {
    judul: "Kantin & pra-pesan", sub: "jam PO memakai waktu Asia/Jakarta",
    kunci: ["po_aktif", "po_buka", "po_tutup", "po_ambil_mulai", "po_ambil_selesai", "po_tidak_diambil"],
  },
  { judul: "Vending", sub: "batas per kartu per hari", kunci: ["vending_maks_transaksi", "vending_maks_rp", "vending_pending_detik"] },
  { judul: "Laundry", sub: "batas berat & tarif express", kunci: ["laundry_min_kg", "laundry_maks_kg", "laundry_express_persen", "laundry_telat_hari"] },
  { judul: "Fitur", sub: "saklar fitur yang belum dibuka", kunci: ["transfer_aktif"] },
];

const JAM = ["po_buka", "po_tutup", "po_ambil_mulai", "po_ambil_selesai"];

function jenisKunci(k: string): "boolean" | "jam" | "pilihan" | "angka" {
  if (k === "transfer_aktif" || k === "po_aktif") return "boolean";
  if (JAM.includes(k)) return "jam";
  if (k === "po_tidak_diambil") return "pilihan";
  return "angka";
}

export default function Bagian() {
  const { data, galat, sedang, muatUlang } = useMuat<{ kebijakan: Kebijakan[] }>("/api/admin/kebijakan");
  const semua = data?.kebijakan ?? [];
  const peta = new Map(semua.map(k => [k.kunci, k]));
  const dipakai = new Set(KELOMPOK.flatMap(g => g.kunci).concat("limit_offline_rp"));
  const sisa = semua.filter(k => !dipakai.has(k.kunci));

  return (
    <>
      <div className="top">
        <div>
          <h1>Kebijakan</h1>
          <div className="sub">
            Angka yang mengatur uang, PIN, dan batas layanan. Berlaku seketika untuk semua
            terminal — terminal membacanya ulang setiap sinkron.
          </div>
        </div>
        <div className="right">
          <button type="button" className="btn" onClick={() => void muatUlang()}>Muat ulang</button>
        </div>
      </div>

      {galat ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div> : null}
      {sedang && semua.length === 0 ? <p className="p-note">Memuat kebijakan…</p> : null}

      {KELOMPOK.map(g => {
        const baris = g.kunci.map(k => peta.get(k)).filter((x): x is Kebijakan => Boolean(x));
        if (baris.length === 0) return null;
        return (
          <Panel key={g.judul} judul={g.judul} sub={g.sub}>
            <div className="kb-daftar">
              {baris.map(b => (
                // Kunci ikut menyertakan nilai supaya baris ini dipasang ulang
                // setelah muatUlang: kalau tidak, draf lokal bertahan dan layar
                // menampilkan angka yang berbeda dari isi database.
                <Baris key={`${b.kunci}:${String(b.nilai)}`} isi={b}
                  pasangan={b.kunci === "ambang_pin_rp" ? peta.get("limit_offline_rp") : undefined}
                  selesai={muatUlang} />
              ))}
            </div>
          </Panel>
        );
      })}

      {sisa.length > 0 ? (
        <Panel judul="Kebijakan lain" sub="kunci yang ditambahkan migrasi terbaru">
          <div className="kb-daftar">
            {sisa.map(b => <Baris key={`${b.kunci}:${String(b.nilai)}`} isi={b} selesai={muatUlang} />)}
          </div>
        </Panel>
      ) : null}

      <CatatanKaki>
        Setiap perubahan tercatat di audit_log lengkap dengan nilai sebelum dan sesudah,
        beserta siapa yang mengubahnya. Nilai yang ditolak server (misalnya minimal kg di atas
        maksimal kg) tidak tersimpan sebagian — seluruh perubahan dibatalkan.
      </CatatanKaki>
    </>
  );
}

function Baris({ isi, pasangan, selesai }: {
  isi: Kebijakan;
  /** Untuk ambang_pin_rp: baris limit_offline_rp yang ikut berubah. */
  pasangan?: Kebijakan;
  selesai: () => Promise<void>;
}) {
  const jenis = jenisKunci(isi.kunci);
  const awal = String(isi.nilai ?? "");
  const [draf, setDraf] = useState(awal);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);

  const berubah = draf !== awal;

  async function simpan() {
    setSibuk(true); setPesan(""); setGagal(false);
    const nilai: unknown =
      jenis === "boolean" ? draf === "true"
        : jenis === "angka" ? Number(draf)
          : draf;

    if (jenis === "angka" && !Number.isFinite(nilai as number)) {
      setSibuk(false); setGagal(true); setPesan("Harus berupa angka."); return;
    }

    // F-33: ambang PIN dan limit offline hanya bisa diubah lewat satu jalur.
    const body = isi.kunci === "ambang_pin_rp"
      ? { ambang_pin_rp: nilai }
      : { kunci: isi.kunci, nilai };

    const r = await apiAdmin("/api/admin/kebijakan", { metode: "PUT", body });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Gagal menyimpan"); return; }
    setPesan("Tersimpan.");
    await selesai();
  }

  return (
    <div className="kb-baris">
      <div className="kb-info">
        <div className="kb-kunci">
          <code>{isi.kunci}</code>
          {pasangan ? <span className="badge info" style={{ marginLeft: 6 }}>+ limit_offline_rp</span> : null}
        </div>
        <div className="p-note" style={{ margin: 0 }}>{isi.keterangan ?? "—"}</div>
        {isi.diubah ? (
          <div className="p-note" style={{ margin: 0, opacity: 0.75 }}>
            terakhir diubah {waktuSingkat(isi.diubah)}{isi.diubah_oleh ? ` oleh ${isi.diubah_oleh}` : ""}
          </div>
        ) : null}
        {pesan ? (
          <div className={gagal ? "a-err" : "a-ok"} style={{ marginTop: 6 }}>{pesan}</div>
        ) : null}
      </div>

      <div className="kb-atur">
        {jenis === "boolean" ? (
          <select value={draf} onChange={e => setDraf(e.target.value)}>
            <option value="true">aktif</option>
            <option value="false">nonaktif</option>
          </select>
        ) : jenis === "pilihan" ? (
          <select value={draf} onChange={e => setDraf(e.target.value)}>
            <option value="tetap_ditagih">tetap ditagih</option>
            <option value="refund">refund</option>
          </select>
        ) : jenis === "jam" ? (
          <input type="time" value={draf.slice(0, 5)} onChange={e => setDraf(e.target.value)} />
        ) : (
          <input type="number" inputMode="numeric" min={0} value={draf}
            onChange={e => setDraf(e.target.value)} style={{ textAlign: "right", width: 130 }} />
        )}

        {jenis === "angka" && isi.kunci.endsWith("_rp") && Number.isFinite(Number(draf)) ? (
          <span className="p-note" style={{ margin: 0, minWidth: 96, textAlign: "right" }}>{rp(Number(draf))}</span>
        ) : null}

        <button type="button" className="btn pri" disabled={!berubah || sibuk} onClick={() => void simpan()}>
          {sibuk ? "…" : "Simpan"}
        </button>
        {berubah ? (
          <button type="button" className="btn sm" onClick={() => { setDraf(awal); setPesan(""); }}>Batal</button>
        ) : null}
      </div>
    </div>
  );
}
