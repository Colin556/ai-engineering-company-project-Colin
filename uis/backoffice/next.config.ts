import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/backoffice/:path*",
        destination: "/:path*",
      },
    ];
  },
};

export default nextConfig;
