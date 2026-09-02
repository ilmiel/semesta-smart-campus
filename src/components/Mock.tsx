"use client";

import type { ReactNode } from "react";
import { useToast } from "./Toast";

/** Tombol/link untuk aksi yang belum berfungsi — memberi tahu terang-terangan. */
export function AksiContoh({ children, kelas = "btn", gaya }: {
  children: ReactNode; kelas?: string; gaya?: React.CSSProperties;
}) {
  const toast = useToast();
  return (
    <button type="button" className={kelas} style={gaya}
      onClick={() => toast("Aksi contoh — berfungsi setelah backend Fase 1a")}>
      {children}
    </button>
  );
}

export function TautanContoh({ children }: { children: ReactNode }) {
  const toast = useToast();
  return (
    <a role="button" tabIndex={0} style={{ cursor: "pointer" }}
      onClick={() => toast("Aksi contoh — berfungsi setelah backend Fase 1a")}
      onKeyDown={e => { if (e.key === "Enter") toast("Aksi contoh — berfungsi setelah backend Fase 1a"); }}>
      {children}
    </a>
  );
}
