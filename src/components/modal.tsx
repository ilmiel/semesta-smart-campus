"use client";

import { useEffect, type ReactNode } from "react";

export interface ModalProps {
  judul?: ReactNode;
  sub?: ReactNode;
  onTutup: () => void;
  children: ReactNode;
  maxWidth?: number | string;
}

/**
 * Modal dialog pop-up universal (Client Component).
 * - Menampilkan dialog melayang di tengah layar dengan backdrop blur.
 * - Menangani penutupan via tombol Esc dan klik pada backdrop di luar kotak.
 * - Mengunci scroll pada body selama dialog terbuka.
 */
export function Modal({ judul, sub, onTutup, children, maxWidth = 540 }: ModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onTutup();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onTutup]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onTutup();
      }}
    >
      <div className="modal-kotak" style={{ maxWidth }}>
        <div className="modal-head">
          <div className="modal-judul-wrap">
            {judul ? <h2 className="modal-judul">{judul}</h2> : null}
            {sub ? <div className="modal-sub">{sub}</div> : null}
          </div>
          <button
            type="button"
            className="modal-tutup"
            onClick={onTutup}
            aria-label="Tutup dialog"
            title="Tutup (Esc)"
          >
            ✕
          </button>
        </div>
        <div className="modal-isi">{children}</div>
      </div>
    </div>
  );
}
