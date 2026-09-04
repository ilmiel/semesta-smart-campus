"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiAdmin } from "@/lib/admin";

/**
 * Pintu masuk ke layar ganti PIN, dipasang di atas portal siswa.
 *
 * Layar ganti PIN tidak ada gunanya kalau tidak ada jalan menuju ke sana.
 * Siswa yang baru menerima PIN sementara dari TU tidak akan menebak URL-nya
 * — dan justru merekalah yang paling perlu menggantinya, karena PIN itu baru
 * saja diucapkan di meja dengan antrean di belakangnya.
 *
 * Karena itu peringatannya muncul sendiri, tidak menunggu siswa mencari.
 */
export default function PinBanner() {
  const [perlu, setPerlu] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await apiAdmin<{ siswa: { pin_ada: boolean; pin_harus_ganti: boolean | null } }>("/api/siswa/saya");
      if (r.ok) setPerlu(Boolean(r.data!.siswa.pin_ada && r.data!.siswa.pin_harus_ganti));
    })();
  }, []);

  if (perlu === null) return null;

  if (perlu) {
    return (
      <div className="t-err" style={{ marginBottom: 14 }}>
        PIN-mu masih PIN sementara dari TU. PIN itu berlaku penuh untuk pembayaran, dan siapa
        pun yang sempat mendengarnya di meja TU bisa memakainya.
        <Link href="/siswa/pin" className="btn pri" style={{ display: "inline-flex", marginTop: 10 }}>
          Ganti PIN sekarang
        </Link>
      </div>
    );
  }

  return (
    <p className="p-note" style={{ marginBottom: 14 }}>
      <Link href="/siswa/pin">Ganti PIN</Link>
    </p>
  );
}
