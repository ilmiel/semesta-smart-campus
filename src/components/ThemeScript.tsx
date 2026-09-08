"use client";

import { useEffect } from "react";
import { terapkanTemaKeDom, type TemaWarna } from "@/lib/tema";

export default function ThemeScript({ initialTheme }: { initialTheme: TemaWarna }) {
  useEffect(() => {
    // Pastikan tema aktif di DOM
    terapkanTemaKeDom(initialTheme);

    // Dengarkan perubahan antar tab via localStorage
    const onStorage = (e: StorageEvent) => {
      if (e.key === "smartcampus.tema" && e.newValue) {
        try {
          const t = JSON.parse(e.newValue);
          if (t && t.accent) terapkanTemaKeDom(t);
        } catch {
          // Abaikan
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [initialTheme]);

  return null;
}
