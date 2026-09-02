"use client";

/**
 * Halaman bayar gateway SIMULASI (dev). Menggantikan halaman pembayaran
 * mayar.id selama KYC belum selesai. Tombol memicu webhook lewat server.
 */
import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { rp } from "@/lib/format";

export default function SimulasiBayar({ params }: { params: Promise<{ invoice: string }> }) {
  const { invoice } = use(params);
  const sp = useSearchParams();
  const nominal = Number(sp.get("nominal") ?? 0);
  const [hasil, setHasil] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const kirim = async (event: "payment.paid" | "payment.expired") => {
    setSibuk(true);
    try {
      const r = await fetch("/api/simulasi-bayar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoice_id: invoice, event, nominal_rp: nominal }) });
      const j = await r.json();
      setHasil(j.ok ? `Webhook diterima: ${j.data.catatan}` : `Gagal: ${j.pesan}`);
    } finally { setSibuk(false); }
  };

  return (
    <div className="root" style={{ maxWidth: 480, margin: "48px auto", padding: 24 }}>
      <div className="panel" style={{ padding: 24 }}>
        <p className="p-note" style={{ margin: 0 }}>GATEWAY SIMULASI — bukan pembayaran sungguhan</p>
        <h1 style={{ margin: "8px 0 4px", fontSize: 22 }}>Bayar {rp(nominal)}</h1>
        <p className="p-note" style={{ margin: "0 0 20px" }}>Invoice <span className="mono">{invoice}</span></p>
        <button type="button" className="btn pri blok" disabled={sibuk} onClick={() => kirim("payment.paid")}>Simulasi: pembayaran BERHASIL</button>
        <button type="button" className="btn blok" style={{ marginTop: 10 }} disabled={sibuk} onClick={() => kirim("payment.expired")}>Simulasi: invoice KEDALUWARSA</button>
        <button type="button" className="btn blok" style={{ marginTop: 10 }} disabled={sibuk} onClick={() => kirim("payment.paid")}>Kirim webhook "berhasil" sekali lagi (uji dobel, F-22)</button>
        {hasil ? <p style={{ marginTop: 16 }}>{hasil}</p> : null}
        <p className="p-note" style={{ marginTop: 20 }}>Setelah itu buka kembali portal orang tua — saldo bertambah sekali walau webhook dikirim dua kali.</p>
      </div>
    </div>
  );
}
