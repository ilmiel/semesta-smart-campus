"use client";

/**
 * Halaman bayar gateway SIMULASI (dev). Menggantikan halaman pembayaran
 * mayar.id selama KYC belum selesai. Tombol memicu webhook lewat server.
 */
import { Suspense, use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { rp } from "@/lib/format";

function KontenSimulasiBayar({ params }: { params: Promise<{ invoice: string }> }) {
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
    } catch (e) {
      setHasil(`Gagal: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setSibuk(false); }
  };

  return (
    <div className="root" style={{ maxWidth: 480, margin: "48px auto", padding: 24 }}>
      <div className="panel" style={{ padding: 24 }}>
        <p className="p-note" style={{ margin: 0 }}>GATEWAY SIMULASI — Uji Coba Pembayaran</p>
        <h1 style={{ margin: "8px 0 4px", fontSize: 22 }}>Bayar {rp(nominal)}</h1>
        <p className="p-note" style={{ margin: "0 0 20px" }}>Invoice <span className="mono">{invoice}</span></p>
        <button type="button" className="btn pri blok" disabled={sibuk} onClick={() => kirim("payment.paid")}>
          {sibuk ? "Memproses…" : "Simulasi: Pembayaran BERHASIL"}
        </button>
        <button type="button" className="btn blok" style={{ marginTop: 10 }} disabled={sibuk} onClick={() => kirim("payment.expired")}>
          Simulasi: invoice KEDALUWARSA
        </button>
        <button type="button" className="btn blok" style={{ marginTop: 10 }} disabled={sibuk} onClick={() => kirim("payment.paid")}>
          Kirim webhook &ldquo;berhasil&rdquo; sekali lagi (uji dobel, F-22)
        </button>
        {hasil ? (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontWeight: 600, color: hasil.startsWith("Gagal") ? "var(--crit-text, #ef4444)" : "var(--brand-pri, #10b981)" }}>
              {hasil}
            </p>
            <a href="/ortu" className="btn pri blok" style={{ marginTop: 12, textAlign: "center", textDecoration: "none" }}>
              Kembali ke Portal Orang Tua
            </a>
          </div>
        ) : null}
        <p className="p-note" style={{ marginTop: 20 }}>
          Setelah pembayaran berhasil, Anda bisa kembali ke portal orang tua untuk melihat saldo yang sudah bertambah.
        </p>
      </div>
    </div>
  );
}

export default function SimulasiBayar(props: { params: Promise<{ invoice: string }> }) {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: "center" }}>Memuat halaman simulasi…</div>}>
      <KontenSimulasiBayar {...props} />
    </Suspense>
  );
}
