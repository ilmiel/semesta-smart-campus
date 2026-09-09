import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { IdentitasProvider } from "@/components/IdentitasProvider";
import ThemeScript from "@/components/ThemeScript";
import { ToastProvider } from "@/components/Toast";
import { temaKeCss } from "@/lib/tema";
import { ambilIdentitasServer } from "@/server/identitas";
import { ambilTemaServer } from "@/server/tema";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Smart Campus", template: "%s · Smart Campus" },
  description: "One Identity. One Wallet. One Platform. — Sistem Informasi Terpadu Kampus & Sekolah",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [tema, identitas] = await Promise.all([
    ambilTemaServer(),
    ambilIdentitasServer(),
  ]);
  const temaCss = temaKeCss(tema);

  return (
    <html lang="id" suppressHydrationWarning className={`${plexSans.variable} ${plexMono.variable}`}>
      <head>
        <script
          id="smartcampus-mode-script"
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  try {
    var mode = localStorage.getItem("smartcampus_mode") || "light";
    if (mode === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      document.documentElement.classList.remove("dark");
    }
  } catch (e) {}
})();
            `,
          }}
        />
        <style id="smartcampus-tema-css" dangerouslySetInnerHTML={{ __html: temaCss }} />
        {identitas.logo_portrait ? (
          <link rel="icon" href={identitas.logo_portrait} />
        ) : null}
      </head>
      <body>
        <IdentitasProvider initialIdentitas={identitas}>
          <ThemeScript initialTheme={tema} />
          <ToastProvider>{children}</ToastProvider>
        </IdentitasProvider>
      </body>
    </html>
  );
}
