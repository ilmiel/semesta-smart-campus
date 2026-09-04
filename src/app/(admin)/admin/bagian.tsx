"use client";

import Link from "next/link";
import ChartJam, { type Jam } from "@/components/ChartJam";
import { Att, Badge, CatatanKaki, JenChip, Panel, Tile } from "@/components/ui";
import { sejak, useMuat, waktuSingkat } from "@/lib/admin";
import { rp, ribuan } from "@/lib/format";

/**
 * Beranda — keadaan hari ini, dan hanya hal yang butuh keputusan.
 *
 * Sebelumnya halaman ini memajang 412 transaksi dan Rp 41 juta yang tidak
 * pernah ada. Untuk layar yang dibuka setiap pagi, angka karangan lebih
 * buruk daripada layar kosong: orang berhenti memeriksanya, lalu berhenti
 * mempercayainya ketika akhirnya berisi angka sungguhan.
 *
 * Kolom rupiah dipangkas SERVER untuk peran tanpa hak uang — kesiswaan dan
 * wali kelas menerima halaman yang sama tanpa angka rupiah di dalamnya,
 * bukan dengan angka yang disembunyikan CSS. Karena itu semua nilai uang di
 * sini bertipe `number | null` dan null berarti "tidak dikirim", bukan nol.
 */

interface Kpi {
  transaksi_hari_ini: number; omzet_hari_ini_rp: number | null; siswa_aktif: number;
  kartu_aktif: number; total_float_rp: number | null; device_online: number; device_total: number;
  antrian_tertunda: number; ditolak_hari_ini: number; pin_terkunci: number;
  kartu_dicabut_hari_ini: number; topup_hari_ini_rp: number | null;
  rekonsiliasi_terakhir: string | null; selisih_terakhir: number | null;
  kesejahteraan: number; tagihan_menunggu: number;
}
interface Transaksi {
  waktu: string; jenis: string; siswa: string | null; device: string | null;
  total_rp: number; layanan: string | null; item: string | null;
}
interface Ditolak {
  id: number; device: string; idempotency_key: string; kartu_uid: string | null;
  siswa_id: number | null; nama: string | null; nominal_rp: number; waktu_terminal: string;
  diterima: string; alasan_tolak: string | null;
}
interface PinTerkunci { siswa_id: number; nis: string; nama: string; terkunci_hingga: string; jumlah_kunci: number; permanen: boolean }
interface KartuDicabut {
  id: number; uid: string | null; status: string; dicabut: string; alasan: string | null;
  siswa_id: number; nis: string; nama: string; sudah_ada_pengganti: boolean;
}
interface DeviceBermasalah {
  id: number; kode: string; nama: string; layanan: string; lokasi: string | null;
  status: string; terakhir_online: string | null; antrian_tertunda: number;
}

interface Isi {
  kpi: Kpi;
  per_jam: Jam[];
  transaksi_terakhir: Transaksi[];
  perhatian: {
    antrian_ditolak: Ditolak[];
    pin_terkunci: PinTerkunci[];
    kartu_dicabut: KartuDicabut[];
    device_bermasalah: DeviceBermasalah[];
  };
  peran: string[];
}

export default function Bagian() {
  const { data, galat, sedang, muatUlang } = useMuat<Isi>("/api/admin/beranda");

  if (galat) return <div className="demo" style={{ borderColor: "var(--crit)" }}>{galat}</div>;
  if (!data) return <p className="p-note">{sedang ? "Memuat beranda…" : "Tidak ada data."}</p>;

  const k = data.kpi;
  const uang = k.omzet_hari_ini_rp !== null;
  const p = data.perhatian;
  const jumlahPerhatian =
    p.antrian_ditolak.length + p.pin_terkunci.length + p.kartu_dicabut.length + p.device_bermasalah.length;

  return (
    <>
      <div className="top">
        <div>
          <h1>Beranda</h1>
          <div className="sub">{tanggalHariIni()}</div>
        </div>
        <div className="right">
          <button type="button" className="btn" onClick={() => void muatUlang()}>Muat ulang</button>
        </div>
      </div>

      <div className="kpis">
        <Tile label="Transaksi hari ini" value={ribuan(k.transaksi_hari_ini)}
          sub={`${k.device_online}/${k.device_total} terminal online`} />
        {uang ? (
          <Tile label="Omzet kantin hari ini" value={rp(k.omzet_hari_ini_rp ?? 0)}
            sub={`top-up hari ini ${rp(k.topup_hari_ini_rp ?? 0)}`} />
        ) : null}
        {uang ? (
          <Tile label="Total saldo siswa" value={rp(k.total_float_rp ?? 0)}
            sub={`${ribuan(k.kartu_aktif)} kartu aktif · ${ribuan(k.siswa_aktif)} siswa`} />
        ) : (
          <Tile label="Siswa aktif" value={ribuan(k.siswa_aktif)} sub={`${ribuan(k.kartu_aktif)} kartu aktif`} />
        )}
        <Tile label="Rekonsiliasi terakhir"
          value={k.rekonsiliasi_terakhir === null
            ? <span style={{ color: "var(--warn-text)" }}>belum pernah</span>
            : k.selisih_terakhir === 0
              ? <span style={{ color: "var(--good-text)" }}>✓ 0 selisih</span>
              : <span style={{ color: "var(--crit-text)" }}>{ribuan(k.selisih_terakhir ?? 0)} selisih</span>}
          sub={k.rekonsiliasi_terakhir ? waktuSingkat(k.rekonsiliasi_terakhir) : "ledger belum pernah dicocokkan"} />
      </div>

      <div className="row">
        <Panel judul="Transaksi per jam" sub="hari ini, semua terminal">
          <ChartJam data={data.per_jam} />
          {data.per_jam.length === 0 ? (
            <CatatanKaki>Belum ada transaksi hari ini.</CatatanKaki>
          ) : null}
        </Panel>

        <Panel judul="Perlu perhatian"
          sub={jumlahPerhatian === 0 ? "tidak ada" : `${jumlahPerhatian} hal`}>
          {p.device_bermasalah.map(d => (
            <Att key={`dev-${d.id}`} badge="terminal" warna={d.status === "offline" ? "crit" : "warn"}
              aksi={<Link href="/admin/perangkat">Perangkat →</Link>}>
              <b>{d.kode}</b> {d.status} — terakhir online {sejak(d.terakhir_online)}
              {d.antrian_tertunda > 0 ? <> · {d.antrian_tertunda} transaksi belum tersinkron</> : null}
            </Att>
          ))}
          {p.antrian_ditolak.map(a => (
            <Att key={`tolak-${a.id}`} badge="ditolak" warna="crit">
              {a.nama ?? "kartu tidak dikenal"} · {rp(a.nominal_rp)} dari <b>{a.device}</b> —{" "}
              {a.alasan_tolak ?? "ditolak server"}
              <br /><span className="p-note">
                Transaksi offline ini tidak masuk saldo siapa pun. Perlu diputuskan keuangan.
              </span>
            </Att>
          ))}
          {p.pin_terkunci.map(s => (
            <Att key={`pin-${s.siswa_id}`} badge="PIN" warna="warn"
              aksi={<Link href={`/admin/siswa/${encodeURIComponent(s.nis)}`}>Buka →</Link>}>
              <b>{s.nama}</b> terkunci {s.permanen ? "permanen" : `sampai ${waktuSingkat(s.terkunci_hingga)}`}
              {s.jumlah_kunci > 1 ? <> · sudah {s.jumlah_kunci} kali</> : null}
            </Att>
          ))}
          {p.kartu_dicabut.map(kk => (
            <Att key={`kartu-${kk.id}`} badge="kartu" warna={kk.sudah_ada_pengganti ? "info" : "warn"}
              aksi={<Link href={`/admin/siswa/${encodeURIComponent(kk.nis)}`}>Buka →</Link>}>
              <b>{kk.nama}</b> — kartu {kk.status}{kk.alasan ? ` (${kk.alasan})` : ""}
              {kk.sudah_ada_pengganti ? " · pengganti sudah terbit" : " · belum ada pengganti"}
            </Att>
          ))}
          {jumlahPerhatian === 0 ? (
            <p className="p-note" style={{ margin: 0 }}>
              Tidak ada terminal bermasalah, transaksi ditolak, PIN terkunci, atau kartu dicabut hari ini.
            </p>
          ) : null}
          <CatatanKaki>
            Daftar ini hanya berisi hal yang butuh keputusan orang. Angka lain — tagihan
            menunggu ({k.tagihan_menunggu}), indikator kesejahteraan ({k.kesejahteraan}) —
            ada di modulnya masing-masing.
          </CatatanKaki>
        </Panel>
      </div>

      {uang ? (
        <Panel judul="Transaksi terakhir" sub="12 terbaru, semua layanan">
          <div className="tw">
            <table>
              <thead><tr><th>Waktu</th><th>Siswa</th><th>Jenis</th><th>Layanan</th><th>Item</th>
                <th>Terminal</th><th className="num">Nilai</th></tr></thead>
              <tbody>
                {data.transaksi_terakhir.map((t, i) => (
                  <tr key={i}>
                    <td>{waktuSingkat(t.waktu)}</td>
                    <td>{t.siswa ?? "—"}</td>
                    <td><JenChip jenis={t.jenis} /></td>
                    <td>{t.layanan ?? "—"}</td>
                    <td>{t.item ?? "—"}</td>
                    <td className="mono">{t.device ?? "—"}</td>
                    <td className="num">{rp(t.total_rp)}</td>
                  </tr>
                ))}
                {data.transaksi_terakhir.length === 0 ? (
                  <tr><td colSpan={7} className="p-note">Belum ada transaksi.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <Panel judul="Transaksi terakhir">
          <p className="p-note" style={{ margin: 0 }}>
            Peranmu tidak mencakup data rupiah, jadi daftar transaksi tidak dikirim server.
            <Badge warna="mute">{data.peran.join(" · ") || "tanpa peran"}</Badge>
          </p>
        </Panel>
      )}
    </>
  );
}

/** "Kamis, 4 September 2026 · Tahun ajaran berjalan" */
function tanggalHariIni(): string {
  return new Date().toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  });
}
