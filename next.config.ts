import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // VPS sekolah: hasil build mandiri + node_modules minimum. Di Vercel opsi ini
  // diabaikan tanpa efek samping, jadi aman untuk keduanya.
  output: "standalone",
};

export default nextConfig;
