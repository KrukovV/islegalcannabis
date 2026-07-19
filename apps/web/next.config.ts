import type { NextConfig } from "next";
import path from "node:path";

const modernNoopPolyfill = "./src/polyfills/modern-noop.ts";
const modernNoopPolyfillPath = path.resolve(__dirname, "src/polyfills/modern-noop.ts");

// Keep both bundlers on the same explicit browser-safe no-op module.
const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  experimental: {
    externalDir: true
  },
  transpilePackages: ["@islegal/shared"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
    resolveAlias: {
      "next/dist/build/polyfills/polyfill-module": modernNoopPolyfill,
      "../build/polyfills/polyfill-module": modernNoopPolyfill
    }
  },
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "next/dist/build/polyfills/polyfill-module": modernNoopPolyfillPath,
      "../build/polyfills/polyfill-module": modernNoopPolyfillPath
    };
    return config;
  }
};

export default nextConfig;
