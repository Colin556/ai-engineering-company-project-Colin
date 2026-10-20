import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: "http://backend:8000/:path*",
        //destination: `${process.env.VITE_API_INTERNAL_URL || "http://backend:8000"}/:path*`,
      },
      {
        source: "/backoffice/:path*",
        destination: "/:path*",
      },
    ];
  },
};

export default nextConfig;
