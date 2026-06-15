import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AIBar from "./AIBar";

describe("AIBar", () => {
  it("renders the dock input with stable form attributes", () => {
    const html = renderToStaticMarkup(
      createElement(AIBar, {
        activeGeo: null,
        geoStatus: { status: "unknown" },
        ipStatus: { status: "idle", message: null },
        onGpsClick: () => {}
      })
    );

    expect(html).toContain('data-testid="new-map-ai-input"');
    expect(html).toContain('id="new-map-ai-input"');
    expect(html).toContain('name="query"');
  });
});
