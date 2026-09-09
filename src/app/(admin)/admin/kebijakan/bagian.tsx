"use client";

import { useState } from "react";
import { CatatanKaki, Panel } from "@/components/ui";
import { api, useMuat, waktuSingkat } from "@/lib/api";
import { rp } from "@/lib/format";
import { useIdentitas } from "@/components/IdentitasProvider";
import LogoSekolah from "@/components/LogoSekolah";
import { DEFAULT_IDENTITAS, kompresLogo } from "@/lib/identitas";
import {
  PRESET_TEMA,
  TEMA_DEFAULT,
  buatTemaKustom,
  terapkanTemaKeDom,
  type TemaWarna,
} from "@/lib/tema";

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

const KUNCI_IDENTITAS = [
  "sekolah_nama",
  "sekolah_nama_singkat",
  "sekolah_logo_portrait",
  "sekolah_logo_landscape",
];

export default function Bagian() {
  const { data, galat, sedang, muatUlang } = useMuat<{ kebijakan: Kebijakan[] }>("/api/admin/kebijakan");
  const semua = data?.kebijakan ?? [];
  const peta = new Map(semua.map(k => [k.kunci, k]));
  const dipakai = new Set(
    KELOMPOK.flatMap(g => g.kunci).concat(
      "limit_offline_rp",
      KUNCI_TOPUP,
      "tema_warna",
      KUNCI_IDENTITAS
    )
  );
  const sisa = semua.filter(k => !dipakai.has(k.kunci));

  return (
    <>
      <div className="top">
        <div>
          <h1>Kebijakan</h1>
          <div className="sub">
            Angka yang mengatur uang, PIN, batas layanan, tema tampilan, dan identitas sekolah. Berlaku
            seketika untuk semua terminal dan portal.
          </div>
        </div>
        <div className="right">
          <button type="button" className="btn" onClick={() => void muatUlang()}>Muat ulang</button>
        </div>
      </div>

      {galat ? <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div> : null}
      {sedang && semua.length === 0 ? <p className="p-note">Memuat kebijakan…</p> : null}

      <PanelIdentitasSekolah peta={peta} selesai={muatUlang} />
      <PanelTemaWarna peta={peta} selesai={muatUlang} />
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
              border: metode === "verifikasi_admin" ? "2px solid var(--accent)" : "1px solid var(--rule)",
              background: metode === "verifikasi_admin" ? "var(--brand-soft)" : "var(--surface)",
              color: "var(--ink)",
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
              border: metode === "gateway" ? "2px solid var(--accent)" : "1px solid var(--rule)",
              background: metode === "gateway" ? "var(--brand-soft)" : "var(--surface)",
              color: "var(--ink)",
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
          <div style={{ background: "var(--surface-sunken)", border: "1px solid var(--rule)", borderRadius: 12, padding: 18 }}>
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
          <div style={{ background: "var(--surface-sunken)", border: "1px solid var(--rule)", borderRadius: 12, padding: 18 }}>
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

/**
 * Panel Konfigurasi Tema Warna Sistem Global
 * Admin dapat memilih dari 7 preset profesional atau memilih warna HEX kustom.
 */
function PanelTemaWarna({ peta, selesai }: { peta: Map<string, Kebijakan>; selesai: () => Promise<void> }) {
  const temaRaw = peta.get("tema_warna")?.nilai;
  const temaAktifDb: TemaWarna =
    typeof temaRaw === "object" && temaRaw !== null && (temaRaw as TemaWarna).accent
      ? (temaRaw as TemaWarna)
      : TEMA_DEFAULT;

  const [pilihan, setPilihan] = useState<TemaWarna>(temaAktifDb);
  const [isCustom, setIsCustom] = useState(temaAktifDb.id === "custom");
  const [customAccent, setCustomAccent] = useState(temaAktifDb.accent || "#0284c7");
  const [customSideBg, setCustomSideBg] = useState(temaAktifDb.side_bg || "#0c1e33");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);

  const temaIdTersimpan = temaAktifDb.id;
  const adaPerubahan =
    isCustom ? true : pilihan.id !== temaIdTersimpan;

  function pilihPreset(preset: TemaWarna) {
    setIsCustom(false);
    setPilihan(preset);
    setPesan("");
    terapkanTemaKeDom(preset);
  }

  function ubahWarnaKustom(accent: string, sideBg?: string) {
    setIsCustom(true);
    setCustomAccent(accent);
    if (sideBg !== undefined) setCustomSideBg(sideBg);
    const baru = buatTemaKustom(accent, sideBg || customSideBg);
    setPilihan(baru);
    setPesan("");
    terapkanTemaKeDom(baru);
  }

  async function simpanTema() {
    setSibuk(true);
    setPesan("");
    setGagal(false);

    const r = await api("/api/admin/kebijakan", {
      metode: "PUT",
      body: {
        kunci: "tema_warna",
        nilai: pilihan,
      },
    });

    setSibuk(false);
    if (!r.ok) {
      setGagal(true);
      setPesan(r.pesan ?? "Gagal menyimpan tema");
      return;
    }

    terapkanTemaKeDom(pilihan);
    setPesan(`Tema warna "${pilihan.nama}" berhasil disimpan dan diterapkan ke seluruh sistem!`);
    await selesai();
  }

  function batalkanPratinjau() {
    setPilihan(temaAktifDb);
    setIsCustom(temaAktifDb.id === "custom");
    setCustomAccent(temaAktifDb.accent);
    setCustomSideBg(temaAktifDb.side_bg);
    terapkanTemaKeDom(temaAktifDb);
    setPesan("");
  }

  return (
    <Panel
      judul="Tema & Tampilan Warna Sistem"
      sub="Atur warna tema untuk seluruh antarmuka: Dashboard Admin, Portal Orang Tua, Portal Siswa, Login, dan Terminal Layanan"
    >
      <div style={{ padding: "4px 0 12px" }}>
        {pesan ? (
          <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 16 }}>
            {pesan}
          </div>
        ) : null}

        {/* Grid Preset Tema */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Pilihan Preset Tema</span>
          <span className="p-note">Klik untuk pratinjau langsung di browser</span>
        </div>

        <div className="tema-grid">
          {PRESET_TEMA.map((preset) => {
            const aktif = !isCustom && pilihan.id === preset.id;
            const tersimpan = temaIdTersimpan === preset.id;

            return (
              <div
                key={preset.id}
                className={`tema-card ${aktif ? "aktif" : ""}`}
                onClick={() => pilihPreset(preset)}
              >
                <div className="tema-swatches">
                  <div className="tema-dot" style={{ background: preset.accent }} title="Warna Utama (Aksen/Tombol)" />
                  <div className="tema-dot" style={{ background: preset.side_bg }} title="Warna Sidebar / Header Portal" />
                  <div
                    className="tema-dot"
                    style={{ background: preset.accent_soft, border: `1px solid ${preset.accent}` }}
                    title="Warna Badge Lembut"
                  />
                  {tersimpan ? (
                    <span className="badge ok" style={{ marginLeft: "auto", fontSize: 10 }}>
                      Aktif di Sistem
                    </span>
                  ) : aktif ? (
                    <span className="badge info" style={{ marginLeft: "auto", fontSize: 10 }}>
                      Dipilih
                    </span>
                  ) : null}
                </div>

                <div className="tema-nama">{preset.nama}</div>
                <div className="tema-desk">{preset.deskripsi}</div>
              </div>
            );
          })}
        </div>

        {/* Mode Kustom Bebas */}
        <div
          style={{
            background: "var(--surface-sunken)",
            border: isCustom ? "2px solid var(--accent)" : "1px solid var(--rule)",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            transition: "border-color 0.15s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>🎨</span>
              <div>
                <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>Mode Warna Kustom Bebas</h4>
                <p className="p-note" style={{ margin: 0, fontSize: 12 }}>
                  Tentukan warna HEX utama sesuai identitas sekolah. Sistem otomatis mengalkulasi warna turunan harmonis.
                </p>
              </div>
            </div>
            {isCustom ? (
              <span className="badge info" style={{ fontSize: 11 }}>
                Mode Kustom Aktif
              </span>
            ) : (
              <button
                type="button"
                className="btn sm"
                onClick={() => ubahWarnaKustom(customAccent, customSideBg)}
              >
                Gunakan Warna Kustom
              </button>
            )}
          </div>

          {isCustom ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginTop: 12 }}>
              <div>
                <label className="f" style={{ display: "block", marginBottom: 6, fontSize: 12.5, fontWeight: 600 }}>
                  Warna Aksen Utama (Tombol & Highlight)
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="color"
                    value={customAccent}
                    style={{ width: 44, height: 38, padding: 2, cursor: "pointer", borderRadius: 8, border: "1px solid var(--rule)" }}
                    onChange={(e) => ubahWarnaKustom(e.target.value)}
                  />
                  <input
                    type="text"
                    value={customAccent}
                    maxLength={7}
                    style={{ fontFamily: "monospace", width: 110 }}
                    onChange={(e) => ubahWarnaKustom(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="f" style={{ display: "block", marginBottom: 6, fontSize: 12.5, fontWeight: 600 }}>
                  Warna Sidebar / Header Portal (Gelap)
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="color"
                    value={customSideBg}
                    style={{ width: 44, height: 38, padding: 2, cursor: "pointer", borderRadius: 8, border: "1px solid var(--rule)" }}
                    onChange={(e) => ubahWarnaKustom(customAccent, e.target.value)}
                  />
                  <input
                    type="text"
                    value={customSideBg}
                    maxLength={7}
                    style={{ fontFamily: "monospace", width: 110 }}
                    onChange={(e) => ubahWarnaKustom(customAccent, e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Kotak Pratinjau Langsung (Live Preview) */}
        <div
          style={{
            border: "1px solid var(--rule)",
            borderRadius: 12,
            padding: 16,
            background: "var(--surface)",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
            Pratinjau Komponen Antarmuka ({pilihan.nama})
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            {/* Pratinjau Mini Top Bar / Sidebar */}
            <div
              style={{
                background: pilihan.side_bg,
                color: pilihan.side_ink,
                padding: "12px 14px",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: pilihan.accent,
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                S
              </div>
              <div>
                <b style={{ fontSize: 13, display: "block" }}>Smart Campus</b>
                <small style={{ color: pilihan.side_ink_2, fontSize: 11 }}>Portal & Sidebar Top</small>
              </div>
              <span
                style={{
                  marginLeft: "auto",
                  background: pilihan.side_active,
                  padding: "4px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Menu Aktif
              </span>
            </div>

            {/* Pratinjau Tombol & Badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn pri"
                style={{ background: pilihan.accent, borderColor: pilihan.accent }}
              >
                + Tombol Utama
              </button>

              <button type="button" className="btn">
                Tombol Biasa
              </button>

              <span
                style={{
                  background: pilihan.accent_soft,
                  color: pilihan.accent_ink,
                  padding: "5px 10px",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Badge Soft
              </span>
            </div>
          </div>
        </div>

        {/* Tombol Simpan & Batalkan */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn pri"
            disabled={sibuk}
            style={{ background: pilihan.accent, borderColor: pilihan.accent }}
            onClick={() => void simpanTema()}
          >
            {sibuk ? "Menerapkan Tema…" : `💾 Terapkan & Simpan Tema "${pilihan.nama}"`}
          </button>

          {adaPerubahan ? (
            <button
              type="button"
              className="btn"
              disabled={sibuk}
              onClick={batalkanPratinjau}
            >
              ↩ Batalkan Pratinjau
            </button>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

/**
 * Panel Konfigurasi Nama & Logo Sekolah (Portrait & Landscape)
 */
function PanelIdentitasSekolah({
  peta,
  selesai,
}: {
  peta: Map<string, Kebijakan>;
  selesai: () => Promise<void>;
}) {
  const { setIdentitas } = useIdentitas();

  const namaAwal =
    (peta.get("sekolah_nama")?.nilai as string) || DEFAULT_IDENTITAS.nama;
  const namaSingkatAwal =
    (peta.get("sekolah_nama_singkat")?.nilai as string) || DEFAULT_IDENTITAS.nama_singkat;
  const logoPortraitAwal =
    (peta.get("sekolah_logo_portrait")?.nilai as string) || null;
  const logoLandscapeAwal =
    (peta.get("sekolah_logo_landscape")?.nilai as string) || null;

  const [nama, setNama] = useState(namaAwal);
  const [namaSingkat, setNamaSingkat] = useState(namaSingkatAwal);
  const [logoPortrait, setLogoPortrait] = useState<string | null>(logoPortraitAwal);
  const [logoLandscape, setLogoLandscape] = useState<string | null>(logoLandscapeAwal);

  const [sedangKompresP, setSedangKompresP] = useState(false);
  const [sedangKompresL, setSedangKompresL] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);

  const adaPerubahan =
    nama !== namaAwal ||
    namaSingkat !== namaSingkatAwal ||
    logoPortrait !== logoPortraitAwal ||
    logoLandscape !== logoLandscapeAwal;

  async function uploadLogo(file: File, tipe: "portrait" | "landscape") {
    setPesan("");
    setGagal(false);
    if (tipe === "portrait") setSedangKompresP(true);
    else setSedangKompresL(true);

    try {
      const dataUrl = await kompresLogo(file, tipe);
      if (tipe === "portrait") {
        setLogoPortrait(dataUrl);
      } else {
        setLogoLandscape(dataUrl);
      }
    } catch (err) {
      setGagal(true);
      setPesan("Gagal memproses gambar: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (tipe === "portrait") setSedangKompresP(false);
      else setSedangKompresL(false);
    }
  }

  async function simpanIdentitas() {
    setSibuk(true);
    setPesan("");
    setGagal(false);

    const r = await api("/api/admin/kebijakan", {
      metode: "PUT",
      body: {
        batch: [
          { kunci: "sekolah_nama", nilai: nama.trim() || DEFAULT_IDENTITAS.nama },
          { kunci: "sekolah_nama_singkat", nilai: namaSingkat.trim() || DEFAULT_IDENTITAS.nama_singkat },
          { kunci: "sekolah_logo_portrait", nilai: logoPortrait },
          { kunci: "sekolah_logo_landscape", nilai: logoLandscape },
        ],
      },
    });

    setSibuk(false);
    if (!r.ok) {
      setGagal(true);
      setPesan(r.pesan ?? "Gagal menyimpan identitas sekolah");
      return;
    }

    const dataBaru = {
      nama: nama.trim() || DEFAULT_IDENTITAS.nama,
      nama_singkat: namaSingkat.trim() || DEFAULT_IDENTITAS.nama_singkat,
      logo_portrait: logoPortrait,
      logo_landscape: logoLandscape,
    };
    setIdentitas(dataBaru);

    setPesan("Nama dan logo sekolah berhasil disimpan dan diterapkan ke seluruh sistem!");
    await selesai();
  }

  function batalkanPerubahan() {
    setNama(namaAwal);
    setNamaSingkat(namaSingkatAwal);
    setLogoPortrait(logoPortraitAwal);
    setLogoLandscape(logoLandscapeAwal);
    setPesan("");
  }

  return (
    <Panel
      judul="Identitas & Logo Sekolah"
      sub="Atur nama resmi, nama brand, serta logo portrait (kotak) dan logo landscape (banner) untuk seluruh aplikasi"
    >
      <div style={{ padding: "4px 0 12px" }}>
        {pesan ? (
          <div className={gagal ? "a-err" : "a-ok"} style={{ marginBottom: 16 }}>
            {pesan}
          </div>
        ) : null}

        {/* Form Nama Sekolah */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 18 }}>
          <div>
            <label className="f" style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
              Nama Resmi Sekolah / Yayasan
            </label>
            <input
              type="text"
              value={nama}
              placeholder="Contoh: Semesta Bilingual Boarding School"
              style={{ width: "100%" }}
              onChange={(e) => setNama(e.target.value)}
            />
            <p className="p-note" style={{ margin: "4px 0 0" }}>
              Digunakan pada dokumen, laporan transaksi, dan nama lengkap yayasan
            </p>
          </div>

          <div>
            <label className="f" style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
              Nama Singkat / Brand Aplikasi
            </label>
            <input
              type="text"
              value={namaSingkat}
              placeholder="Contoh: Smart Campus / Semesta BBS"
              style={{ width: "100%" }}
              onChange={(e) => setNamaSingkat(e.target.value)}
            />
            <p className="p-note" style={{ margin: "4px 0 0" }}>
              Tampil di header portal orang tua, portal siswa, dan sidebar admin
            </p>
          </div>
        </div>

        {/* Upload Logo Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 18 }}>
          {/* Kolom 1: Logo Portrait */}
          <div
            style={{
              background: "var(--surface-sunken)",
              border: "1px solid var(--rule)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <b style={{ fontSize: 14, display: "block" }}>Logo Portrait / Kotak (1:1)</b>
                <span className="p-note" style={{ fontSize: 11.5 }}>
                  Untuk icon header portal, favicon, dan avatar sekolah
                </span>
              </div>
              <span className="badge info" style={{ fontSize: 10 }}>1:1 / Kotak</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "12px 0" }}>
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 12,
                  border: "1.5px dashed var(--rule)",
                  background: "var(--surface)",
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                  flex: "none",
                }}
              >
                {logoPortrait ? (
                  <img
                    src={logoPortrait}
                    alt="Logo Portrait"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <div
                    className="logo"
                    style={{ width: 44, height: 44, borderRadius: 10, fontSize: 20 }}
                  >
                    {(namaSingkat || "S").charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <label className="btn sm pri" style={{ cursor: "pointer", textAlign: "center", width: "fit-content" }}>
                  {sedangKompresP ? "Memproses…" : logoPortrait ? "📷 Ganti Logo Portrait" : "⬆ Unggah Logo Portrait"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    style={{ display: "none" }}
                    disabled={sedangKompresP}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadLogo(f, "portrait");
                    }}
                  />
                </label>

                {logoPortrait ? (
                  <button
                    type="button"
                    className="btn sm danger"
                    style={{ width: "fit-content" }}
                    onClick={() => setLogoPortrait(null)}
                  >
                    🗑 Hapus Logo
                  </button>
                ) : null}

                <span className="p-note" style={{ fontSize: 11 }}>
                  Disarankan PNG transparan atau SVG/JPG maks 400x400 px
                </span>
              </div>
            </div>
          </div>

          {/* Kolom 2: Logo Landscape */}
          <div
            style={{
              background: "var(--surface-sunken)",
              border: "1px solid var(--rule)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <b style={{ fontSize: 14, display: "block" }}>Logo Landscape (Horizontal / Banner)</b>
                <span className="p-note" style={{ fontSize: 11.5 }}>
                  Untuk header sidebar admin dan kartu halaman login
                </span>
              </div>
              <span className="badge info" style={{ fontSize: 10 }}>Horizontal</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "12px 0" }}>
              <div
                style={{
                  width: "100%",
                  height: 76,
                  borderRadius: 12,
                  border: "1.5px dashed var(--rule)",
                  background: "var(--surface)",
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                  padding: "6px 12px",
                }}
              >
                {logoLandscape ? (
                  <img
                    src={logoLandscape}
                    alt="Logo Landscape"
                    style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <div style={{ color: "var(--ink-2)", fontSize: 12.5, fontStyle: "italic" }}>
                    Belum ada logo landscape (menggunakan format portrait + teks)
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label className="btn sm pri" style={{ cursor: "pointer" }}>
                  {sedangKompresL ? "Memproses…" : logoLandscape ? "📷 Ganti Logo Landscape" : "⬆ Unggah Logo Landscape"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    style={{ display: "none" }}
                    disabled={sedangKompresL}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadLogo(f, "landscape");
                    }}
                  />
                </label>

                {logoLandscape ? (
                  <button
                    type="button"
                    className="btn sm danger"
                    onClick={() => setLogoLandscape(null)}
                  >
                    🗑 Hapus Logo
                  </button>
                ) : null}

                <span className="p-note" style={{ fontSize: 11 }}>
                  Disarankan rasio 3:1 atau 4:1 dengan latar transparan
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pratinjau Tampilan Header Langsung */}
        <div
          style={{
            border: "1px solid var(--rule)",
            borderRadius: 12,
            padding: 16,
            background: "var(--surface)",
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
            Pratinjau Langsung Komponen Header
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {/* Pratinjau Sidebar Header */}
            <div style={{ background: "var(--side-bg)", color: "var(--side-ink)", padding: "14px 16px", borderRadius: 10 }}>
              <div style={{ fontSize: 10.5, color: "var(--side-ink-2)", textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.5 }}>
                Tampilan Sidebar Admin
              </div>
              {logoLandscape ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <img src={logoLandscape} alt="Preview Landscape" style={{ maxHeight: 38, maxWidth: 200, objectFit: "contain" }} />
                  <small style={{ color: "var(--side-ink-2)", fontSize: 11 }}>Portal Manajemen Admin</small>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {logoPortrait ? (
                    <img src={logoPortrait} alt="Preview Portrait" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "contain" }} />
                  ) : (
                    <div className="logo" style={{ width: 34, height: 34 }}>{(namaSingkat || "S").charAt(0).toUpperCase()}</div>
                  )}
                  <div>
                    <b style={{ fontSize: 14, display: "block" }}>{namaSingkat || "Smart Campus"}</b>
                    <small style={{ color: "var(--side-ink-2)", fontSize: 11 }}>{nama || "Admin"}</small>
                  </div>
                </div>
              )}
            </div>

            {/* Pratinjau Portal Header */}
            <div style={{ background: "var(--side-bg)", color: "var(--side-ink)", padding: "14px 16px", borderRadius: 10 }}>
              <div style={{ fontSize: 10.5, color: "var(--side-ink-2)", textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.5 }}>
                Tampilan Portal Ortu &amp; Siswa
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {logoPortrait ? (
                  <img src={logoPortrait} alt="Preview Portrait" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "contain" }} />
                ) : (
                  <div className="logo" style={{ width: 32, height: 32 }}>{(namaSingkat || "S").charAt(0).toUpperCase()}</div>
                )}
                <div>
                  <b style={{ fontSize: 13.5, display: "block" }}>{namaSingkat || "Smart Campus"}</b>
                  <small style={{ color: "var(--side-ink-2)", fontSize: 11 }}>Portal Orang Tua · Contoh</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tombol Simpan Identitas */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn pri"
            disabled={sibuk || sedangKompresP || sedangKompresL}
            onClick={() => void simpanIdentitas()}
          >
            {sibuk ? "Menyimpan Identitas…" : "💾 Simpan & Terapkan Identitas Sekolah"}
          </button>

          {adaPerubahan ? (
            <button
              type="button"
              className="btn"
              disabled={sibuk}
              onClick={batalkanPerubahan}
            >
              ↩ Kembalikan ke Semula
            </button>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}


