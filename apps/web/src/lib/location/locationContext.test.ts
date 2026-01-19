import { describe, expect, it } from "vitest";
import {
  fromDetected,
  fromManual,
  fromQuery,
  pickLocation,
  pickPreferredContext,
  resolveLocation,
  resolveUserLocation
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

  it("pickLocation prefers manual over gps and ip", () => {
    const manual = fromManual("DE");
    const gps = fromDetected({
      country: "NL",
      method: "gps",
      confidence: "high"
    });
    const ip = fromDetected({
      country: "DE",
      method: "ip",
      confidence: "low"
    });
    const result = pickLocation({ manual, gps, ip });
    expect(result.method).toBe("manual");
    expect(result.loc?.mode).toBe("manual");
  });

  it("pickLocation prefers gps over ip when manual missing", () => {
    const gps = fromDetected({
      country: "NL",
      method: "gps",
      confidence: "high"
    });
    const ip = fromDetected({
      country: "DE",
      method: "ip",
      confidence: "low"
    });
    const result = pickLocation({ gps, ip });
    expect(result.method).toBe("gps");
    expect(result.loc?.method).toBe("gps");
  });

  it("pickLocation falls back to ip only", () => {
    const ip = fromDetected({
      country: "DE",
      method: "ip",
      confidence: "low"
    });
    const result = pickLocation({ ip });
    expect(result.method).toBe("ip");
    expect(result.loc?.method).toBe("ip");
  });

  it("manual is not overwritten by auto updates", () => {
    const manual = fromManual("DE");
    const gps = fromDetected({
      country: "NL",
      method: "gps",
      confidence: "high"
    });
    const ip = fromDetected({
      country: "DE",
      method: "ip",
      confidence: "low"
    });
    const result = pickLocation({ manual, gps, ip });
    expect(result.loc?.mode).toBe("manual");
    expect(result.method).toBe("manual");
  });

  it("resolveUserLocation prefers manual over gps and ip", () => {
    const manual = fromManual("DE", "BE");
    const gps = fromDetected({
      country: "NL",
      method: "gps",
      confidence: "high"
    });
    const ip = fromDetected({
      country: "DE",
      method: "ip",
      confidence: "low"
    });
    const result = resolveUserLocation({ manual, gps, ip });
    expect(result.method).toBe("manual");
    expect(result.iso).toBe("DE");
    expect(result.adm1).toBe("BE");
  });

  it("resolveUserLocation prefers gps when manual is missing", () => {
    const gps = fromDetected({
      country: "NL",
      method: "gps",
      confidence: "high"
    });
    const ip = fromDetected({
      country: "DE",
      method: "ip",
      confidence: "low"
    });
    const result = resolveUserLocation({ gps, ip });
    expect(result.method).toBe("gps");
    expect(result.iso).toBe("NL");
  });

  it("resolveUserLocation falls back to ip when only ip is present", () => {
    const ip = fromDetected({
      country: "DE",
      method: "ip",
      confidence: "low"
    });
    const result = resolveUserLocation({ ip });
    expect(result.method).toBe("ip");
    expect(result.iso).toBe("DE");
  });

  it("resolveUserLocation ignores invalid manual and uses gps", () => {
    const manual = fromManual("");
    const gps = fromDetected({
      country: "NL",
      method: "gps",
      confidence: "high"
    });
    const result = resolveUserLocation({ manual, gps });
    expect(result.method).toBe("gps");
    expect(result.iso).toBe("NL");
  });

  it("resolveLocation prefers manual when all are valid", () => {
    const result = resolveLocation({
      manual: { lat: 1, lng: 1, valid: true },
      gps: { lat: 2, lng: 2, valid: true },
      ip: { lat: 3, lng: 3, valid: true }
    });
    expect(result.method).toBe("manual");
  });

  it("resolveLocation prefers gps when manual missing", () => {
    const result = resolveLocation({
      gps: { lat: 2, lng: 2, valid: true },
      ip: { lat: 3, lng: 3, valid: true }
    });
    expect(result.method).toBe("gps");
  });

  it("resolveLocation falls back to ip only", () => {
    const result = resolveLocation({
      ip: { lat: 3, lng: 3, valid: true }
    });
    expect(result.method).toBe("ip");
  });
});
