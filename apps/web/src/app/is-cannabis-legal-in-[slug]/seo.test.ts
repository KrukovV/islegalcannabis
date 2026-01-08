import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

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
});
