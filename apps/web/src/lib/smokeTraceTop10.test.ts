import { describe, expect, it } from "vitest";

describe("smoke trace top10 formatter", () => {
  it("limits trace line length", async () => {
    const mod = await import("../../../../tools/smoke/format_trace_top10.mjs");
    const checks = Array.from({ length: 50 }, (_, i) => ({
      id: `ID-${i + 1}`
    }));
    const line = mod.formatTraceTop10({ total: 50, checks }, 140);
    expect(line.startsWith("Trace top10:")).toBe(true);
    expect(line.length).toBeLessThanOrEqual(140);
  });
});
