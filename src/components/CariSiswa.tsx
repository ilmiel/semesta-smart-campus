"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

/**
 * Pencarian siswa untuk form admin.
 *
 * Memakai endpoint daftar siswa yang sama dengan halaman Siswa, jadi
 * pemangkasan kolom per peran ikut berlaku — pembina asrama tidak melihat
 * saldo atau UID kartu dari sini.
 *
 * Hanya siswa berstatus aktif yang dicari: menugaskan loker atau mengisi
 * saldo untuk siswa yang sudah lulus hampir selalu salah orang.
 */
export interface SiswaRingkas { id: number; nis: string; nama: string; kelas: string | null }

export default function CariSiswa({ terpilih, onPilih, autoFocus }: {
  terpilih: SiswaRingkas | null;
  onPilih: (s: SiswaRingkas | null) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<SiswaRingkas[]>([]);
  const [cari, setCari] = useState(false);
  const urut = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) { setHasil([]); return; }
    const t = setTimeout(async () => {
      const punyaku = ++urut.current;
      setCari(true);
      const r = await api<{ siswa: SiswaRingkas[] }>(
        `/api/admin/siswa?status=aktif&q=${encodeURIComponent(q.trim())}`);
      if (punyaku !== urut.current) return;
      setCari(false);
      setHasil(r.ok ? r.data!.siswa.slice(0, 8) : []);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  if (terpilih) {
    return (
      <div className="a-ok">
        {terpilih.nama} <span className="kls">{terpilih.kelas ?? terpilih.nis}</span>
        <button type="button" className="btn sm" style={{ marginLeft: 10 }} onClick={() => onPilih(null)}>Ganti</button>
      </div>
    );
  }

  return (
    <>
      <div className="field">
        <label className="f" htmlFor="cari-siswa">Cari siswa (nama atau NIS)</label>
        <input id="cari-siswa" type="search" autoFocus={autoFocus} value={q} style={{ width: "100%", maxWidth: 460 }}
          onChange={e => setQ(e.target.value)} placeholder="ketik minimal 2 huruf" />
      </div>
      {cari ? <p className="p-note" style={{ margin: 0 }}>Mencari…</p> : null}
      <div className="a-aksi">
        {hasil.map(s => (
          <button key={s.id} type="button" className="btn sm" onClick={() => onPilih(s)}>
            {s.nama} · {s.kelas ?? s.nis}
          </button>
        ))}
      </div>
      {q.trim().length >= 2 && hasil.length === 0 && !cari ? (
        <p className="p-note" style={{ margin: 0 }}>Tidak ada siswa aktif yang cocok.</p>
      ) : null}
    </>
  );
}
