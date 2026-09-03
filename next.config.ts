import type { NextConfig } from "next";

// Vercel menyetel VERCEL=1 saat build.
const diVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  // VPS sekolah (target produksi, PRD §10): build mandiri di .next/standalone
  // berisi server.js + node_modules minimum, dijalankan `node server.js`.
  //
  // Di Vercel opsi ini HARUS mati: Vercel melakukan file-tracing & packaging
  // sendiri di tahap onBuildComplete dan mencari .next/next-server.js.nft.json,
  // yang tidak dihasilkan saat mode standalone aktif — build gagal ENOENT.
  ...(diVercel ? {} : { output: "standalone" as const }),
};

export default nextConfig;
