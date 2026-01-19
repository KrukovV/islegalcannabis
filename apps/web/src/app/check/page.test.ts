import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CheckPage from "./page";
import fs from "node:fs";
import path from "node:path";

describe("/check query mode", () => {
  it("does not show detected labels or confidence", async () => {
    const element = await CheckPage({
      searchParams: Promise.resolve({ country: "DE" })
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Source: Query parameters");
    expect(html).not.toContain("Detected via");
    expect(html).not.toContain("Confidence:");
    expect(html).toContain('data-testid="verify-yourself"');
    expect(html).toContain("Verify yourself");
    expect(html).toContain("Official source");
    expect(html).toContain('data-testid="verify-links"');
    expect(html).toContain('data-testid="verify-sources"');
    expect(html).toContain('data-testid="verify-facts"');
    expect(html).toContain("medical");
    expect(html).toContain('data-testid="legal-status"');
    expect(html).toContain("Wikipedia: Legality of cannabis");
  });

  it("shows ssot change banner when diff marks country", async () => {
    const reportDir = path.join(process.cwd(), "Reports", "ssot-diff");
    const lastRunPath = path.join(reportDir, "last_run.json");
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      lastRunPath,
      JSON.stringify(
        {
          status: "changed",
          changed_count: 1,
          report_json: "Reports/ssot-diff/ssot_diff_20260109.json",
          report_md: "Reports/ssot-diff/ssot_diff_20260109.md",
          changed_ids: ["DE"]
        },
        null,
        2
      ) + "\n"
    );

    try {
      const element = await CheckPage({
        searchParams: Promise.resolve({ country: "DE" })
      });
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-testid="ssot-changed"');
      expect(html).toContain("Sources changed recently");
    } finally {
      if (fs.existsSync(lastRunPath)) fs.unlinkSync(lastRunPath);
    }
  });
});
