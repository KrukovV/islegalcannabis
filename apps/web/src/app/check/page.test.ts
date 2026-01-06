import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CheckPage from "./page";

describe("/check query mode", () => {
  it("does not show detected labels or confidence", async () => {
    const element = await CheckPage({
      searchParams: Promise.resolve({ country: "DE" })
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Source: Query parameters");
    expect(html).not.toContain("Detected via");
    expect(html).not.toContain("Confidence:");
  });
});
