import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CountrySeoPage, { getSafeSeoCountryData, sanitizeEvidenceQuoteText } from "./CountrySeoPage";
import { deriveCountryCardEntryFromCountryPageData } from "@/lib/countryCardEntry";
import { computeCountryHashes, getCountryPageData, listCountryPageCodes, stripCountryPageHashes } from "@/lib/countryPageStorage";
import { collectPopupComparableText } from "@/lib/popupComparableText";

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

  it("renders every popup cannabis-profile line in /c/[code] SSR for all geo pages", () => {
    const failures: string[] = [];

    for (const code of listCountryPageCodes()) {
      const data = getCountryPageData(code);
      expect(data, `country page ${code}`).toBeTruthy();
      if (!data) continue;
      const popupItems = collectPopupComparableText(deriveCountryCardEntryFromCountryPageData(data));
      if (popupItems.length === 0) continue;
      const safeData = {
        ...data,
        hashes: computeCountryHashes(stripCountryPageHashes(data))
      };
      const html = normalizeHtmlText(renderToStaticMarkup(CountrySeoPage({ data: safeData, locale: "en", query: null })));
      const missing = popupItems.filter((item) => !html.includes(item));
      if (missing.length > 0) failures.push(`${code}:${missing[0]}`);
    }

    expect(failures).toEqual([]);
  });
});
