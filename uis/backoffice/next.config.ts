import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(process.cwd(), "../..") },
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${process.env.API_INTERNAL_URL || "http://backend:8000"}/:path*`,
      },
      {
        source: "/backoffice/:path*",
        destination: "/:path*",
      },
    ];
  },
};

export default nextConfig;
