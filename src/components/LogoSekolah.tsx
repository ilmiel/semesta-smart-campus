"use client";

import { useIdentitas } from "./IdentitasProvider";

interface LogoSekolahProps {
  tipe?: "portrait" | "landscape" | "auto";
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

/**
 * Komponen cerdas untuk merender logo sekolah portrait, landscape, atau fallback inisial.
 */
export default function LogoSekolah({
  tipe = "portrait",
  size,
  className,
  style,
  alt,
}: LogoSekolahProps) {
  const { identitas } = useIdentitas();
  const defaultAlt = alt || identitas.nama || "Logo Sekolah";

  // 1. Jika meminta landscape dan gambar landscape tersedia
  if (tipe === "landscape" && identitas.logo_landscape) {
    return (
      <img
        src={identitas.logo_landscape}
        alt={defaultAlt}
        className={className}
        style={{
          maxHeight: size || 40,
          maxWidth: "100%",
          objectFit: "contain",
          display: "block",
          ...style,
        }}
      />
    );
  }

  // 2. Jika gambar portrait tersedia (untuk tipe portrait atau auto/fallback)
  if (identitas.logo_portrait) {
    const s = size || 34;
    return (
      <img
        src={identitas.logo_portrait}
        alt={defaultAlt}
        className={className}
        style={{
          width: s,
          height: s,
          borderRadius: 8,
          objectFit: "contain",
          display: "block",
          flex: "none",
          ...style,
        }}
      />
    );
  }

  // 3. Fallback: Kotak inisial huruf pertama nama sekolah / brand
  const inisial = (identitas.nama_singkat || identitas.nama || "S").trim().charAt(0).toUpperCase();
  const s = size || 34;

  return (
    <div
      className={`logo ${className || ""}`}
      style={{
        width: s,
        height: s,
        borderRadius: Math.max(6, Math.round(s * 0.22)),
        fontSize: Math.round(s * 0.44),
        display: "grid",
        placeItems: "center",
        flex: "none",
        ...style,
      }}
    >
      {inisial}
    </div>
  );
}
