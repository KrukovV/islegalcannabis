import { describe, expect, it } from "vitest";

describe("smoke trace formatter", () => {
  it("limits checked line length", async () => {
    const mod = await import("../../../../tools/smoke/format_checked_line.mjs");
    const checks = Array.from({ length: 50 }, (_, i) => ({
      id: `ID-${i + 1}`
    }));
    const line = mod.formatCheckedLine({ total: 50, checks }, 140);
    expect(line.startsWith("Checked: 50")).toBe(true);
    expect(line.length).toBeLessThanOrEqual(140);
  });
});
