import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import ThemeScript from "@/components/ThemeScript";
import { ToastProvider } from "@/components/Toast";
import { temaKeCss } from "@/lib/tema";
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
  title: { default: "Semesta Smart Campus", template: "%s · Smart Campus" },
  description: "One Identity. One Wallet. One Platform. — Semesta Bilingual Boarding School",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tema = await ambilTemaServer();
  const temaCss = temaKeCss(tema);

  return (
    <html lang="id" className={`${plexSans.variable} ${plexMono.variable}`}>
      <head>
        <style id="smartcampus-tema-css" dangerouslySetInnerHTML={{ __html: temaCss }} />
      </head>
      <body>
        <ThemeScript initialTheme={tema} />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
