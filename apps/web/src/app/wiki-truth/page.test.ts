import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import WikiTruthPage from "./page";

describe("/wiki-truth", () => {
  it("renders a clean audit header with separated universes", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPage));
    expect(html).toContain("Wiki Truth Audit");
    expect(html).toContain("Wiki country coverage");
    expect(html).toContain("ISO country audit");
    expect(html).toContain("SSOT reference coverage");
    expect(html).toContain("US states coverage");
    expect(html).toContain("Official registry");
    expect(html).toContain("Official geo coverage");
    expect(html).toContain('data-testid="wiki-truth-summary"');
  });

  it("keeps parser leftovers out of the main audit table", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPage));
    const mainTable = html.match(/data-testid="wiki-truth-table"[\s\S]*?<\/table>/)?.[0] || "";
    expect(mainTable).not.toContain("Country/Territory");
    expect(html).toContain('data-testid="wiki-truth-diagnostics"');
  });

  it("renders the full truth table with the complete SSOT column schema", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPage));
    const mainTable = html.match(/data-testid="wiki-truth-table"[\s\S]*?<\/table>/)?.[0] || "";
    expect(mainTable).toContain(">Country<");
    expect(mainTable).toContain(">Rec (Wiki)<");
    expect(mainTable).toContain(">Med (Wiki)<");
    expect(mainTable).toContain(">Rec (Final)<");
    expect(mainTable).toContain(">Med (Final)<");
    expect(mainTable).toContain(">Map category<");
    expect(mainTable).toContain(">Rule basis<");
    expect(mainTable).toContain(">Override reason<");
    expect(mainTable).toContain(">Rule ID<");
    expect(mainTable).toContain(">Approved override<");
    expect(mainTable).toContain(">Official<");
    expect(mainTable).toContain(">Official link<");
    expect(mainTable).toContain(">Evidence delta<");
    expect(mainTable).toContain(">Evidence source<");
    expect(mainTable).toContain(">Trigger phrase<");
    expect(mainTable).toContain(">Wiki notes<");
    expect(mainTable).toContain(">Normalized notes<");
    expect(mainTable).toContain(">Notes explainability<");
    expect(mainTable).toContain(">NotesLen<");
    expect(mainTable).toContain(">NotesQuality<");
    expect(mainTable).toContain(">MismatchFlags<");
  });

  it("shows alias diagnostics as a separate diagnostics block", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPage));
    expect(html).toContain("Alias diagnostics");
    expect(html).toContain("Missing wiki rows");
    expect(html).toContain("Diagnostics");
    expect(html).toContain("ISO country audit");
  });

  it("shows recent ssot changes as a separate audit block", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPage));
    expect(html).toContain("Recent SSOT changes");
    expect(html).toContain('data-testid="wiki-truth-recent-changes"');
  });

  it("does not present official geo coverage as registry size", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPage));
    expect(html).toContain("Protected SSOT official domains/links registry");
    expect(html).toContain("Valid wiki country rows with at least one effective owner-matched official link");
    expect(html).not.toContain(">Official coverage<");
  });

  it("renders audit mismatches separately from the full truth table", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPage));
    expect(html).toContain("All countries truth table");
    expect(html).toContain("Audit mismatches");
    expect(
      html.includes('data-testid="wiki-truth-audit-table"') || html.includes('data-testid="wiki-truth-audit-empty"')
    ).toBe(true);
  });

  it("renders the official ownership explainability view", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPage));
    expect(html).toContain("Official ownership summary");
    expect(html).toContain("Official ownership table");
    expect(html).toContain("Ownership quality");
    expect(html).toContain("Ownership basis");
    expect(html).toContain("Source scope");
    expect(html).toContain('data-testid="official-ownership-raw-table"');
    expect(html).toContain('data-testid="official-ownership-geo-summary"');
  });
});
