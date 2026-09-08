"use client";

import { useState } from "react";
import { CatatanKaki, Panel } from "@/components/ui";
import { api, useMuat, waktuSingkat } from "@/lib/api";
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

const KUNCI_TOPUP = [
  "topup_metode",
  "topup_bank_nama",
  "topup_bank_rekening",
  "topup_bank_atas_nama",
  "topup_bank_petunjuk",
  "gateway_provider",
  "gateway_api_key",
  "gateway_webhook_token",
];

export default function Bagian() {
  const { data, galat, sedang, muatUlang } = useMuat<{ kebijakan: Kebijakan[] }>("/api/admin/kebijakan");
  const semua = data?.kebijakan ?? [];
  const peta = new Map(semua.map(k => [k.kunci, k]));
  const dipakai = new Set(KELOMPOK.flatMap(g => g.kunci).concat("limit_offline_rp", KUNCI_TOPUP));
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

      <PanelMetodeTopup peta={peta} selesai={muatUlang} />

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

    const r = await api("/api/admin/kebijakan", { metode: "PUT", body });
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

function PanelMetodeTopup({ peta, selesai }: { peta: Map<string, Kebijakan>; selesai: () => Promise<void> }) {
  const metodeAwal = (peta.get("topup_metode")?.nilai as string) || "verifikasi_admin";
  const [metode, setMetode] = useState(metodeAwal);

  // Bank fields
  const [bankNama, setBankNama] = useState(String(peta.get("topup_bank_nama")?.nilai ?? "Bank Central Asia (BCA)"));
  const [bankRekening, setBankRekening] = useState(String(peta.get("topup_bank_rekening")?.nilai ?? "8230918239"));
  const [bankAtasNama, setBankAtasNama] = useState(String(peta.get("topup_bank_atas_nama")?.nilai ?? "Yayasan Semesta Smart Campus"));
  const [bankPetunjuk, setBankPetunjuk] = useState(String(peta.get("topup_bank_petunjuk")?.nilai ?? "Transfer sesuai nominal tagihan. Foto atau unggah bukti transfer. Saldo akan otomatis bertambah setelah diverifikasi admin."));

  // Gateway fields
  const [gwProvider, setGwProvider] = useState(String(peta.get("gateway_provider")?.nilai ?? "mayar"));
  const [gwApiKey, setGwApiKey] = useState(String(peta.get("gateway_api_key")?.nilai ?? ""));
  const [gwWebhookToken, setGwWebhookToken] = useState(String(peta.get("gateway_webhook_token")?.nilai ?? ""));

  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);

  async function simpanPengaturan(targetMetode: string) {
    setSibuk(true); setPesan(""); setGagal(false);
    const batch = [
      { kunci: "topup_metode", nilai: targetMetode },
      { kunci: "topup_bank_nama", nilai: bankNama.trim() },
      { kunci: "topup_bank_rekening", nilai: bankRekening.trim() },
      { kunci: "topup_bank_atas_nama", nilai: bankAtasNama.trim() },
      { kunci: "topup_bank_petunjuk", nilai: bankPetunjuk.trim() },
      { kunci: "gateway_provider", nilai: gwProvider.trim() },
      { kunci: "gateway_api_key", nilai: gwApiKey.trim() },
      { kunci: "gateway_webhook_token", nilai: gwWebhookToken.trim() },
    ];
    const r = await api("/api/admin/kebijakan", { metode: "PUT", body: { batch } });
    setSibuk(false);
    if (!r.ok) {
      setGagal(true);
      setPesan(r.pesan ?? "Gagal menyimpan pengaturan top-up");
      return;
    }
    setMetode(targetMetode);
    setPesan(`Pengaturan metode top-up "${targetMetode === "verifikasi_admin" ? "Verifikasi Admin" : "Payment Gateway"}" berhasil disimpan.`);
    await selesai();
  }

  return (
    <Panel
      judul="Metode Top-Up Saldo"
      sub="Tentukan cara orang tua mengisi saldo: Verifikasi Admin (Transfer Bank Manual) atau Payment Gateway Otomatis"
    >
      <div style={{ padding: "4px 0 12px" }}>
        {pesan ? (
          <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 16 }}>
            {pesan}
          </div>
        ) : null}

        {/* Tab Pemilihan Metode */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 18 }}>
          <button
            type="button"
            className="btn"
            style={{
              padding: "14px 16px",
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              borderRadius: 12,
              border: metode === "verifikasi_admin" ? "2px solid var(--brand-pri, #10b981)" : "1px solid var(--border, #e5e7eb)",
              background: metode === "verifikasi_admin" ? "var(--brand-soft, rgba(16, 185, 129, 0.08))" : "var(--surface, #fff)",
              cursor: "pointer",
            }}
            onClick={() => { setMetode("verifikasi_admin"); setPesan(""); }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>🏦 Verifikasi Admin (Transfer)</span>
              {metodeAwal === "verifikasi_admin" ? <span className="badge ok" style={{ fontSize: 11 }}>Sedang Aktif</span> : null}
            </div>
            <span style={{ fontSize: 13, opacity: 0.85, fontWeight: 400, lineHeight: 1.4 }}>
              Ortu transfer ke rekening sekolah & unggah foto bukti struk. Staf TU/Keuangan memverifikasi di menu <b>Keuangan</b>.
            </span>
          </button>

          <button
            type="button"
            className="btn"
            style={{
              padding: "14px 16px",
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              borderRadius: 12,
              border: metode === "gateway" ? "2px solid var(--brand-pri, #10b981)" : "1px solid var(--border, #e5e7eb)",
              background: metode === "gateway" ? "var(--brand-soft, rgba(16, 185, 129, 0.08))" : "var(--surface, #fff)",
              cursor: "pointer",
            }}
            onClick={() => { setMetode("gateway"); setPesan(""); }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>⚡ Payment Gateway (Otomatis)</span>
              {metodeAwal === "gateway" ? <span className="badge ok" style={{ fontSize: 11 }}>Sedang Aktif</span> : null}
            </div>
            <span style={{ fontSize: 13, opacity: 0.85, fontWeight: 400, lineHeight: 1.4 }}>
              Pembayaran online otomatis via Mayar.id atau Midtrans. Saldo siswa langsung masuk begitu invoice dibayar.
            </span>
          </button>
        </div>

        {/* Form Verifikasi Admin */}
        {metode === "verifikasi_admin" ? (
          <div style={{ background: "var(--surface-sunken, #f8fafc)", border: "1px solid var(--border, #e2e8f0)", borderRadius: 12, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 18 }}>📋</span>
              <div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Data Rekening Tujuan Transfer Manual</h4>
                <p className="p-note" style={{ margin: "2px 0 0" }}>Informasi ini tampil di Portal Orang Tua saat membuat permintaan top-up</p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              <div>
                <label className="f" style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Nama Bank / E-Wallet</label>
                <input
                  type="text"
                  value={bankNama}
                  placeholder="Contoh: Bank Central Asia (BCA)"
                  style={{ width: "100%" }}
                  onChange={e => setBankNama(e.target.value)}
                />
              </div>

              <div>
                <label className="f" style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Nomor Rekening / No. Akun</label>
                <input
                  type="text"
                  value={bankRekening}
                  placeholder="Contoh: 8230918239"
                  style={{ width: "100%", fontFamily: "monospace", letterSpacing: 1 }}
                  onChange={e => setBankRekening(e.target.value)}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label className="f" style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Atas Nama Rekening</label>
                <input
                  type="text"
                  value={bankAtasNama}
                  placeholder="Contoh: Yayasan Semesta Smart Campus"
                  style={{ width: "100%" }}
                  onChange={e => setBankAtasNama(e.target.value)}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label className="f" style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Petunjuk / Catatan Transfer untuk Ortu</label>
                <textarea
                  rows={2}
                  value={bankPetunjuk}
                  placeholder="Petunjuk transfer untuk orang tua siswa"
                  style={{ width: "100%", borderRadius: 8, padding: 8 }}
                  onChange={e => setBankPetunjuk(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                className="btn pri"
                disabled={sibuk}
                onClick={() => void simpanPengaturan("verifikasi_admin")}
              >
                {sibuk ? "Menyimpan…" : "Simpan & Terapkan Verifikasi Admin"}
              </button>
            </div>
          </div>
        ) : null}

        {/* Form Payment Gateway */}
        {metode === "gateway" ? (
          <div style={{ background: "var(--surface-sunken, #f8fafc)", border: "1px solid var(--border, #e2e8f0)", borderRadius: 12, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 18 }}>🔑</span>
              <div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Konfigurasi API Key & Webhook Gateway</h4>
                <p className="p-note" style={{ margin: "2px 0 0" }}>Disimpan di database; langsung berlaku seketika tanpa redeploy Vercel</p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              <div>
                <label className="f" style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Penyedia Gateway</label>
                <select value={gwProvider} style={{ width: "100%" }} onChange={e => setGwProvider(e.target.value)}>
                  <option value="mayar">Mayar.id</option>
                  <option value="midtrans">Midtrans</option>
                  <option value="simulasi">Simulasi Dev (Uji Coba)</option>
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label className="f" style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>API Key Gateway</label>
                <input
                  type="password"
                  value={gwApiKey}
                  placeholder="Masukkan API Key (misal: mayar_api_key_...)"
                  style={{ width: "100%", fontFamily: "monospace" }}
                  onChange={e => setGwApiKey(e.target.value)}
                />
                <p className="p-note" style={{ margin: "4px 0 0" }}>Tersimpan secara terproteksi dan tidak pernah dikirim ke client publik</p>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label className="f" style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Webhook Token / Rahasia Tanda Tangan</label>
                <input
                  type="password"
                  value={gwWebhookToken}
                  placeholder="Masukkan Webhook Token / Secret"
                  style={{ width: "100%", fontFamily: "monospace" }}
                  onChange={e => setGwWebhookToken(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                className="btn pri"
                disabled={sibuk}
                onClick={() => void simpanPengaturan("gateway")}
              >
                {sibuk ? "Menyimpan…" : "Simpan & Terapkan Payment Gateway"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
