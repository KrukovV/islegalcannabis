import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execFileSync: vi.fn(() => "") }));
const originalCwd = process.cwd();

vi.mock("node:child_process", () => ({ execFileSync: mocks.execFileSync }));

afterEach(() => {
  process.chdir(originalCwd);
  mocks.execFileSync.mockClear();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("build stamp", () => {
  it("reuses the short-lived development dirty-SHA probe", async () => {
    const { getBuildStamp } = await import("@/lib/buildStamp");

    expect(getBuildStamp().buildSha).toBeTruthy();
    expect(getBuildStamp().buildSha).toBeTruthy();
    expect(mocks.execFileSync).toHaveBeenCalledTimes(1);
  });

  it("resolves HEAD through a linked-worktree gitdir and commondir", async () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-build-stamp-worktree-"));
    const gitDir = path.join(fixtureRoot, "metadata", "worktrees", "fixture");
    const commonDir = path.join(fixtureRoot, "metadata");
    fs.mkdirSync(path.join(commonDir, "refs", "heads"), { recursive: true });
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, ".git"), `gitdir: ${gitDir}\n`, "utf8");
    fs.writeFileSync(path.join(gitDir, "commondir"), "../..\n", "utf8");
    fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/fixture\n", "utf8");
    fs.writeFileSync(path.join(commonDir, "refs", "heads", "fixture"), `${"0123456789abcdef".repeat(2)}01234567\n`, "utf8");

    try {
      vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
      vi.stubEnv("GIT_COMMIT", "");
      process.chdir(fixtureRoot);
      const { getBuildStamp } = await import("@/lib/buildStamp");

      expect(getBuildStamp().buildSha).toBe("0123456");
      expect(mocks.execFileSync).toHaveBeenCalledTimes(1);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
