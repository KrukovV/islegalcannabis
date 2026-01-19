import { describe, expect, it } from "vitest";

describe("smoke trace payload", () => {
  it("keeps total and check count", async () => {
    const mod = await import("../../../../tools/smoke/trace_payload.mjs");
    const checks = Array.from({ length: 50 }, (_, i) => ({
      country: "de",
      region: `${i}`
    }));
    const payload = mod.buildSmokeTracePayload({
      passed: 50,
      failed: 0,
      checks,
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    expect(payload.total).toBe(50);
    expect(payload.checks.length).toBe(50);
    expect(payload.checks[0].id).toBe("DE-0");
    expect(payload.checks[0].country).toBe("DE");
    expect(payload.checks[0].flag).toBe("🇩🇪");
    expect(payload.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
