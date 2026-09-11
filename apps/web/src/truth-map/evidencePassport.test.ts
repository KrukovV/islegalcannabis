import { describe, expect, it } from "vitest";
import { getStaticTruthMapAsset } from "./staticTruthMap";
import { parseTruthMapLegalEvidenceCitations } from "./TruthMapLegalEvidence";
import {
  buildEvidencePassportMetadataIntegrityIndex,
  buildEvidencePassportCollection,
  getEvidencePassport,
  renderEvidencePassportEmbedHtml,
  renderEvidencePassportPrintHtml
} from "./evidencePassport";
import type {
  TruthMapCanonicalProjectionRecord,
  TruthMapCanonicalProjectionSource,
  TruthMapFeatureProperties
} from "./truthMapSource";

type StaticFeature = { properties?: TruthMapFeatureProperties };

function canonicalSource(overrides: Partial<TruthMapCanonicalProjectionSource>): TruthMapCanonicalProjectionSource {
  return {
    title: "Official source",
    url: "https://example.gov/source",
    publisher: "Official publisher",
    role: "PRIMARY",
    verification: "MANUAL_VISUAL_SCREENSHOT_REVIEW",
    visualReview: "Visual review recorded.",
    sourceType: "CURRENT_PRIMARY_LAW",
    currentness: "true",
    effectiveState: "true",
    cannabisSpecific: true,
    directFragmentAvailable: true,
    fragment: "A current official fragment that is deliberately long enough to be fingerprinted as source-specific legal evidence.",
    note: "",
    annotation: "Current official source annotation that is deliberately long enough to identify the scope of this jurisdiction-specific evidence.",
    sourceOwnerGeo: "AA",
    appliesToGeos: ["AA"],
    revalidation: {
      checkedAt: null,
      finalUrl: null,
      httpStatus: null,
      state: "NOT_RECORDED",
      accessState: "NOT_RECORDED",
      changeReason: "NOT_RECORDED"
    },
    ...overrides
  };
}

function staticPropertiesByGeo() {
  const records = new Map<string, TruthMapFeatureProperties>();
  for (const layer of ["countries", "us-states"] as const) {
    const collection = JSON.parse(getStaticTruthMapAsset(layer).json) as { features: StaticFeature[] };
    for (const feature of collection.features) {
      const properties = feature.properties;
      if (properties?.geo) records.set(properties.geo, properties);
    }
  }
  return records;
}

describe("Evidence Passport", () => {
  it("keeps every current conclusion and selected citation in exact 307-GEO parity with the public map projection", () => {
    const { passports, version } = buildEvidencePassportCollection("http://127.0.0.1:3000");
    const properties = staticPropertiesByGeo();
    expect(passports).toHaveLength(307);
    expect(properties.size).toBe(307);
    expect(version.finalSnapshotId).toBe("FINAL_307_RECONCILIATION");

    for (const passport of passports) {
      const mapFeature = properties.get(passport.geo);
      expect(mapFeature, passport.geo).toBeTruthy();
      expect(passport.currentConclusion.legalTruthColor).toBe(mapFeature?.legalTruthColor);
      expect(passport.currentConclusion.label).toBe(mapFeature?.legalEvidenceLabel);
      expect(passport.currentConclusion.summary).toBe(mapFeature?.legalEvidenceSummary);
      expect(passport.scope.ruleId).toBe(mapFeature?.truthRuleId);
      expect(passport.scope.rationale).toBe(mapFeature?.truthReason);
      expect(passport.scope.publicationGate.state).toBe(mapFeature?.applyState);
      expect(passport.scope.publicationGate.meaning).toContain("not a finding that the law itself is inapplicable");
      const selectedCitations = passport.citations
        .filter((citation) => citation.relation === "MAP_POPUP_SEO_EXACT")
        .map((citation) => ({
          title: citation.title,
          url: citation.url,
          publisher: citation.publisher,
          annotation: citation.annotation,
          quote: citation.quote
        }));
      expect(selectedCitations).toEqual(parseTruthMapLegalEvidenceCitations(mapFeature?.legalEvidenceCitationsJson));
      expect(passport.citations.every((citation) => citation.metadataIntegrity === "CANONICAL_METADATA_RETAINED"), passport.geo).toBe(true);
      expect(passport.sourceFreshness.metadataIntegrityReviewCount).toBe(0);
      expect(passport.boundaries).toEqual({
        currentLegalConclusionFree: true,
        primaryOfficialLinksFree: true,
        paidPlacementAllowed: false,
        storeTruthMutationAllowed: false,
        legalTruthMutationAllowed: false
      });
    }
  });

  it("quarantines a reused quote and annotation only when distinct official URLs and jurisdictions collide", () => {
    const duplicated = canonicalSource({
      fragment: "A current official fragment deliberately reused across different jurisdictions and distinct government URLs for the regression test.",
      annotation: "A deliberately reused jurisdiction-specific annotation whose collision must be detected rather than trusted without source repair."
    });
    const records: TruthMapCanonicalProjectionRecord[] = [
      { geo: "AA", territory: "Alpha", sourceCoverage: "VISUALLY_VERIFIED", sources: [duplicated] },
      {
        geo: "BB",
        territory: "Beta",
        sourceCoverage: "VISUALLY_VERIFIED",
        sources: [canonicalSource({ ...duplicated, url: "https://other.example.gov/source", sourceOwnerGeo: "BB", appliesToGeos: ["BB"] })]
      }
    ];
    const integrity = buildEvidencePassportMetadataIntegrityIndex(records);
    expect(integrity.get(`AA\u0000${duplicated.url}`)).toBe("METADATA_COLLISION_REQUIRES_REVIEW");
    expect(integrity.get("BB\u0000https://other.example.gov/source")).toBe("METADATA_COLLISION_REQUIRES_REVIEW");
  });

  it("uses a current canonical baseline without inventing legal-change history", () => {
    const passport = getEvidencePassport("MN", "http://127.0.0.1:3000");
    expect(passport).toBeTruthy();
    expect(passport?.history.status).toBe("BASELINE_ONLY_NO_PRIOR_CANONICAL_COMPARISON");
    expect(passport?.history.entries).toHaveLength(1);
    expect(passport?.history.entries[0].at).toBe("NOT_RECORDED");
    expect(passport?.history.entries[0].legalTruthColor).toBe(passport?.currentConclusion.legalTruthColor);
    expect(passport?.delivery.jsonExport).toMatch(/^http:\/\/127\.0\.0\.1:3000\/api\/truth-map\/b2b\/evidence-passport\/mn$/);
    expect(passport?.delivery.printDocument).toMatch(/\/api\/truth-map\/b2b\/print\/mn$/);
    expect(passport?.integrity.canonicalProjectionVersion).toBe(passport?.version.id);
    expect(passport?.integrity.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(passport?.sourceFreshness.classifiedReviewEventCount).toBeGreaterThanOrEqual(passport?.sourceFreshness.pendingReviewSourceCount || 0);
    expect(passport?.sourceFreshness.canonicalConclusionPublishedAt).toBeNull();
  });

  it("retains the review-open date from append-only history after the current C1 signal clears", () => {
    const passport = getEvidencePassport("NR", "http://127.0.0.1:3000");
    expect(passport).toBeTruthy();
    expect(passport?.sourceFreshness.classifiedReviewEventCount).toBe(0);
    expect(passport?.sourceFreshness.openReviewOperationCount).toBeGreaterThan(0);
    expect(passport?.sourceFreshness.latestReviewOpenedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("renders a script-free embed card from the same current Passport", () => {
    const passport = getEvidencePassport("US-CA", "http://127.0.0.1:3000");
    expect(passport).toBeTruthy();
    const html = renderEvidencePassportEmbedHtml(passport!);
    expect(html).toContain('data-islegal-evidence-passport="US-CA"');
    expect(html).toContain(passport!.currentConclusion.legalTruthColor);
    expect(html).toContain("Current legal conclusion and primary official links remain free");
    expect(html).not.toContain("<script");
  });

  it("renders complete deterministic print/PDF HTML with provenance and honest missing freshness dates", () => {
    const passport = getEvidencePassport("MN", "http://127.0.0.1:3000");
    expect(passport).toBeTruthy();
    const html = renderEvidencePassportPrintHtml(passport!);
    expect(html).toContain('data-islegal-print-passport="MN"');
    expect(html).toContain("Source Freshness Passport");
    expect(html).toContain("Publication / reconciliation gate");
    expect(html).not.toContain("<dt>Applicability</dt>");
    expect(html).toContain("NOT_RECORDED");
    expect(html).toContain(passport!.integrity.payloadSha256);
    expect(html).not.toContain("<script");
  });
});
