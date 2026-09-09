/**
 * Sistem Tema Warna Global Semesta Smart Campus
 *
 * Mengatur seluruh warna aksen, tombol utama, sidebar admin, dan header portal (ortu & siswa).
 * Terhubung ke tabel `kebijakan` (kunci: 'tema_warna') sehingga perubahan oleh admin
 * berlaku secara serentak dan otomatis.
 */

export interface TemaWarna {
  id: string;
  nama: string;
  deskripsi: string;
  accent: string;      // Tombol utama, logo, border aktif, switch
  accent_ink: string;  // Teks tautan dan teks di atas warna aksen soft
  accent_soft: string; // Background badge, chip, kartu soft
  side_bg: string;     // Background sidebar & top bar portal
  side_ink: string;    // Teks terang di sidebar & top bar
  side_ink_2: string;  // Teks redup di sidebar & top bar
  side_active: string; // Item aktif di sidebar & top bar
}

export const PRESET_TEMA: TemaWarna[] = [
  {
    id: "emerald",
    nama: "Hijau Semesta",
    deskripsi: "Hijau asri dan berwibawa ciri khas pesantren modern & smart campus",
    accent: "#146c4f",
    accent_ink: "#0f553e",
    accent_soft: "#e3eee7",
    side_bg: "#10231b",
    side_ink: "#cfe0d7",
    side_ink_2: "#7e968b",
    side_active: "#1c3a2e",
  },
  {
    id: "ocean",
    nama: "Biru Samudra",
    deskripsi: "Biru profesional, cerdas, terpercaya, dan bernuansa teknologi modern",
    accent: "#0284c7",
    accent_ink: "#0369a1",
    accent_soft: "#e0f2fe",
    side_bg: "#0c1e33",
    side_ink: "#bae6fd",
    side_ink_2: "#7dd3fc",
    side_active: "#1e3a5f",
  },
  {
    id: "indigo",
    nama: "Ungu Royal",
    deskripsi: "Ungu elegan, premium, kreatif, dan inspiratif",
    accent: "#6366f1",
    accent_ink: "#4338ca",
    accent_soft: "#e0e7ff",
    side_bg: "#18182f",
    side_ink: "#c7d2fe",
    side_ink_2: "#a5b4fc",
    side_active: "#2a2b54",
  },
  {
    id: "ruby",
    nama: "Merah Marun",
    deskripsi: "Merah marun mewah, formal, tegas, dan bersemangat",
    accent: "#be123c",
    accent_ink: "#9f1239",
    accent_soft: "#ffe4e6",
    side_bg: "#240a12",
    side_ink: "#fecdd3",
    side_ink_2: "#fda4af",
    side_active: "#441220",
  },
  {
    id: "amber",
    nama: "Oranye Hangat",
    deskripsi: "Nuansa oranye keemasan yang ramah, energik, dan optimis",
    accent: "#d97706",
    accent_ink: "#92400e",
    accent_soft: "#fef3c7",
    side_bg: "#241808",
    side_ink: "#fde68a",
    side_ink_2: "#fcd34d",
    side_active: "#422c0e",
  },
  {
    id: "slate",
    nama: "Monokrom Midnight",
    deskripsi: "Abu-abu slate gelap modern, tenang, netral, dan kontemporer",
    accent: "#475569",
    accent_ink: "#1e293b",
    accent_soft: "#f1f5f9",
    side_bg: "#0f172a",
    side_ink: "#cbd5e1",
    side_ink_2: "#94a3b8",
    side_active: "#1e293b",
  },
  {
    id: "teal",
    nama: "Tosika Modern",
    deskripsi: "Hijau kebiruan (teal) yang segar, bersih, dan menenangkan",
    accent: "#0d9488",
    accent_ink: "#0f766e",
    accent_soft: "#ccfbf1",
    side_bg: "#081f1d",
    side_ink: "#99f6e4",
    side_ink_2: "#5eead4",
    side_active: "#123b37",
  },
];

export const TEMA_DEFAULT: TemaWarna = PRESET_TEMA[0];

/** Konversi hex ke HSL untuk menghasilkan palet turunan secara otomatis */
function hexKeHsl(hex: string): [number, number, number] {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslKeHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Menghasilkan tema kustom dari 1 warna utama (accent) */
export function buatTemaKustom(accentHex: string, sideBgHex?: string, nama = "Kustom Bebas"): TemaWarna {
  const [h, s] = hexKeHsl(accentHex);

  const calculatedSideBg = sideBgHex || hslKeHex(h, Math.min(s, 50), 10);
  const accentInk = hslKeHex(h, Math.min(s + 10, 100), 22);
  const accentSoft = hslKeHex(h, Math.min(s, 70), 93);
  const sideInk = hslKeHex(h, 30, 88);
  const sideInk2 = hslKeHex(h, 20, 65);
  const sideActive = hslKeHex(h, Math.min(s, 40), 18);

  return {
    id: "custom",
    nama,
    deskripsi: `Tema kustom dengan aksen utama ${accentHex}`,
    accent: accentHex,
    accent_ink: accentInk,
    accent_soft: accentSoft,
    side_bg: calculatedSideBg,
    side_ink: sideInk,
    side_ink_2: sideInk2,
    side_active: sideActive,
  };
}

/** Menghasilkan string CSS variabel untuk diinjeksi ke `<style>` */
export function temaKeCss(tema: TemaWarna): string {
  return `
:root, :root[data-theme="light"] {
  --accent: ${tema.accent} !important;
  --accent-ink: ${tema.accent_ink} !important;
  --accent-soft: ${tema.accent_soft} !important;
  --brand-soft: ${tema.accent_soft} !important;
  --side-bg: ${tema.side_bg} !important;
  --side-ink: ${tema.side_ink} !important;
  --side-ink-2: ${tema.side_ink_2} !important;
  --side-active: ${tema.side_active} !important;
  --brand-pri: ${tema.accent} !important;
}
:root[data-theme="dark"], html.dark {
  --accent: #10b981 !important;
  --accent-ink: #34d399 !important;
  --accent-soft: #132b20 !important;
  --brand-soft: #132b20 !important;
  --side-bg: ${tema.side_bg} !important;
  --side-active: ${tema.side_active} !important;
  --side-ink: ${tema.side_ink} !important;
  --side-ink-2: ${tema.side_ink_2} !important;
  --brand-pri: #10b981 !important;
}
`.trim();
}

/** Terapkan tema langsung di browser DOM secara seketika */
export function terapkanTemaKeDom(tema: TemaWarna): void {
  if (typeof document === "undefined") return;

  const id = "smartcampus-tema-css";
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = temaKeCss(tema);

  try {
    localStorage.setItem("smartcampus.tema", JSON.stringify(tema));
  } catch {
    // Ignore storage issues in private browsing
  }
}
