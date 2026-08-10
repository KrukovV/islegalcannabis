import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@islegal/shared": path.resolve(__dirname, "../../packages/shared/src")
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Route and audit-view integration tests load the complete local legal corpus.
    // Keep their assertions strict while avoiding Vitest's unsuitable 5s unit-test default.
    testTimeout: 30_000,
    hookTimeout: 60_000
  }
});
