import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execFileSync: vi.fn(() => "") }));

vi.mock("node:child_process", () => ({ execFileSync: mocks.execFileSync }));

afterEach(() => {
  mocks.execFileSync.mockClear();
  vi.resetModules();
});

describe("build stamp", () => {
  it("reuses the short-lived development dirty-SHA probe", async () => {
    const { getBuildStamp } = await import("@/lib/buildStamp");

    expect(getBuildStamp().buildSha).toBeTruthy();
    expect(getBuildStamp().buildSha).toBeTruthy();
    expect(mocks.execFileSync).toHaveBeenCalledTimes(1);
  });
});
