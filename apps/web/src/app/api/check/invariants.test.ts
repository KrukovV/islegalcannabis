import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("check cache invariants", () => {
  const cwd = process.cwd();
  const rootCandidate = path.join(cwd, "src", "app");
  const nestedCandidate = path.join(cwd, "apps", "web", "src", "app");
  let baseDir: string | null = null;

  if (fs.existsSync(rootCandidate)) {
    baseDir = cwd;
  } else if (fs.existsSync(nestedCandidate)) {
    baseDir = path.join(cwd, "apps", "web");
  }

  if (!baseDir) {
    throw new Error("cannot locate apps/web src root");
  }

  it("does not include server-side nearby cache module", () => {
    const nearbyPath = path.join(
      baseDir,
      "src",
      "lib",
      "nearbyCache.ts"
    );
    if (!fs.existsSync(nearbyPath)) {
      expect(fs.existsSync(nearbyPath)).toBe(false);
      return;
    }
    throw new Error("nearbyCache.ts should not exist");
  });

  it("route does not import client cache storage", () => {
    const routePath = path.join(
      baseDir,
      "src",
      "app",
      "api",
      "check",
      "route.ts"
    );
    if (!fs.existsSync(routePath)) {
      throw new Error("route.ts not found for invariants");
    }
    const content = fs.readFileSync(routePath, "utf-8");
    expect(/nearbyCacheStorage/.test(content)).toBe(false);
    expect(/locationStorage/.test(content)).toBe(false);
    expect(/localStorage/.test(content)).toBe(false);
    expect(/['"]use client['"]/.test(content)).toBe(false);
  });
});
