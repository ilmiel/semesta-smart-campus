"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

/**
 * Toast ringan untuk aksi contoh & konfirmasi.
 * Provider dipasang sekali di root layout; komponen client mana pun
 * memakai useToast().
 */
const ToastContext = createContext<(pesan: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [pesan, setPesan] = useState("");
  const [tampil, setTampil] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((p: string) => {
    setPesan(p);
    setTampil(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTampil(false), 2600);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div id="toast" role="status" className={tampil ? "show" : ""}>{pesan}</div>
    </ToastContext.Provider>
  );
}
