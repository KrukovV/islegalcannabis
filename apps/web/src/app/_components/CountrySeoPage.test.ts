import { describe, expect, it } from "vitest";
import { getSafeSeoCountryData, sanitizeEvidenceQuoteText } from "./CountrySeoPage";

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
});
