import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large payload proxy if accessed via Next.js
  experimental: {
    // any experimental flags
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8080";
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
