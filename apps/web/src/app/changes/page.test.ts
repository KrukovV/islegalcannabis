import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ChangesPage from "./page";

describe("/changes", () => {
  it("renders the ssot changes dashboard", () => {
    const html = renderToStaticMarkup(createElement(ChangesPage));
    expect(html).toContain("SSOT Changes");
    expect(html).toContain("Changes last 24 hours");
    expect(html).toContain("Changes last 7 days");
    expect(html).toContain('data-testid="ssot-changes-24h"');
    expect(html).toContain('data-testid="ssot-changes-7d"');
  });
});
