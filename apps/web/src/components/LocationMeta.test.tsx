import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import LocationMeta from "./LocationMeta";

describe("LocationMeta", () => {
  it("renders query mode without detected labels or confidence", () => {
    const html = renderToStaticMarkup(
      createElement(LocationMeta, { mode: "query" })
    );
    expect(html).toContain("Source: Query parameters");
    expect(html).not.toContain("Detected via");
    expect(html).not.toContain("Confidence:");
  });

  it("renders manual detected without approximate hint", () => {
    const html = renderToStaticMarkup(
      createElement(LocationMeta, {
        mode: "detected",
        method: "manual",
        confidence: "high"
      })
    );
    expect(html).toContain("Selected manually");
    expect(html).toContain("Confidence: high");
    expect(html).not.toContain("Location may be approximate");
  });

  it("renders IP detected with approximate hint", () => {
    const html = renderToStaticMarkup(
      createElement(LocationMeta, {
        mode: "detected",
        method: "ip",
        confidence: "medium"
      })
    );
    expect(html).toContain("Detected via IP (approximate)");
    expect(html).toContain("Confidence: medium");
    expect(html).toContain("Location may be approximate");
  });
});
