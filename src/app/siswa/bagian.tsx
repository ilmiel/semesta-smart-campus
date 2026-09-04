"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import KeluarButton from "@/components/KeluarButton";
import { api, useMuat, waktuSingkat } from "@/lib/api";
import { rp } from "@/lib/format";

/**
 * Portal siswa — data sungguhan, hanya dirinya sendiri.
 *
 * Sebelum ini halaman ini adalah mockup: nama "Rafif Gamma W." dan saldo
 * Rp 200.000 ditulis di dalam kode, lalu ditampilkan kepada siswa sungguhan
 * yang sudah login lewat akun sekolahnya. Seorang siswa yang membaca layar
 * itu tidak punya cara tahu bahwa angkanya karangan; label "data contoh" di
 * atasnya adalah tambalan, bukan jawaban.
 *
 * Yang berbeda dari portal orang tua, dan sengaja:
 *
 *   - Siswa TIDAK bisa mengisi saldo sendiri dan TIDAK bisa menaikkan batas
 *     hariannya. Keduanya memang tidak punya endpoint — bukan tombol yang
 *     disembunyikan. Layar ini menjelaskan siapa yang bisa, supaya siswa
 *     tidak mencari-cari tombol yang tidak akan pernah ada.
 *   - Tagihan (denda perpus, denda loker) ditampilkan tetapi tidak bisa
 *     dibayar dari sini: yang melunasi adalah orang tua lewat portalnya atau
 *     keuangan di meja TU. Menampilkannya tetap penting — siswa berhak tahu
 *     berapa yang menempel pada namanya sebelum dia mendengarnya dari orang
 *     lain.
 *   - Denda perpustakaan yang sedang berjalan ditampilkan setiap hari, bukan
 *     hanya saat buku dikembalikan. Denda yang baru muncul di akhir adalah
 *     kejutan, dan kejutan soal uang selalu berakhir di meja TU.
 *
 * F-103 ditegakkan server: setiap endpoint memanggil `wajibSiswa()` dan
 * mengambil siswa_id dari sesi. Halaman ini tidak pernah mengirim id siswa,
 * jadi tidak ada yang bisa diubah di devtools untuk melihat data teman.
 */

interface Siswa {
  id: number; nis: string; nama: string; kelas: string | null; jenjang: string;
  boarding: boolean; status: string; kartu: string; saldo_rp: number;
  pin_terkunci: boolean; pin_ada: boolean; limit_harian_rp: number;
  pin_harus_ganti: boolean | null;
}
interface Limit { limit_harian_rp: number; plafon_rp: number; terpakai_rp: number }
interface Tagihan { id: number; sumber: string; keterangan: string | null; nominal_rp: number; dibuat: string }
interface PO { id: number; kode: string; tanggal: string; status: string; total_rp: number; dibuat: string; item: string | null }
interface Pinjaman {
  id: number; judul: string; pengarang: string | null; dipinjam: string;
  jatuh_tempo: string; hari_telat: number; diperpanjang: number; denda_berjalan_rp: number;
}
interface Laundry { id: number; kode: string; status: string; total_rp: number; rak: string | null; dibuat: string; siap_pada: string | null; item: string | null }
interface Loker { kode: string; blok: string; nomor: number; lokasi: string | null; kondisi: string; akses_terakhir: string | null }
interface Aturan { maks_buku: number; lama_hari: number; denda_per_hari: number; maks_denda_rp: number; boleh_perpanjang: number }

interface Saya {
  siswa: Siswa; limit: Limit | null; aturan: Aturan | null;
  tagihan: Tagihan[]; po: PO[]; pinjaman: Pinjaman[]; laundry: Laundry[]; loker: Loker | null;
}
interface Menu { id: number; nama: string; harga_rp: number; kategori: string | null; foto_url: string | null }
interface Jendela {
  buka: boolean; alasan: string | null;
  jam_buka: string; jam_tutup: string; ambil_mulai: string; ambil_selesai: string;
  menu: Menu[];
}
interface Riwayat {
  id: number; kode: string; jenis: string; status: string; layanan: string | null;
  total_rp: number; arah_rp: number; keterangan: string | null; item: string | null;
  waktu: string; device: string | null; offline: boolean; direfund_rp: number | null;
}
interface Bacaan {
  judul: string; pengarang: string | null; kategori: string | null;
  dipinjam: string; jatuh_tempo: string; dikembalikan: string | null;
  masih_dipinjam: boolean; terlambat: boolean;
}

export default function Bagian() {
  const { data, galat, sedang, muatUlang } = useMuat<Saya>("/api/siswa/saya");

  const [pesan, setPesan] = useState("");
  const [gagal, setGagal] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [lembar, setLembar] = useState<"hilang" | null>(null);

  // Jendela PO dimuat saat halaman dibuka, bukan saat "Lihat menu" ditekan.
  // Bukan demi menu-nya — demi tombol "Batalkan" di bawah: batas pembatalan
  // adalah JAM tutup PO, dan tanpa jam itu tombolnya akan tetap tampil
  // sepanjang sore lalu ditolak server. Layar yang menawarkan aksi yang sudah
  // pasti gagal lebih buruk daripada layar yang tidak menawarkannya.
  const [jendela, setJendela] = useState<Jendela | null>(null);
  const [jendelaSiap, setJendelaSiap] = useState(false);
  const [tampilMenu, setTampilMenu] = useState(false);
  const [qty, setQty] = useState<Record<number, number>>({});

  const [bulan, setBulan] = useState("");
  const [riwayat, setRiwayat] = useState<Riwayat[] | null>(null);
  const [sengketa, setSengketa] = useState<{ transaksi_id: number; catatan: string } | null>(null);

  const [bacaan, setBacaan] = useState<Bacaan[] | null>(null);

  const muatRiwayat = useCallback(async (bln: string) => {
    const r = await api<{ riwayat: Riwayat[] }>(`/api/siswa/riwayat${bln ? `?bulan=${bln}` : ""}`);
    setRiwayat(r.ok ? r.data!.riwayat : []);
  }, []);

  useEffect(() => { void muatRiwayat(bulan); }, [bulan, muatRiwayat]);

  useEffect(() => {
    void (async () => {
      const r = await api<Jendela>("/api/siswa/po/jendela");
      if (r.ok) setJendela(r.data!);
      setJendelaSiap(true);   // gagal pun harus diketahui: lihat panel di bawah
    })();
  }, []);

  async function blokirKartu() {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api("/api/siswa/kartu/hilang", { metode: "POST" });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Gagal memblokir kartu"); return; }
    setLembar(null);
    setPesan("Kartu diblokir. Saldomu tidak berkurang — lapor ke TU untuk kartu pengganti.");
    await muatUlang();
  }

  async function kirimPO() {
    const items = Object.entries(qty).filter(([, n]) => n > 0).map(([id, n]) => ({ menu_id: Number(id), qty: n }));
    if (items.length === 0) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api("/api/siswa/po", { metode: "POST", body: { items } });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Pesanan ditolak"); return; }
    setQty({}); setTampilMenu(false);
    setPesan("Pesanan tercatat dan sudah dibayar dari saldomu.");
    await muatUlang();
  }

  async function batalPO(poId: number) {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api(`/api/siswa/po/${poId}`, { metode: "DELETE" });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Pembatalan ditolak"); return; }
    setPesan("Pesanan dibatalkan — dana kembali ke saldomu.");
    await muatUlang();
  }

  async function perpanjang(id: number) {
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api<{ jatuh_tempo: string }>(`/api/siswa/pinjaman/${id}/perpanjang`, { metode: "POST" });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Perpanjangan ditolak"); return; }
    setPesan(`Diperpanjang — jatuh tempo baru ${r.data!.jatuh_tempo}.`);
    await muatUlang();
  }

  async function kirimSengketa() {
    if (!sengketa) return;
    setSibuk(true); setPesan(""); setGagal(false);
    const r = await api("/api/siswa/vending/sengketa", {
      metode: "POST", body: { transaksi_id: sengketa.transaksi_id, catatan: sengketa.catatan.trim() },
    });
    setSibuk(false);
    if (!r.ok) { setGagal(true); setPesan(r.pesan ?? "Laporan ditolak"); return; }
    setSengketa(null);
    setPesan("Laporan diterima. Bagian keuangan akan memeriksanya.");
  }

  async function bukaBacaan() {
    const r = await api<{ bacaan: Bacaan[] }>("/api/siswa/bacaan");
    setBacaan(r.ok ? r.data!.bacaan : []);
  }

  if (galat) {
    return (
      <div className="root portal">
        <div className="p-wrap" style={{ marginTop: 24 }}>
          <div className="pcard"><p style={{ margin: 0 }}>{galat}</p><KeluarButton /></div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="root portal">
        <div className="p-wrap" style={{ marginTop: 24 }}>
          <div className="pcard">
            <p style={{ margin: 0 }}>{sedang ? "Memuat datamu…" : "Data tidak tersedia."}</p>
            {!sedang ? <KeluarButton /> : null}
          </div>
        </div>
      </div>
    );
  }

  const s = data.siswa;
  const lim = data.limit;
  const at = data.aturan;
  const sisa = lim ? Math.max(lim.limit_harian_rp - lim.terpakai_rp, 0) : null;
  const totalPO = jendela ? jendela.menu.reduce((t, m) => t + (qty[m.id] ?? 0) * m.harga_rp, 0) : 0;

  return (
    <div className="root portal">
      <div className="p-top">
        <div className="inner">
          <div className="bar">
            <div className="logo">S</div>
            <div className="t">
              <b>Smart Campus</b>
              <small>{s.nama} · {s.kelas ?? s.nis}</small>
            </div>
            <span style={{ marginLeft: "auto" }}><KeluarButton ringkas /></span>
          </div>
        </div>
      </div>

      <div className="p-wrap">
        {pesan ? <div className={gagal ? "t-err" : "t-ok"} style={{ marginBottom: 14 }}>{pesan}</div> : null}

        {/* Peringatan PIN sementara. Dulu ini komponen terpisah yang menembak
            /api/siswa/saya sendiri — permintaan kedua untuk data yang sudah
            ada di halaman ini, dan dua sumber kebenaran yang bisa berbeda
            sesaat setelah PIN diganti. */}
        {s.pin_ada && s.pin_harus_ganti ? (
          <div className="t-err" style={{ marginBottom: 14 }}>
            PIN-mu masih PIN sementara dari TU. PIN itu berlaku penuh untuk pembayaran, dan siapa
            pun yang sempat mendengarnya di meja TU bisa memakainya.
            <Link href="/siswa/pin" className="btn pri" style={{ display: "inline-flex", marginTop: 10 }}>
              Ganti PIN sekarang
            </Link>
          </div>
        ) : null}

        {s.pin_terkunci ? (
          <div className="t-err" style={{ marginBottom: 14 }}>
            PIN-mu terkunci karena terlalu banyak percobaan salah. Kartumu tetap bisa dipakai untuk
            belanja kecil di bawah ambang PIN, tapi pembayaran yang meminta PIN akan ditolak sampai
            TU membukanya.
          </div>
        ) : null}
        {!s.pin_ada ? (
          <div className="t-err" style={{ marginBottom: 14 }}>
            Kamu belum punya PIN. Datang ke TU untuk mendapatkan PIN pertama.
          </div>
        ) : null}

        {s.kartu !== "aktif" ? (
          <div className="stat-hilang" style={{ marginBottom: 14 }}>
            ⚠ Kartumu <b>{s.kartu === "belum" ? "belum diterbitkan" : s.kartu}</b> — tidak bisa dipakai
            membayar, dan loker tidak bisa dibuka dengan kartu ini. <b>Saldomu tidak ikut hilang.</b>{" "}
            Lapor ke TU untuk kartu pengganti; saldonya langsung bisa dipakai dengan kartu baru.
          </div>
        ) : null}

        <div className="saldo-card">
          <div className="l">Saldo kamu</div>
          <div className="v">{rp(s.saldo_rp)}</div>
          <div className="u">
            {lim ? <>Batas harian {rp(lim.limit_harian_rp)} · sisa hari ini {rp(sisa ?? 0)}</> : null}
          </div>
          <div className="acts">
            <Link href="/siswa/pin" className="btn">Ganti PIN</Link>
            {s.kartu === "aktif" ? (
              <button type="button" className="btn danger" onClick={() => { setPesan(""); setLembar("hilang"); }}>
                Kartuku hilang
              </button>
            ) : null}
          </div>
          <p className="p-note" style={{ margin: "12px 0 0" }}>
            Saldo diisi oleh orang tuamu lewat portal mereka, atau tunai di TU. Batas harian juga
            diatur orang tua — kamu tidak bisa menaikkannya sendiri dari sini.
          </p>
        </div>

        {lembar === "hilang" ? (
          <div className="pcard">
            <h2>Laporkan kartu hilang</h2>
            <div className="t-err">
              Kartumu akan <b>diblokir seketika</b> dan tidak bisa dipakai siapa pun, termasuk orang
              yang menemukannya.
              <br /><br />
              <b>Saldomu tidak ikut hilang.</b> Uang menempel pada namamu, bukan pada kartu.
              <br /><br />
              Kalau kartunya ternyata ketemu, bawa ke TU — hanya TU yang bisa mengaktifkannya lagi,
              bukan kamu dari halaman ini.
            </div>
            <button type="button" className="btn danger blok" style={{ marginTop: 12 }} disabled={sibuk}
              onClick={() => void blokirKartu()}>{sibuk ? "Memblokir…" : "Ya, blokir sekarang"}</button>
            <button type="button" className="btn blok" style={{ marginTop: 8 }}
              onClick={() => setLembar(null)}>Batal</button>
          </div>
        ) : null}

        {data.tagihan.length > 0 ? (
          <div className="pcard">
            <h2>Tagihan atas namamu</h2>
            {data.tagihan.map(t => (
              <div key={t.id} className="att">
                <span className="badge warn">{t.sumber}</span>
                <div className="tx">
                  {t.keterangan ?? "—"}<br />
                  <b>{rp(t.nominal_rp)}</b> · {waktuSingkat(t.dibuat)}
                </div>
              </div>
            ))}
            <p className="p-note" style={{ marginTop: 10 }}>
              Tagihan dilunasi orang tuamu lewat portal mereka, atau di meja TU — tidak bisa dibayar
              dari halaman ini. Ditampilkan di sini supaya kamu tahu lebih dulu, bukan setelah
              ditagih.
            </p>
          </div>
        ) : null}

        <div className="pcard">
          <div className="hd2">
            <h2>Pra-pesan kantin</h2>
            <button type="button" className="btn sm" style={{ marginLeft: "auto" }}
              onClick={() => { setPesan(""); setGagal(false); setQty({}); setTampilMenu(!tampilMenu); }}>
              {tampilMenu ? "Tutup menu" : "Lihat menu"}
            </button>
          </div>

          {tampilMenu && !jendela ? (
            <p className="p-note" style={{ margin: 0 }}>
              {jendelaSiap
                ? "Menu belum bisa dimuat. Coba muat ulang halaman."
                : "Memuat menu…"}
            </p>
          ) : null}

          {tampilMenu && jendela ? (
            jendela.buka ? (
              <>
                <p className="p-note" style={{ marginTop: 0 }}>
                  Pesan sebelum {jam(jendela.jam_tutup)} · ambil {jam(jendela.ambil_mulai)}–{jam(jendela.ambil_selesai)}{" "}
                  di kasir dengan tap kartu, lewat jalur PO.
                </p>
                {jendela.menu.length === 0 ? (
                  <p className="p-note" style={{ margin: 0 }}>Belum ada menu yang dibuka untuk pra-pesan hari ini.</p>
                ) : jendela.menu.map(m => (
                  <div key={m.id} className="att">
                    <span className="badge mute">{m.kategori ?? "—"}</span>
                    <div className="tx">{m.nama}<br /><b>{rp(m.harga_rp)}</b></div>
                    <span className="act">
                      <div className="stepper" style={{ gap: 8 }}>
                        <button type="button" style={{ width: 34, height: 34, fontSize: 18 }}
                          aria-label={`Kurangi ${m.nama}`}
                          onClick={() => setQty({ ...qty, [m.id]: Math.max((qty[m.id] ?? 0) - 1, 0) })}>−</button>
                        <span className="vv" style={{ minWidth: 28, fontSize: 16 }}>{qty[m.id] ?? 0}</span>
                        <button type="button" style={{ width: 34, height: 34, fontSize: 18 }}
                          aria-label={`Tambah ${m.nama}`}
                          onClick={() => setQty({ ...qty, [m.id]: Math.min((qty[m.id] ?? 0) + 1, 10) })}>+</button>
                      </div>
                    </span>
                  </div>
                ))}
                {jendela.menu.length > 0 ? (
                  <>
                    <div className="t-total"><span className="l">Total</span><span className="v">{rp(totalPO)}</span></div>
                    <button type="button" className="btn pri blok" style={{ marginTop: 10 }}
                      disabled={sibuk || totalPO === 0} onClick={() => void kirimPO()}>
                      {sibuk ? "Memesan…" : "Pesan & bayar dari saldo"}
                    </button>
                    <p className="p-note" style={{ marginTop: 10 }}>
                      Saldo terpotong saat memesan, bukan saat mengambil. Setelah jam tutup pesanan
                      <b> tidak bisa dibatalkan</b> — dapur sudah memasak sesuai jumlah itu.
                    </p>
                  </>
                ) : null}
              </>
            ) : (
              <p className="p-note" style={{ margin: 0 }}>{jendela.alasan ?? "Pra-pesan sedang tutup."}</p>
            )
          ) : null}

          {data.po.length > 0 ? (
            <div style={{ marginTop: tampilMenu ? 14 : 0 }}>
              <div className="p-note" style={{ marginBottom: 6 }}>Pesananmu 7 hari terakhir</div>
              {data.po.map(p => (
                <div key={p.id} className="att">
                  <span className={`badge ${p.status === "diambil" ? "good" : p.status === "dibayar" ? "warn" : "mute"}`}>
                    {p.status}
                  </span>
                  <div className="tx">
                    {p.item ?? p.kode}<br />{rp(p.total_rp)} · {p.tanggal} · {p.kode}
                  </div>
                  {bisaBatal(p, jendela) ? (
                    <span className="act">
                      <button type="button" className="btn sm" disabled={sibuk}
                        onClick={() => void batalPO(p.id)}>Batalkan</button>
                    </span>
                  ) : null}
                </div>
              ))}
              <p className="p-note" style={{ marginTop: 10 }}>
                Kartumu diblokir? Tunjukkan kode PO ke kasir — pesanannya tetap milikmu.
              </p>
            </div>
          ) : null}
        </div>

        <div className="pcard">
          <div className="hd2">
            <h2>Buku pinjamanmu</h2>
            {bacaan === null ? (
              <button type="button" className="btn sm" style={{ marginLeft: "auto" }}
                onClick={() => void bukaBacaan()}>Riwayat bacaan</button>
            ) : (
              <button type="button" className="btn sm" style={{ marginLeft: "auto" }}
                onClick={() => setBacaan(null)}>Tutup riwayat</button>
            )}
          </div>

          {data.pinjaman.length === 0 ? (
            <p className="p-note" style={{ margin: 0 }}>Tidak ada buku yang sedang kamu pinjam.</p>
          ) : data.pinjaman.map(p => {
            const bolehPerpanjang = p.hari_telat === 0 && at !== null && p.diperpanjang < at.boleh_perpanjang;
            return (
              <div key={p.id} className="att">
                <span className={`badge ${p.hari_telat > 0 ? "crit" : "mute"}`}>
                  {p.hari_telat > 0 ? `telat ${p.hari_telat} hari` : "aktif"}
                </span>
                <div className="tx">
                  {p.judul}{p.pengarang ? ` — ${p.pengarang}` : ""}<br />
                  {p.hari_telat > 0 ? (
                    <b style={{ color: "var(--crit-text)" }}>
                      denda berjalan {rp(p.denda_berjalan_rp)} — kembalikan hari ini
                    </b>
                  ) : (
                    <>jatuh tempo {p.jatuh_tempo}</>
                  )}
                  {p.diperpanjang > 0 ? ` · sudah diperpanjang ${p.diperpanjang}×` : ""}
                </div>
                {bolehPerpanjang ? (
                  <span className="act">
                    <button type="button" className="btn sm" disabled={sibuk}
                      onClick={() => void perpanjang(p.id)}>Perpanjang</button>
                  </span>
                ) : null}
              </div>
            );
          })}

          {at ? (
            <p className="p-note" style={{ marginTop: 10 }}>
              {data.pinjaman.length} dari {at.maks_buku} buku · pinjam {at.lama_hari} hari ·
              perpanjang {at.boleh_perpanjang}× kalau belum lewat jatuh tempo. Denda{" "}
              {rp(at.denda_per_hari)}/hari, maksimal {rp(at.maks_denda_rp)} per buku:{" "}
              <b>dipotong dari saldomu di meja perpustakaan saat buku dikembalikan</b>, kalau kamu
              memasukkan PIN dan saldonya cukup. Kalau tidak, denda itu menjadi tagihan atas namamu
              yang dilunasi orang tua atau TU.
            </p>
          ) : null}

          {bacaan !== null ? (
            <div style={{ marginTop: 12 }}>
              <div className="p-note" style={{ marginBottom: 6 }}>Riwayat bacaan</div>
              {bacaan.length === 0 ? (
                <p className="p-note" style={{ margin: 0 }}>Belum ada catatan peminjaman.</p>
              ) : bacaan.slice(0, 50).map((b, i) => (
                <div key={`${b.judul}:${b.dipinjam}:${i}`} className="att">
                  <span className={`badge ${b.masih_dipinjam ? "info" : b.terlambat ? "warn" : "mute"}`}>
                    {b.masih_dipinjam ? "dipinjam" : b.terlambat ? "telat" : "selesai"}
                  </span>
                  <div className="tx">
                    {b.judul}{b.pengarang ? ` — ${b.pengarang}` : ""}<br />
                    {b.dipinjam}{b.dikembalikan ? ` → ${b.dikembalikan.slice(0, 10)}` : ""}
                    {b.kategori ? ` · ${b.kategori}` : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {data.laundry.length > 0 ? (
          <div className="pcard">
            <h2>Laundry kamu</h2>
            {data.laundry.map(l => (
              <div key={l.id} className="att">
                <span className={`badge ${l.status === "siap" ? "good" : "mute"}`}>{l.status}</span>
                <div className="tx">
                  {l.item ?? l.kode}<br />
                  <b>{rp(l.total_rp)}</b>
                  {l.rak ? <> · rak {l.rak}</> : null}
                  {l.siap_pada ? <> · siap {waktuSingkat(l.siap_pada)}</> : null}
                </div>
              </div>
            ))}
            <p className="p-note" style={{ marginTop: 10 }}>
              Dibayar dengan kartu + PIN saat diambil, bukan saat disetor.
            </p>
          </div>
        ) : null}

        {data.loker ? (
          <div className="pcard">
            <h2>Loker kamu</h2>
            <p style={{ margin: 0, fontSize: 13.5 }}>
              <b>{data.loker.kode}</b> · {data.loker.lokasi ?? `blok ${data.loker.blok}`} · kondisi {data.loker.kondisi}
              <br /><span className="p-note">terakhir dibuka {waktuSingkat(data.loker.akses_terakhir)}</span>
            </p>
            <p className="p-note" style={{ marginTop: 10 }}>
              Buka cukup tap kartu, tanpa PIN. Kartu diblokir berarti loker ikut tidak bisa dibuka
              sampai kartu baru terbit — kalau ada barang mendesak, hubungi pembina asramamu (buka
              darurat tercatat).
            </p>
          </div>
        ) : null}

        <div className="pcard">
          <div className="hd2">
            <h2>Riwayat kamu</h2>
            <span style={{ marginLeft: "auto" }}>
              <input type="month" value={bulan} onChange={e => setBulan(e.target.value)}
                aria-label="Saring bulan" style={{ fontSize: 12 }} />
            </span>
          </div>

          {sengketa ? (
            <div className="t-err" style={{ marginBottom: 12 }}>
              Laporkan transaksi vending yang uangnya terpotong tapi barangnya tidak keluar. Bagian
              keuangan memeriksa catatan mesinnya, lalu mengembalikan uangnya kalau memang tidak
              keluar.
              <div className="field" style={{ marginTop: 10 }}>
                <label className="f" htmlFor="sk">Ceritakan apa yang terjadi</label>
                <input id="sk" type="text" maxLength={300} value={sengketa.catatan} style={{ width: "100%" }}
                  onChange={e => setSengketa({ ...sengketa, catatan: e.target.value })}
                  placeholder="mis. uang terpotong tapi minumannya tersangkut" />
              </div>
              <button type="button" className="btn pri blok" disabled={sibuk || sengketa.catatan.trim().length < 3}
                onClick={() => void kirimSengketa()}>{sibuk ? "Mengirim…" : "Kirim laporan"}</button>
              <button type="button" className="btn blok" style={{ marginTop: 8 }}
                onClick={() => setSengketa(null)}>Batal</button>
            </div>
          ) : null}

          {riwayat === null ? (
            <p className="p-note" style={{ margin: 0 }}>Memuat riwayat…</p>
          ) : riwayat.length === 0 ? (
            <p className="p-note" style={{ margin: 0 }}>
              {bulan ? "Tidak ada transaksi pada bulan itu." : "Belum ada transaksi."}
            </p>
          ) : riwayat.slice(0, 60).map(t => (
            <div key={t.id} className="att">
              <span className={`badge ${t.arah_rp > 0 ? "good" : "mute"}`}>{t.jenis}</span>
              <div className="tx">
                {t.item ?? t.keterangan ?? t.layanan ?? "—"}<br />
                <b>{t.arah_rp > 0 ? "+" : "−"}{rp(Math.abs(t.arah_rp))}</b> · {waktuSingkat(t.waktu)}
                {t.offline ? " · offline" : ""}
                {t.direfund_rp ? <> · dikembalikan {rp(t.direfund_rp)}</> : null}
              </div>
              {t.layanan === "vending" && t.jenis === "belanja" && !t.direfund_rp ? (
                <span className="act">
                  <button type="button" className="btn sm"
                    onClick={() => { setPesan(""); setSengketa({ transaksi_id: t.id, catatan: "" }); }}>
                    Barang tidak keluar
                  </button>
                </span>
              ) : null}
            </div>
          ))}

          <p className="p-note" style={{ marginTop: 10 }}>
            Kamu hanya bisa melihat datamu sendiri (F-103) — bukan karena tombolnya disembunyikan,
            tapi karena server mengambil identitasmu dari sesi login dan tidak menerima nomor siswa
            dari halaman ini.
          </p>
        </div>
      </div>
    </div>
  );
}

/** "06:00:00" → "06.00" */
function jam(x: string | null | undefined): string {
  if (!x) return "—";
  return x.slice(0, 5).replace(":", ".");
}

/** Tanggal sekolah hari ini (WIB) sebagai 'YYYY-MM-DD'. */
function hariIni(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
}

/** Jam dinding WIB sekarang sebagai 'HH:MM' — sebanding dengan jam kebijakan. */
function jamIni(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta",
  });
}

/**
 * Apakah PO ini masih bisa dibatalkan siswa.
 *
 * Batasnya sama persis dengan `po_batal` di SQL: hari yang sama DAN belum
 * lewat jam tutup PO. Memakai tanggal saja — seperti versi pertama layar ini
 * — membuat tombol "Batalkan" tetap tampil sepanjang sore, padahal dapur
 * sudah memasak dan server pasti menolak dengan PO_SUDAH_TUTUP.
 *
 * Kalau jendela gagal dimuat, tombolnya tetap ditampilkan: server yang
 * memutuskan, dan menyembunyikan aksi yang sebenarnya sah lebih merugikan
 * daripada satu penolakan yang dijelaskan.
 */
function bisaBatal(p: { status: string; tanggal: string }, j: Jendela | null): boolean {
  if (p.status !== "dibayar") return false;
  if (p.tanggal > hariIni()) return true;
  if (p.tanggal < hariIni()) return false;
  if (!j) return true;
  return jamIni() < j.jam_tutup.slice(0, 5);
}
