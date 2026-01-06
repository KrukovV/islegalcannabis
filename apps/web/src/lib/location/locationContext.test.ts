import { describe, expect, it } from "vitest";
import {
  fromDetected,
  fromManual,
  fromQuery,
  pickPreferredContext
} from "./locationContext";

describe("locationContext", () => {
  it("fromQuery returns query mode without method/confidence", () => {
    const ctx = fromQuery({ country: "DE" });
    expect(ctx.mode).toBe("query");
    expect(ctx.source).toBe("url");
    expect(ctx.method).toBeUndefined();
    expect(ctx.confidence).toBeUndefined();
  });

  it("fromManual returns manual high confidence", () => {
    const ctx = fromManual("DE");
    expect(ctx.mode).toBe("manual");
    expect(ctx.method).toBe("manual");
    expect(ctx.confidence).toBe("high");
    expect(ctx.source).toBe("user");
  });

  it("manual overrides detected/ip", () => {
    const manual = fromManual("DE");
    const ip = fromDetected({
      country: "DE",
      method: "ip",
      confidence: "low"
    });
    const gps = fromDetected({
      country: "NL",
      method: "gps",
      confidence: "high"
    });
    const preferred = pickPreferredContext([ip, gps, manual]);
    expect(preferred?.mode).toBe("manual");
    expect(preferred?.country).toBe("DE");
  });
});
