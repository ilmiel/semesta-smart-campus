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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
