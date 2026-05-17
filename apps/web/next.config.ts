import type { NextConfig } from "next";
import path from "node:path";

const DEPLOY_TRACE_EXCLUDES = [
  "../../Artifacts/**/*",
  "../../Reports/**/*",
  "../../QA/**/*",
  "../../tmp/**/*",
  "../../.checkpoints/**/*",
  "../../QUARANTINE/**/*",
  "../../data/source_snapshots/**/*",
  "../../data/legal_raw/**/*",
  "../../data/baselines/ssot_prev_snapshot.json",
  "./Artifacts/**/*",
  "./Reports/**/*",
  "./QA/**/*",
  "./test-results/**/*",
  "./playwright-report/**/*"
];

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true
  },
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  outputFileTracingExcludes: {
    "/*": DEPLOY_TRACE_EXCLUDES
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
