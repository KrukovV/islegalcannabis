import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CountrySeoPage, { getSafeSeoCountryData, sanitizeEvidenceQuoteText } from "./CountrySeoPage";
import { getCountryPageData, listCountryPageCodes } from "@/lib/countryPageStorage";
import { getTruthMapCountryPageProjection } from "@/truth-map/truthMapCountryPage";
import { parseTruthMapLegalEvidenceCitations } from "@/truth-map/TruthMapLegalEvidence";

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeHtmlText(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("CountrySeoPage quote sanitizer", () => {
  it("does not configure audit-only Social or Store layers on SEO pages", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src", "app", "_components", "CountrySeoPage.tsx"), "utf8");
    const clientEntry = fs.readFileSync(path.join(process.cwd(), "src", "app", "new-map", "NewMapClientEntry.tsx"), "utf8");
    expect(page).not.toContain("socialConfig");
    expect(clientEntry).not.toContain("PublicSocialMapConfig");
    expect(clientEntry).not.toContain("socialConfig");
  });

  it("strips wiki table style preamble from evidence quotes", () => {
    const sanitized = sanitizeEvidenceQuoteText(
      'style="background:#C4C9CD;" | {{Hs|5}} Cannabis is strictly illegal in Wyoming.'
    );
    expect(sanitized).toBe("Cannabis is strictly illegal in Wyoming.");
  });

  it("removes html/style tags and wiki wrappers but keeps readable text", () => {
    const sanitized = sanitizeEvidenceQuoteText(
      '<style>.x{color:red}</style><span>[[Cannabis|Cannabis]] itself is not allowed for medical purposes.</span>'
    );
    expect(sanitized).toBe("Cannabis itself is not allowed for medical purposes.");
  });

  it("drops wiki appendix garbage and image-caption residue from visible text", () => {
    const sanitized = sanitizeEvidenceQuoteText(
      ", Morocco|267x267px]] Cannabis in Morocco has been illegal since 1956. Further reading. * https://example.com Category:Politics of Morocco"
    );
    expect(sanitized).toBe("Cannabis in Morocco has been illegal since 1956.");
  });

  it("preserves visible ellipsis instead of collapsing it to a single period", () => {
    const sanitized = sanitizeEvidenceQuoteText("A long quoted excerpt ends here...");
    expect(sanitized).toBe("A long quoted excerpt ends here...");
  });

  it("sanitizes notes before passing seo country data to the client entry", () => {
    const safe = getSafeSeoCountryData({
      code: "us-wy",
      geo_code: "US-WY",
      iso2: "US",
      name: "Wyoming",
      node_type: "state",
      normalized_version: "v1",
      legal_model: {
        recreational: { status: "ILLEGAL", enforcement: "STRICT", scope: "NONE" },
        medical: { status: "ILLEGAL", enforcement: "STRICT", scope: "NONE" },
        distribution: {
          status: "illegal",
          scopes: { possession: null, use: null, sale: null, cultivation: null, import: null, trafficking: null },
          enforcement: "strict",
          flags: [],
          modifiers: []
        }
      },
      notes_normalized: 'style="background:#C4C9CD;" | Cannabis is strictly illegal in Wyoming.',
      notes_raw: 'style="background:#C4C9CD;" | {{Hs|5}} Cannabis is strictly illegal in Wyoming.',
      facts: { possession_limit: null, cultivation: null, penalty: null },
      parent_country: { code: "usa", name: "United States" },
      state_modifiers: null,
      related_codes: [],
      related_names: [],
      graph: {
        region: "NA",
        seo_cluster: "usa",
        geo_neighbors: [],
        legal_similarity: [],
        cluster_links: [],
        same_country_states: [],
        federal_parent: { code: "usa", name: "United States" }
      },
      coordinates: null,
      sources: { legal: null, wiki: null, wiki_truth: null, citations: [] },
      hashes: { code: "us-wy", content_hash: "1", notes_hash: "2", model_hash: "3" },
      updated_at: "2026-04-30T00:00:00.000Z"
    });
    expect(safe.notes_raw).toBe("Cannabis is strictly illegal in Wyoming.");
    expect(safe.notes_normalized).toBe("Cannabis is strictly illegal in Wyoming.");
  });

  it("renders every /c/[code] current legal surface from the final-reconciliation projection", () => {
    const failures: string[] = [];

    for (const code of listCountryPageCodes()) {
      const data = getCountryPageData(code);
      expect(data, `country page ${code}`).toBeTruthy();
      if (!data) continue;
      const projection = getTruthMapCountryPageProjection(data);
      expect(projection, `Truth Map projection for ${code}`).toBeTruthy();
      if (!projection) continue;
      const html = normalizeHtmlText(renderToStaticMarkup(CountrySeoPage({
        data,
        locale: "en",
        query: null,
        truthMapProjection: projection
      })));
      const legacyCurrentModel = `${data.legal_model.recreational.status} · ${data.legal_model.recreational.enforcement} · ${data.legal_model.recreational.scope}`;

      if (!html.includes(`Current legal conclusion: ${projection.properties.legalTruthColor}`)) {
        failures.push(`${code}:missing-current-colour`);
      } else if (!html.includes(projection.properties.legalEvidenceSummary)) {
        failures.push(`${code}:missing-current-summary`);
      } else if (!html.includes(`Rule: ${projection.properties.truthRuleId}`)) {
        failures.push(`${code}:missing-reconciliation-rule`);
      } else if (html.includes(legacyCurrentModel)) {
        failures.push(`${code}:legacy-current-model-visible`);
      } else if (projection.card.sources.length > 0 && !html.includes("Retained supplementary source register")) {
        failures.push(`${code}:missing-expanded-source-register`);
      }

      for (const citation of parseTruthMapLegalEvidenceCitations(projection.properties.legalEvidenceCitationsJson)) {
        if (!html.includes(citation.title) || !html.includes(citation.annotation)) {
          failures.push(`${code}:missing-official-citation`);
          break;
        }
      }
      for (const source of projection.card.sources) {
        if (!html.includes(source.title)) {
          failures.push(`${code}:missing-retained-source-register-item`);
          break;
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
