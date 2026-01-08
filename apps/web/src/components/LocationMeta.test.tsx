import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import LocationMeta from "./LocationMeta";
import type { LocationContext } from "@/lib/location/locationContext";

describe("LocationMeta", () => {
  it("renders query mode without detected labels or confidence", () => {
    const context: LocationContext = {
      mode: "query",
      country: "DE",
      source: "url"
    };
    const html = renderToStaticMarkup(
      createElement(LocationMeta, { context })
    );
    expect(html).toContain("Source: Query parameters");
    expect(html).not.toContain("Detected via");
    expect(html).not.toContain("Mode:");
    expect(html).not.toContain("Confidence:");
  });

  it("renders manual detected with medium confidence", () => {
    const context: LocationContext = {
      mode: "manual",
      country: "DE",
      method: "manual",
      confidence: "medium",
      source: "user"
    };
    const html = renderToStaticMarkup(
      createElement(LocationMeta, {
        context
      })
    );
    expect(html).toContain("Selected manually");
    expect(html).toContain("Mode: Manual");
    expect(html).toContain("Confidence: medium");
    expect(html).toContain("Location may be approximate");
  });

  it("renders IP detected with approximate hint", () => {
    const context: LocationContext = {
      mode: "detected",
      country: "DE",
      method: "ip",
      confidence: "medium",
      source: "ip"
    };
    const html = renderToStaticMarkup(
      createElement(LocationMeta, {
        context
      })
    );
    expect(html).toContain("Mode: Detected");
    expect(html).toContain("Detected via IP (approximate)");
    expect(html).toContain("Confidence: medium");
    expect(html).toContain("Location may be approximate");
  });
});
