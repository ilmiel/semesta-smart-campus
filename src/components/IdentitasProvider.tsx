"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_IDENTITAS, type IdentitasSekolah } from "@/lib/identitas";

interface IdentitasContextValue {
  identitas: IdentitasSekolah;
  setIdentitas: (baru: IdentitasSekolah) => void;
}

const IdentitasContext = createContext<IdentitasContextValue>({
  identitas: DEFAULT_IDENTITAS,
  setIdentitas: () => {},
});

export function IdentitasProvider({
  initialIdentitas,
  children,
}: {
  initialIdentitas: IdentitasSekolah;
  children: ReactNode;
}) {
  const [identitas, setIdentitasState] = useState<IdentitasSekolah>(initialIdentitas);

  const setIdentitas = (baru: IdentitasSekolah) => {
    setIdentitasState(baru);
    try {
      localStorage.setItem("smartcampus.identitas", JSON.stringify(baru));
    } catch {}
  };

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "smartcampus.identitas" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && typeof parsed === "object") {
            setIdentitasState(parsed);
          }
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <IdentitasContext.Provider value={{ identitas, setIdentitas }}>
      {children}
    </IdentitasContext.Provider>
  );
}

export function useIdentitas(): IdentitasContextValue {
  return useContext(IdentitasContext);
}
