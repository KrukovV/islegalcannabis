import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ResultCard from "./ResultCard";
import type { JurisdictionLawProfile } from "@islegal/shared";
import type { ResultViewModel } from "@islegal/shared";
import type { LocationContext } from "@/lib/location/locationContext";
import { JSDOM } from "jsdom";

const profile: JurisdictionLawProfile = {
  id: "US-CA",
  country: "US",
  region: "CA",
  medical: "allowed",
  recreational: "allowed",
  possession_limit: "Up to 1 oz",
  public_use: "restricted",
  home_grow: "allowed",
  cross_border: "illegal",
  risks: ["public_use", "driving"],
  sources: [{ title: "California Cannabis Portal", url: "https://cannabis.ca.gov" }],
  updated_at: "2024-01-01",
  verified_at: "2025-01-06",
  confidence: "medium",
  status: "known"
};

const baseViewModel: ResultViewModel = {
  jurisdictionKey: "US-CA",
  title: "Test",
  statusLevel: "green",
  statusTitle: "Legal",
  bullets: ["One", "Two", "Three"],
  keyRisks: [],
  sources: [{ title: "California Cannabis Portal", url: "https://cannabis.ca.gov" }],
  updatedAt: "2024-01-01",
  extrasPreview: [
    { key: "public_use", label: "Public use", value: "restricted" },
    { key: "driving", label: "Driving", value: "illegal" },
    { key: "purchase", label: "Purchase", value: "allowed" }
  ],
  extrasFull: [
    { key: "public_use", label: "Public use", value: "restricted" },
    { key: "driving", label: "Driving", value: "illegal" },
    { key: "purchase", label: "Purchase", value: "allowed" },
    { key: "home_grow", label: "Home grow", value: "allowed" }
  ],
  location: {
    mode: "manual"
  },
  meta: {}
};

describe("ResultCard paywall", () => {
  it("hides paid sections in free mode and shows preview label", () => {
    const html = renderToStaticMarkup(
      <ResultCard
        profile={profile}
        title="Test"
        isPaidUser={false}
        viewModel={baseViewModel}
        nearby={[{ id: "DE", status: "green", summary: "Legal here" }]}
      />
    );
    expect(html).not.toContain("Key risks");
    expect(html).not.toContain("Sources");
    expect(html).not.toContain("PDF export");
    expect(html).toContain("Preview (paid)");
    expect(html).toContain("What else is legal here?");
    expect(html).toContain("Public use");
    expect(html).toContain("Driving");
    expect(html).toContain("Unlock details");
  });

  it("renders full extras list in paid mode", () => {
    const html = renderToStaticMarkup(
      <ResultCard
        profile={profile}
        title="Test"
        isPaidUser
        viewModel={baseViewModel}
      />
    );
    expect(html).toContain("What else is legal here?");
    expect(html).toContain("Home grow");
    expect(html).not.toContain("Unlock details");
  });

  it("renders IP location context with approximate hint", () => {
    const context: LocationContext = {
      mode: "detected",
      country: "US",
      region: "CA",
      method: "ip",
      confidence: "low",
      source: "ip"
    };
    const html = renderToStaticMarkup(
      <ResultCard
        profile={profile}
        title="Test"
        isPaidUser={false}
        locationContext={context}
      />
    );
    expect(html).toContain("Location: ip");
    expect(html).toContain("Location may be approximate");
  });

  it("renders manual location with approximate hint", () => {
    const context: LocationContext = {
      mode: "manual",
      country: "DE",
      method: "manual",
      confidence: "medium",
      source: "user"
    };
    const html = renderToStaticMarkup(
      <ResultCard
        profile={profile}
        title="Test"
        isPaidUser={false}
        locationContext={context}
      />
    );
    expect(html).toContain("Location: manual");
    expect(html).toContain("Location may be approximate");
  });

  it("renders location method label for manual context", () => {
    const context: LocationContext = {
      mode: "manual",
      country: "US",
      region: "CA",
      method: "manual",
      confidence: "medium",
      source: "user"
    };
    const html = renderToStaticMarkup(
      <ResultCard
        profile={profile}
        title="Test"
        isPaidUser={false}
        locationContext={context}
      />
    );
    const dom = new JSDOM(html);
    const methodLine = dom.window.document.querySelector(
      '[data-testid="location-method"]'
    );
    expect(methodLine?.textContent).toContain("Location: manual");
  });

  it("renders pages metrics with failure hint", () => {
    const html = renderToStaticMarkup(
      <ResultCard
        profile={profile}
        title="Test"
        pagesOk={7}
        pagesTotal={10}
      />
    );
    expect(html).toContain("Pages: OK 7 / Total 10 (some failed)");
    expect(html).toContain('data-testid="pages-metrics"');
  });

  it("renders pages metrics without failure hint when totals match", () => {
    const html = renderToStaticMarkup(
      <ResultCard
        profile={profile}
        title="Test"
        pagesOk={10}
        pagesTotal={10}
      />
    );
    expect(html).toContain("Pages: OK 10 / Total 10");
    expect(html).not.toContain("some failed");
  });

  it("renders offline fallback banner with sources", () => {
    const fallbackViewModel: ResultViewModel = {
      ...baseViewModel,
      meta: {
        offlineFallback: true,
        offlineFallbackNote: "Source: offline verified snapshot",
        offlineFallbackSources: [
          { title: "Offline source", url: "https://example.gov/fallback" }
        ]
      }
    };
    const html = renderToStaticMarkup(
      <ResultCard
        profile={{ ...profile, sources: [] }}
        title="Test"
        viewModel={fallbackViewModel}
      />
    );
    expect(html).toContain('data-testid="offline-fallback"');
    expect(html).toContain("Source: offline verified snapshot");
    expect(html).toContain("example.gov/fallback");
  });

  it("renders result level for green status", () => {
    const html = renderToStaticMarkup(
      <ResultCard profile={profile} title="Test" />
    );
    const dom = new JSDOM(html);
    const badge = dom.window.document.querySelector('[data-testid="result-level"]');
    expect(badge?.textContent).toContain("✅ Legal");
    expect(badge?.getAttribute("data-level")).toBe("green");
  });

  it("renders result level for yellow status", () => {
    const yellowProfile: JurisdictionLawProfile = {
      ...profile,
      recreational: "illegal",
      medical: "allowed"
    };
    const html = renderToStaticMarkup(
      <ResultCard profile={yellowProfile} title="Test" />
    );
    const dom = new JSDOM(html);
    const badge = dom.window.document.querySelector('[data-testid="result-level"]');
    expect(badge?.textContent).toContain("⚠️ Restricted");
    expect(badge?.getAttribute("data-level")).toBe("yellow");
  });

  it("renders result level for unknown status", () => {
    const unknownProfile: JurisdictionLawProfile = {
      ...profile,
      recreational: "illegal",
      medical: "illegal",
      status: "unknown"
    };
    const html = renderToStaticMarkup(
      <ResultCard profile={unknownProfile} title="Test" />
    );
    const dom = new JSDOM(html);
    const badge = dom.window.document.querySelector('[data-testid="result-level"]');
    expect(badge?.textContent).toContain("❌ Not sure");
    expect(badge?.getAttribute("data-level")).toBe("red");
  });

  it("downgrades green status when sources are missing", () => {
    const noSourcesProfile: JurisdictionLawProfile = {
      ...profile,
      sources: []
    };
    const html = renderToStaticMarkup(
      <ResultCard profile={noSourcesProfile} title="Test" />
    );
    const dom = new JSDOM(html);
    const badge = dom.window.document.querySelector('[data-testid="result-level"]');
    expect(badge?.textContent).toContain("⚠️ Needs verification");
    expect(badge?.getAttribute("data-level")).toBe("yellow");
  });

  it("renders detection method and confidence line", () => {
    const cases: Array<{ context: LocationContext; expected: string }> = [
      {
        context: {
          mode: "detected",
          country: "US",
          region: "CA",
          method: "gps",
          confidence: "high",
          source: "geolocation"
        },
        expected: "Detected via GPS · Confidence: High"
      },
      {
        context: {
          mode: "detected",
          country: "US",
          region: "CA",
          method: "ip",
          confidence: "low",
          source: "ip"
        },
        expected: "Detected via IP (approximate) · Confidence: Low"
      },
      {
        context: {
          mode: "manual",
          country: "DE",
          method: "manual",
          confidence: "medium",
          source: "user"
        },
        expected: "Selected manually · Confidence: Medium"
      }
    ];

    cases.forEach(({ context, expected }) => {
      const html = renderToStaticMarkup(
        <ResultCard profile={profile} title="Test" locationContext={context} />
      );
      const dom = new JSDOM(html);
      const methodLine = dom.window.document.querySelector(
        '[data-testid="location-method"]'
      );
      expect(methodLine?.textContent).toContain(expected);
    });
  });

  it("renders why bullets for known and unknown profiles", () => {
    const knownHtml = renderToStaticMarkup(
      <ResultCard profile={profile} title="Test" />
    );
    const knownDom = new JSDOM(knownHtml);
    const knownBullets = knownDom.window.document.querySelectorAll(
      '[data-testid="why-bullets"] li'
    );
    expect(knownBullets.length).toBeGreaterThanOrEqual(3);
    const medicalLine = knownDom.window.document.querySelector(
      '[data-testid="medical-breakdown"]'
    );
    expect(medicalLine?.textContent).toContain("Medical:");

    const unknownProfile: JurisdictionLawProfile = {
      ...profile,
      status: "unknown"
    };
    const unknownHtml = renderToStaticMarkup(
      <ResultCard profile={unknownProfile} title="Test" />
    );
    const unknownDom = new JSDOM(unknownHtml);
    const unknownBullets = unknownDom.window.document.querySelectorAll(
      '[data-testid="why-bullets"] li'
    );
    expect(unknownBullets.length).toBeGreaterThanOrEqual(1);
  });

  it("renders verify yourself links from sources", () => {
    const profileWithFacts: JurisdictionLawProfile = {
      ...profile,
      legal_ssot: {
        generated_at: "2025-01-05",
        fetched_at: "2025-01-05T10:00:00.000Z",
        snapshot_path: "data/source_snapshots/CA/2025-01-05/abc123.html",
        sources: [{ title: "Official portal", url: "https://cannabis.ca.gov" }],
        evidence: [{ field: "status_medical", kind: "html_anchor", ref: "Section" }],
        evidence_count: 1,
        official_source_ok: true,
        source_url: "https://cannabis.ca.gov"
      },
      machine_verified: {
        status_recreational: "legal",
        status_medical: "legal",
        medical_allowed: true,
        restricted_notes: null,
        confidence: "low",
        retrieved_at: "2025-01-05T10:00:00.000Z",
        official_source_ok: true,
        evidence_kind: "law",
        source_url: "https://cannabis.ca.gov",
        snapshot_path: "data/source_snapshots/CA/2025-01-05/abc123.html",
        evidence: [
          {
            type: "html_anchor",
            anchor: "Section",
            quote: "Medical cannabis is legal.",
            snapshot_path: "data/source_snapshots/CA/2025-01-05/abc123.html"
          }
        ]
      },
      facts: [
        {
          category: "medical",
          url: "https://cannabis.ca.gov",
          effective_date: "2024-01-01",
          text_snippet: null
        }
      ]
    };
    const html = renderToStaticMarkup(
      <ResultCard profile={profileWithFacts} title="Test" />
    );
    const dom = new JSDOM(html);
    const verifySection = dom.window.document.querySelector(
      '[data-testid="verify-yourself"]'
    );
    const links = dom.window.document.querySelectorAll(
      '[data-testid="verify-links"] a'
    );
    const officialLinks = dom.window.document.querySelectorAll(
      '[data-testid="verify-sources"] a'
    );
    const facts = dom.window.document.querySelectorAll(
      '[data-testid="verify-facts"] li'
    );
    const snapshot = dom.window.document.querySelector(
      '[data-testid="verify-snapshot"]'
    );
    const autoBadge = dom.window.document.querySelector(
      '[data-testid="auto-verified-badge"]'
    );
    const evidenceLinks = dom.window.document.querySelectorAll(
      '[data-testid="verify-evidence-links"] a'
    );
    expect(verifySection).not.toBeNull();
    expect(links.length).toBe(1);
    expect(links[0]?.getAttribute("href")).toBe("https://cannabis.ca.gov");
    expect(officialLinks.length).toBeGreaterThan(0);
    expect(snapshot?.textContent).toContain("Snapshot date: 2025-01-05");
    expect(facts.length).toBe(1);
    expect(autoBadge?.textContent).toContain("Machine verified");
    expect(evidenceLinks.length).toBe(1);
    expect(evidenceLinks[0]?.textContent).toContain("Snapshot 2025-01-05");
    expect(evidenceLinks[0]?.textContent).toContain("Anchor: Section");
  });

  it("renders candidate badge for needs_review profiles", () => {
    const reviewProfile: JurisdictionLawProfile = {
      ...profile,
      status: "needs_review"
    };
    const html = renderToStaticMarkup(
      <ResultCard profile={reviewProfile} title="Test" />
    );
    const dom = new JSDOM(html);
    const badge = dom.window.document.querySelector(
      '[data-testid="candidate-badge"]'
    );
    expect(badge?.textContent).toContain("Candidate");
  });

  it("hides candidate badge when machine verified is present", () => {
    const reviewProfile: JurisdictionLawProfile = {
      ...profile,
      status: "needs_review",
      machine_verified: {
        status_recreational: "legal",
        status_medical: "legal",
        medical_allowed: true,
        confidence: "low",
        official_source_ok: true,
        evidence_kind: "law",
        source_url: "https://cannabis.ca.gov",
        snapshot_path: "data/source_snapshots/CA/2025-01-05/abc123.html",
        evidence: [
          {
            type: "html_anchor",
            anchor: "Section",
            quote: "Medical cannabis is legal.",
            snapshot_path: "data/source_snapshots/CA/2025-01-05/abc123.html"
          }
        ]
      }
    };
    const html = renderToStaticMarkup(
      <ResultCard profile={reviewProfile} title="Test" />
    );
    const dom = new JSDOM(html);
    const badge = dom.window.document.querySelector(
      '[data-testid="candidate-badge"]'
    );
    expect(badge).toBeNull();
  });

  it("renders verify empty when sources are missing", () => {
    const emptyProfile: JurisdictionLawProfile = {
      ...profile,
      sources: []
    };
    const html = renderToStaticMarkup(
      <ResultCard profile={emptyProfile} title="Test" />
    );
    const dom = new JSDOM(html);
    const emptyState = dom.window.document.querySelector(
      '[data-testid="verify-empty"]'
    );
    const officialEmpty = dom.window.document.querySelector(
      '[data-testid="verify-official-empty"]'
    );
    const links = dom.window.document.querySelector(
      '[data-testid="verify-links"]'
    );
    expect(emptyState?.textContent).toContain("No verified sources yet");
    expect(emptyState?.textContent).toContain("⚠️");
    expect(links).toBeNull();
    expect(officialEmpty?.textContent).toContain("No verified official sources yet");
  });

  it("renders advanced teaser when pro is off", () => {
    const previous = process.env.FEATURES_PAID;
    process.env.FEATURES_PAID = "1";
    const html = renderToStaticMarkup(
      <ResultCard
        profile={profile}
        title="Test"
        isPro={false}
        proPreviewHref="/check?pro=1"
      />
    );
    const dom = new JSDOM(html);
    const teaser = dom.window.document.querySelector(
      '[data-testid="advanced-teaser"]'
    );
    const link = dom.window.document.querySelector(
      '[data-testid="advanced-teaser"] a'
    );
    expect(teaser?.textContent).toContain("Advanced details");
    expect(link?.getAttribute("href")).toBe("/check?pro=1");
    if (previous === undefined) {
      delete process.env.FEATURES_PAID;
    } else {
      process.env.FEATURES_PAID = previous;
    }
  });

  it("renders advanced block when pro is on", () => {
    const previous = process.env.FEATURES_PAID;
    process.env.FEATURES_PAID = "1";
    const html = renderToStaticMarkup(
      <ResultCard profile={profile} title="Test" isPro />
    );
    const dom = new JSDOM(html);
    const advanced = dom.window.document.querySelector('[data-testid="advanced"]');
    expect(advanced).not.toBeNull();
    if (previous === undefined) {
      delete process.env.FEATURES_PAID;
    } else {
      process.env.FEATURES_PAID = previous;
    }
  });

  it("hides advanced teaser when feature flag is off", () => {
    const previous = process.env.FEATURES_PAID;
    delete process.env.FEATURES_PAID;
    const html = renderToStaticMarkup(
      <ResultCard profile={profile} title="Test" isPro={false} />
    );
    const dom = new JSDOM(html);
    const teaser = dom.window.document.querySelector(
      '[data-testid="advanced-teaser"]'
    );
    expect(teaser).toBeNull();
    if (previous === undefined) {
      delete process.env.FEATURES_PAID;
    } else {
      process.env.FEATURES_PAID = previous;
    }
  });
});
