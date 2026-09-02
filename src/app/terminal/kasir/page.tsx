"use client";

import { useMemo, useState } from "react";
import PinPad from "@/components/PinPad";
import { useToast } from "@/components/Toast";
import { KARTU_SIM, MENU_KANTIN, PO_HARI_INI, type KunciKartu } from "@/lib/data";
import { rp } from "@/lib/format";

const AMBANG_PIN = 25000;      // = limit offline per transaksi (F-33, F-43)
const NOMINAL_CEPAT = [8000, 12000, 15000, 19000, 20000, 25000];
const EMOJI: Record<string, string> = {
  "Nasi ayam geprek": "🍗", "Nasi ayam + teh (paket)": "🍱", "Mie ayam bakso": "🍜",
  "Roti bakar coklat": "🍞", "Teh manis dingin": "🥤", "Susu kotak": "🥛",
};

type Mode = "nominal" | "menu" | "po";
type Tahap = "beranda" | "tap" | "verifikasi" | "tolak" | "pin" | "selesai";

export default function TerminalKasir() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("nominal");
  const [tahap, setTahap] = useState<Tahap>("beranda");
  const [offline, setOffline] = useState(false);
  const [antrian, setAntrian] = useState(0);
  const [nominal, setNominal] = useState(0);
  const [keranjang, setKeranjang] = useState<Record<string, number>>({});
  const [kartu, setKartu] = useState<KunciKartu | null>(null);
  const [pesanTolak, setPesanTolak] = useState("");
  const [pesanSelesai, setPesanSelesai] = useState("");
  const [poDiambil, setPoDiambil] = useState<string[]>([]);
  const [poTap, setPoTap] = useState(false);

  const menuAktif = useMemo(() => MENU_KANTIN.filter(m => m.aktif), []);
  const total = mode === "nominal" ? nominal
    : Object.entries(keranjang).reduce((t, [nama, q]) => t + (menuAktif.find(m => m.nama === nama)?.hargaRp ?? 0) * q, 0);
  const nItem = Object.values(keranjang).reduce((a, b) => a + b, 0);

  const gantiMode = (m: Mode) => { setMode(m); setTahap("beranda"); };
  const tolak = (pesan: string) => { setPesanTolak(pesan); setTahap("tolak"); };

  const keTap = () => {
    if (offline && total > AMBANG_PIN) {
      tolak(`✕ Server tidak terjangkau — maksimal ${rp(AMBANG_PIN)} per transaksi saat offline (F-43). Pecah belanjaan jadi dua, atau tunggu koneksi pulih.`);
      return;
    }
    setTahap("tap");
  };

  const tap = (k: KunciKartu) => {
    const d = KARTU_SIM[k];
    setKartu(k);
    if (d.blokir) {
      tolak(offline
        ? "✕ Kartu diblokir — daftar kartu dicabut sudah tersinkron ke terminal (12.41), jadi tetap ditolak walau offline (F-03). Percobaan tercatat."
        : "✕ Kartu diblokir — dilaporkan hilang tadi pagi. Percobaan pemakaian tercatat dengan UID & waktu.");
      return;
    }
    if (d.saldoRp < total) {
      tolak(offline
        ? "✕ Mode offline — saldo terakhir diketahui untuk kartu ini tidak cukup (pagar kumulatif offline, F-43). Ditolak demi aman."
        : `✕ Saldo ${d.nama.split(" ")[0]} tidak mencukupi. Kasir tidak boleh memberi utang di sistem. Arahkan: kurangi item, atau minta ortu top-up lewat portal (masuk < 1 menit). Jatah makan utama siswa boarding tidak lewat wallet.`);
      return;
    }
    setTahap("verifikasi");
  };

  const selesai = () => {
    const rincian = mode === "nominal" ? "Belanja kantin (nominal)" : `${nItem} item`;
    if (offline) {
      const n = antrian + 1;
      setAntrian(n);
      setPesanSelesai(`✓ ${rp(total)} · ${rincian} — masuk antrian offline (#${n}). Diproses otomatis saat online; idempotency key mencegah potongan dobel (F-14).`);
    } else {
      setPesanSelesai(`✓ ${rp(total)} · ${rincian} — terpotong dari saldo ${kartu ? KARTU_SIM[kartu].nama.split(" ")[0] : ""}.`);
    }
    setTahap("selesai");
  };

  const transaksiBaru = () => { setNominal(0); setKeranjang({}); setTahap("beranda"); };

  const ketikNominal = (aksi: string) => {
    setNominal(v => {
      let n = v;
      if (aksi === "c") n = 0;
      else if (aksi === "000") n = v * 1000;
      else if (aksi === "hapus") n = Math.floor(v / 10);
      else n = v * 10 + Number(aksi);
      if (n > 500000) { toast("Nominal tidak wajar untuk kantin — dikosongkan, cek lagi"); return 0; }
      return n;
    });
  };

  return (
    <div className="root">
      <div className="t-shell" style={{ maxWidth: 1020 }}>
        <div className="t-head">
          <span className="id">KANTIN-01</span> · Kasir: Bu Tini ·{" "}
          <span className={`ks-status ${offline ? "off" : "on"}`}>● {offline ? "Offline" : "Online"}</span>
          {antrian > 0 ? <span className="badge warn">antrian offline: <b>{antrian}</b></span> : null}
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <label className="switch" title="Simulasi internet putus">
              <input type="checkbox" checked={offline} onChange={e => setOffline(e.target.checked)} /><i />
            </label>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>simulasi internet putus</span>
          </span>
        </div>

        <div className="t-tabs" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 14 }}>
          <button type="button" role="tab" aria-selected={mode === "nominal"} className={mode === "nominal" ? "on" : undefined} onClick={() => gantiMode("nominal")}>⌨ Nominal</button>
          <button type="button" role="tab" aria-selected={mode === "menu"} className={mode === "menu" ? "on" : undefined} onClick={() => gantiMode("menu")}>▤ Menu</button>
          <button type="button" role="tab" aria-selected={mode === "po"} className={mode === "po" ? "on" : undefined} onClick={() => gantiMode("po")}>
            🧾 PO <span className="badge good" style={{ marginLeft: 4 }}>{PO_HARI_INI.filter(p => p.status === "siap" && !poDiambil.includes(p.kode)).length} siap</span>
          </button>
        </div>

        <div className="ks-wrap">
          <div>
            {mode === "nominal" ? (
              <section className="t-panel">
                <div className="t-total" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
                  <span className="l">Total belanja</span>
                  <button type="button" onClick={() => ketikNominal("hapus")} aria-label="Hapus digit"
                    style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid var(--rule)", background: "var(--surface)", cursor: "pointer", fontSize: 16 }}>⌫</button>
                  <span className="v">{rp(nominal)}</span>
                </div>
                <div className="nom-grid" style={{ marginTop: 12 }}>
                  {NOMINAL_CEPAT.map(n => (
                    <button key={n} type="button" onClick={() => setNominal(n)}>{n.toLocaleString("id-ID")}</button>
                  ))}
                </div>
                <div className="keypad" style={{ maxWidth: 340, margin: "6px auto 0" }}>
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => (
                    <button key={d} type="button" onClick={() => ketikNominal(d)}>{d}</button>
                  ))}
                  <button type="button" className="fn" onClick={() => ketikNominal("c")}>C</button>
                  <button type="button" onClick={() => ketikNominal("0")}>0</button>
                  <button type="button" className="fn" onClick={() => ketikNominal("000")}>000</button>
                </div>
                <button type="button" className="btn pri blok" style={{ marginTop: 14, minHeight: 56, fontSize: 16 }}
                  disabled={nominal === 0 || tahap !== "beranda"} onClick={keTap}>Tap kartu →</button>
                {offline && nominal > AMBANG_PIN ? <p className="p-note" style={{ margin: "10px 0 0" }}>Mode offline: maksimal {rp(AMBANG_PIN)} per transaksi (F-43).</p>
                  : nominal > AMBANG_PIN ? <p className="p-note" style={{ margin: "10px 0 0" }}>Di atas {rp(AMBANG_PIN)} — siswa akan diminta PIN.</p> : null}
                <p className="p-note" style={{ margin: "10px 0 0" }}>
                  Mode tercepat: kasir ketik total, siswa tap, selesai. Transaksi tercatat &quot;Belanja kantin&quot;
                  tanpa rincian item (F-47) — rincian menu tetap ada dari PO.
                </p>
              </section>
            ) : mode === "menu" ? (
              <section className="t-panel">
                <div className="ks-menu">
                  {menuAktif.map(m => (
                    <button key={m.nama} type="button"
                      onClick={() => setKeranjang(k => ({ ...k, [m.nama]: (k[m.nama] ?? 0) + 1 }))}>
                      <span className="em">{EMOJI[m.nama] ?? "🍽"}</span>{m.nama}
                      <span className="hg">{rp(m.hargaRp)}</span>
                    </button>
                  ))}
                </div>
                <p className="p-note" style={{ margin: "12px 0 0" }}>
                  Menu &amp; harga dari dashboard admin — kasir tidak bisa mengubahnya (F-41). Menu nonaktif
                  tidak muncul di sini.
                </p>
              </section>
            ) : (
              <section className="t-panel">
                <p className="t-big" style={{ margin: "0 0 4px" }}><b>Pesanan PO hari ini</b></p>
                <p className="p-note" style={{ margin: "0 0 10px" }}>
                  Sudah dibayar saat pesan — tidak ada pembayaran di sini. Pengambilan 11.30–13.30.
                </p>
                {PO_HARI_INI.map(p => {
                  const diambil = poDiambil.includes(p.kode);
                  return (
                    <div className="att" key={p.kode}>
                      <span className={`badge ${diambil ? "mute" : p.status === "siap" ? "good" : "warn"}`}>
                        {diambil ? "selesai" : p.status === "siap" ? "SIAP" : "diproses dapur"}
                      </span>
                      <div className="tx">
                        <b>{p.kode} · {p.siswa}</b> ({p.kelas})
                        <div className="d">{p.isi} · lunas {rp(p.totalRp)}</div>
                      </div>
                    </div>
                  );
                })}
                {!poDiambil.includes("PO-107") ? (
                  <>
                    <button type="button" className="tapbtn" style={{ marginTop: 10 }} onClick={() => setPoTap(true)}>
                      💳 &nbsp;Simulasi: tap kartu Aisha
                    </button>
                    {poTap ? (
                      <div className="t-ok" style={{ marginTop: 12 }}>
                        ✓ <b>PO-107 — Aishabilla Piliang</b><br />Serahkan: Paket ayam + teh ×1 · Susu kotak ×1<br /><br />
                        <button type="button" className="btn pri"
                          onClick={() => { setPoDiambil(v => [...v, "PO-107"]); setPoTap(false); toast("PO-107 selesai — tercatat diambil oleh kasir Bu Tini"); }}>
                          Serahkan &amp; tandai selesai
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <p className="p-note" style={{ margin: "12px 0 0" }}>
                  Kartu siswa diblokir? Siswa tunjukkan kode PO dari portal — kasir cari kodenya dan
                  verifikasi nama (F-48).
                </p>
              </section>
            )}
          </div>

          <div>
            {mode === "menu" && tahap === "beranda" ? (
              <section className="t-panel">
                <div className="hd" style={{ marginBottom: 8 }}>
                  <h2 style={{ fontSize: 15 }}>Keranjang</h2>
                  <div className="r"><button type="button" className="btn sm" onClick={() => setKeranjang({})}>Kosongkan</button></div>
                </div>
                {nItem === 0 ? <p className="p-note" style={{ margin: "6px 0" }}>Ketuk menu untuk menambahkan.</p> :
                  Object.entries(keranjang).map(([nama, q]) => {
                    const harga = menuAktif.find(m => m.nama === nama)?.hargaRp ?? 0;
                    return (
                      <div className="ks-cartrow" key={nama}>
                        <button type="button" className="qbtn" onClick={() => setKeranjang(k => {
                          const nk = { ...k }; nk[nama] -= 1; if (nk[nama] <= 0) delete nk[nama]; return nk;
                        })}>−</button>
                        <span className="mono">{q}</span>
                        <button type="button" className="qbtn" onClick={() => setKeranjang(k => ({ ...k, [nama]: k[nama] + 1 }))}>+</button>
                        <span className="nm">{nama}</span><b>{(harga * q).toLocaleString("id-ID")}</b>
                      </div>
                    );
                  })}
                <div className="t-total"><span className="l">Total</span><span className="v">{rp(total)}</span></div>
                <button type="button" className="btn pri blok" style={{ marginTop: 12, minHeight: 56, fontSize: 16 }}
                  disabled={total === 0} onClick={keTap}>Tap kartu →</button>
                {total > AMBANG_PIN ? (
                  <p className="p-note" style={{ margin: "10px 0 0" }}>
                    {offline ? `Mode offline: maksimal ${rp(AMBANG_PIN)} per transaksi (F-43).` : `Total di atas ${rp(AMBANG_PIN)} — siswa akan diminta PIN.`}
                  </p>
                ) : null}
              </section>
            ) : null}

            {tahap === "tap" ? (
              <section className="t-panel">
                <div className="t-total" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
                  <span className="l">Total</span><span className="v">{rp(total)}</span>
                </div>
                <p className="t-big" style={{ margin: "10px 0 6px" }}><b>Tap kartu siswa.</b></p>
                <button type="button" className="tapbtn" style={{ minHeight: 56, fontSize: 15 }} onClick={() => tap("aisha")}>💳 Aisha (kartu aktif)</button>
                <button type="button" className="tapbtn alt" onClick={() => tap("keenan")}>💳 Keenan (saldo tipis)</button>
                <button type="button" className="tapbtn alt" onClick={() => tap("rafif")}>💳 Rafif (kartu diblokir)</button>
                <button type="button" className="btn blok" style={{ marginTop: 10 }} onClick={() => setTahap("beranda")}>← Kembali</button>
              </section>
            ) : null}

            {tahap === "verifikasi" && kartu ? (
              <section className="t-panel">
                <div className="ks-foto">{KARTU_SIM[kartu].foto}</div>
                <p style={{ textAlign: "center", margin: 0 }}>
                  <b style={{ fontSize: 18 }}>{KARTU_SIM[kartu].nama}</b><br />
                  <span style={{ color: "var(--ink-2)", fontSize: 13 }}>{KARTU_SIM[kartu].kelas}</span>
                </p>
                <p style={{ textAlign: "center", margin: "10px 0 0" }}><span className="badge good">saldo cukup ✓</span></p>
                <p className="p-note" style={{ textAlign: "center", margin: "8px 0 0" }}>
                  {offline
                    ? "Mode offline — data siswa dari cache terminal; foto bisa tidak termuat. Cocokkan nama & wajah tetap wajib."
                    : "Cocokkan wajah dengan foto — ini penahan utama kartu pinjaman/kloning (F-42). Nominal saldo tidak ditampilkan ke kasir."}
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button type="button" className="btn pri" style={{ flex: 1, justifyContent: "center", minHeight: 52 }}
                    onClick={() => { if (!offline && total > AMBANG_PIN) setTahap("pin"); else selesai(); }}>
                    ✓ Benar orangnya
                  </button>
                  <button type="button" className="btn danger" style={{ flex: 1, justifyContent: "center", minHeight: 52 }}
                    onClick={() => { toast("Dibatalkan — kartu bukan milik pemegangnya; kejadian tercatat"); setTahap("beranda"); }}>
                    ✕ Bukan
                  </button>
                </div>
              </section>
            ) : null}

            {tahap === "tolak" ? (
              <section className="t-panel">
                <div className="t-err">{pesanTolak}</div>
                <button type="button" className="btn blok" style={{ marginTop: 12 }} onClick={() => setTahap("beranda")}>Kembali</button>
              </section>
            ) : null}

            {tahap === "pin" ? (
              <section className="t-panel">
                <p className="t-big" style={{ margin: 0, textAlign: "center" }}>
                  <b>Siswa masukkan PIN</b> — total di atas {rp(AMBANG_PIN)}.
                </p>
                <PinPad onLengkap={selesai} onBatal={() => setTahap("beranda")} />
              </section>
            ) : null}

            {tahap === "selesai" ? (
              <section className="t-panel">
                <div className="t-ok">{pesanSelesai}</div>
                <p className="p-note" style={{ margin: "10px 0 0" }}>Sisa saldo tampil di layar kecil menghadap siswa, bukan di layar kasir.</p>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="button" className="btn pri" style={{ flex: 1.4, justifyContent: "center", minHeight: 52 }} onClick={transaksiBaru}>Transaksi baru</button>
                  <button type="button" className="btn" style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => { toast("Transaksi terakhir dibatalkan — tercatat sebagai pembatalan kasir (F-45)"); transaksiBaru(); }}>
                    Batalkan (5 mnt)
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <p className="p-note" style={{ marginTop: 14, textAlign: "center" }}>
          Alur umum 3 sentuhan: menu → tap → konfirmasi (F-40). Pembatalan hanya transaksi terakhir, dalam 5
          menit; setelah itu lewat keuangan (F-45).
        </p>
      </div>
    </div>
  );
}
