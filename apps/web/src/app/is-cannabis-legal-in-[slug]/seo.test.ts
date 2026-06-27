import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import WeedSeoPage from "../is-weed-legal-in-[slug]/page";
import CannabisSeoPage from "./page";

describe("SEO page", () => {
  it("uses fallback, not API call", () => {
    const filePath = path.resolve(
      process.cwd(),
      "src/app/is-cannabis-legal-in-[slug]/page.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).not.toMatch(/fetch\s*\(/);
    expect(content).not.toContain("/api/paraphrase");
  });

  it("weed page stays static without fetch", () => {
    const filePath = path.resolve(
      process.cwd(),
      "src/app/is-weed-legal-in-[slug]/page.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).not.toMatch(/fetch\s*\(/);
    expect(content).not.toContain("/api/paraphrase");
  });

  it("renders Washington with jurisdiction-specific cannabis profile text instead of generic US copy", () => {
    const weedHtml = renderToStaticMarkup(
      createElement(WeedSeoPage, {
        params: { slug: "us-washington" }
      })
    );
    const cannabisHtml = renderToStaticMarkup(
      createElement(CannabisSeoPage, {
        params: { slug: "us-washington" }
      })
    );

    for (const html of [weedHtml, cannabisHtml]) {
      expect(html).toContain("Grower and processor licenses can be held simultaneously");
      expect(html).not.toContain("As a Schedule I drug under the federal Controlled Substances Act");
    }
  });
});
