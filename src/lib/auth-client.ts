"use client";

/**
 * Klien Better Auth untuk komponen browser.
 *
 * baseURL sengaja tidak diisi: klien memakai origin halaman yang sedang
 * dibuka, jadi berkas ini tidak perlu diubah saat pindah dari Vercel ke
 * VPS sekolah atau saat dijalankan lokal.
 */
import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
