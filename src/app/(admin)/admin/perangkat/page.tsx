import type { Metadata } from "next";
import { Badge, CatatanKaki, Demo, Panel } from "@/components/ui";
import { AksiContoh, TautanContoh } from "@/components/Mock";
import { DEVICES, type StatusDevice } from "@/lib/data";

export const metadata: Metadata = { title: "Perangkat" };

function BadgeDevice({ status, terakhir }: { status: StatusDevice; terakhir: string }) {
  switch (status) {
    case "online": return <Badge warna="good">● online</Badge>;
    case "offline": return <Badge warna="warn">● offline 14 mnt</Badge>;
    case "cache": return <Badge warna="warn">● cache 2 jam</Badge>;
    case "nonaktif": return <Badge warna="crit">dinonaktifkan</Badge>;
    default: return <Badge warna="mute">disiapkan · {terakhir}</Badge>;
  }
}

const ANTRIAN_TU = [
  { waktu: "12.42", siswa: "Aishabilla P.", kelas: "7.A", nominal: "15.000" },
  { waktu: "12.44", siswa: "Keenan A.", kelas: "8.B", nominal: "10.000" },
  { waktu: "12.51", siswa: "Salsabila Z.", kelas: "11.B", nominal: "8.000" },
];

export default function HalamanPerangkat() {
  return (
    <>
      <div className="top">
        <div>
          <h1>Perangkat</h1>
          <div className="sub">Setiap terminal punya API key sendiri — berada di jaringan sekolah saja tidak cukup (PRD §5-10)</div>
        </div>
        <div className="right"><AksiContoh kelas="btn pri">+ Daftarkan terminal</AksiContoh></div>
      </div>
      <Demo />

      <Panel judul="Terminal terdaftar" sub={`${DEVICES.filter(d => d.status !== "nonaktif").length} aktif · 1 nonaktif`}>
        <div className="tw">
          <table>
            <thead><tr><th>Kode</th><th>Layanan</th><th>Lokasi</th><th>Status</th><th>Terakhir online</th><th className="num">Limit offline</th><th className="num">Antrian</th><th>Aksi</th></tr></thead>
            <tbody>
              {DEVICES.map(d => {
                const mati = d.status === "nonaktif";
                const abu = mati ? { color: "var(--ink-3)" } : undefined;
                return (
                  <tr key={d.kode}>
                    <td className="mono" style={abu}>{mati ? d.kode : <b>{d.kode}</b>}</td>
                    <td style={abu}>{d.layanan}</td>
                    <td style={abu}>{d.lokasi}</td>
                    <td><BadgeDevice status={d.status} terakhir={d.terakhir} /></td>
                    <td style={abu}>{d.terakhir}</td>
                    <td className="num" style={abu}>{d.limitOffline}</td>
                    <td className="num" style={d.antrian === "3" ? { color: "var(--warn-text)", fontWeight: 700 } : abu}>{d.antrian}</td>
                    <td>{mati ? <span style={{ color: "var(--ink-3)" }}>API key ditolak</span>
                      : d.aksi.map((a, i) => <span key={a}>{i > 0 ? " · " : ""}<TautanContoh>{a}</TautanContoh></span>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <CatatanKaki>
          Terminal hilang/dicuri → nonaktifkan di sini, API key langsung ditolak; antrian offline di
          terminal terenkripsi dengan kunci device (PRD §9).
        </CatatanKaki>
      </Panel>

      <div className="row2" style={{ marginTop: 14 }}>
        <Panel judul="Antrian offline — TOPUP-TU" sub="menunggu sinkron">
          <div className="tw">
            <table>
              <thead><tr><th>Waktu terminal</th><th>Siswa</th><th className="num">Nominal</th><th>Status</th></tr></thead>
              <tbody>
                {ANTRIAN_TU.map(a => (
                  <tr key={a.waktu}>
                    <td className="mono">{a.waktu}</td>
                    <td>{a.siswa} <span className="kls">{a.kelas}</span></td>
                    <td className="num">{a.nominal}</td>
                    <td><Badge warna="warn">menunggu</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CatatanKaki>
            Diproses otomatis begitu online — idempotency key mencegah dobel (F-14, F-44). Yang ditolak
            server masuk daftar keuangan, tidak hilang diam-diam.
          </CatatanKaki>
        </Panel>

        <Panel judul="Kesehatan sistem">
          <div className="term"><span className="dot on" /><div><div className="nm">API server</div><div className="loc">VPS · respons 82 ms</div></div><div className="st">Normal</div></div>
          <div className="term"><span className="dot on" /><div><div className="nm">PostgreSQL</div><div className="loc">koneksi 6/20</div></div><div className="st">Normal</div></div>
          <div className="term"><span className="dot on" /><div><div className="nm">Backup harian</div><div className="loc">terakhir 01 Sep 02.00 · 214 MB</div></div><div className="st">Sukses<br /><TautanContoh>uji restore kuartal →</TautanContoh></div></div>
          <div className="term"><span className="dot on" /><div><div className="nm">Webhook mayar.id</div><div className="loc">terakhir diterima 12.41</div></div><div className="st">Normal</div></div>
          <CatatanKaki>Uji restore wajib tercatat minimal sekali per kuartal (PRD §8.2) — bukan sekadar backup jalan.</CatatanKaki>
        </Panel>
      </div>
    </>
  );
}
