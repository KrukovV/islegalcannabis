import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import StatusPanel from "./StatusPanel";

describe("StatusPanel", () => {
  it("renders linked critical, info, and why blocks", () => {
    const html = renderToStaticMarkup(
      createElement(StatusPanel, {
        statusLevel: "yellow",
        statusTitle: "Restricted",
        panel: {
          humanStatus: "Restricted or partly allowed",
          summary: "Medical access exists, but broader use stays restricted.",
          countryPageHref: "/c/us-ca",
          critical: [
            {
              id: "distribution",
              text: "Sale and distribution remain restricted.",
              href: "/c/us-ca#law-distribution",
              sourceUrl: "https://cannabis.ca.gov"
            }
          ],
          info: [
            {
              id: "medical",
              text: "Medical use is permitted.",
              href: "/c/us-ca#law-medical",
              sourceUrl: "https://cannabis.ca.gov"
            }
          ],
          why: [
            {
              id: "why",
              text: "This status combines restrictions with limited lawful access or weaker enforcement.",
              href: "/c/us-ca#law-summary",
              sourceUrl: "https://cannabis.ca.gov"
            }
          ],
          lastUpdateLabel: "2026-04-12"
        }
      })
    );

    expect(html).toContain("Hard restrictions");
    expect(html).toContain("More context");
    expect(html).toContain("Why this status?");
    expect(html).toContain('href="/c/us-ca#law-distribution"');
    expect(html).toContain('href="https://cannabis.ca.gov"');
    expect(html).toContain("Open country page");
  });
});
