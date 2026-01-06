import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("check cache invariants", () => {
  it("does not include server-side nearby cache module", () => {
    const nearbyPath = path.join(
      process.cwd(),
      "src",
      "lib",
      "nearbyCache.ts"
    );
    expect(fs.existsSync(nearbyPath)).toBe(false);
  });

  it("route does not import client cache storage", () => {
    const routePath = path.join(
      process.cwd(),
      "src",
      "app",
      "api",
      "check",
      "route.ts"
    );
    const content = fs.readFileSync(routePath, "utf-8");
    expect(content.includes("nearbyCacheStorage")).toBe(false);
  });
});
