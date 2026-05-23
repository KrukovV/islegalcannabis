import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "islegal.info"
          }
        ],
        destination: "https://www.islegal.info/:path*",
        permanent: true
      }
    ];
  },
  transpilePackages: ["@islegal/shared"],
  turbopack: {
    root: path.resolve(__dirname, "../..")
  }
};

export default nextConfig;
