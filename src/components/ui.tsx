import type { ReactNode, CSSProperties } from "react";

/* Komponen presentasional bersama — Server Component, tanpa state. */

export function Tile({ label, value, sub, valueStyle }: {
  label: string; value: ReactNode; sub?: ReactNode; valueStyle?: CSSProperties;
}) {
  return (
    <div className="tile">
      <div className="lbl">{label}</div>
      <div className="val" style={valueStyle}>{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function Panel({ judul, sub, aksi, children }: {
  judul?: ReactNode; sub?: string; aksi?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="panel">
      {judul ? (
        <div className="hd">
          <h2>{judul}</h2>
          {sub ? <span className="sub">{sub}</span> : null}
          {aksi ? <div className="r">{aksi}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type WarnaBadge = "good" | "warn" | "crit" | "info" | "mute";
export function Badge({ warna, children }: { warna: WarnaBadge; children: ReactNode }) {
  return <span className={`badge ${warna}`}>{children}</span>;
}

export function StChip({ jenis, children }: { jenis: string; children: ReactNode }) {
  return <span className={`st-chip ${jenis}`}>{children}</span>;
}

export function JenChip({ jenis }: { jenis: string }) {
  const label = jenis === "topup" ? "top-up" : jenis;
  return <span className={`jen ${jenis}`}>{label}</span>;
}

/** Item pada daftar "perlu perhatian" / kejadian */
export function Att({ badge, warna, aksi, children }: {
  badge: ReactNode; warna: WarnaBadge; aksi?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="att">
      <Badge warna={warna}>{badge}</Badge>
      <div className="tx">{children}</div>
      {aksi ? <span className="act">{aksi}</span> : null}
    </div>
  );
}

export function Demo({ children }: { children?: ReactNode }) {
  return <div className="demo">{children ?? "Data contoh — belum tersambung backend (Fase 1a)."}</div>;
}

export function CatatanKaki({ children }: { children: ReactNode }) {
  return <div className="p-note" style={{ marginTop: 10 }}>{children}</div>;
}
