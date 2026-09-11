import { describe, expect, it } from "vitest";
import { buildEditorialLocalisationManifest, loadEditorialLocalisationRegistry, validateEditorialLocalisationRegistry } from "./editorialLocalisation";

const approved = {
  id: "MN-RU-CURRENT",
  geo: "MN",
  locale: "ru",
  assertionKind: "CURRENT_CONCLUSION" as const,
  sourceUrl: "https://example.gov/law",
  sourceLanguage: "mn",
  originalFragment: "Original official-language legal fragment.",
  localizedText: "Редакторский перевод правового утверждения.",
  territorialScope: "Mongolia",
  disclaimer: "Translation does not replace the official source.",
  editorReview: {
    state: "APPROVED" as const,
    reviewerId: "EDITOR-TEST",
    reviewedAt: "2026-09-11T10:00:00.000Z",
    originalCitationPreserved: true as const,
    scopePreserved: true as const,
    disclaimerPreserved: true as const
  }
};

describe("editorial legal localisation", () => {
  it("keeps the current registry empty until a fully reviewed localisation exists", () => {
    expect(loadEditorialLocalisationRegistry()).toEqual({ schemaVersion: 1, localOnly: true, records: [] });
    expect(buildEditorialLocalisationManifest()).toEqual(expect.objectContaining({ publicationGate: "EDITOR_APPROVED_OR_NOT_PUBLISHED", approvedRecords: 0 }));
  });

  it("accepts a source-preserving editorial record and rejects missing review or scope", () => {
    expect(validateEditorialLocalisationRegistry({ schemaVersion: 1, localOnly: true, records: [approved] }).records).toHaveLength(1);
    expect(() => validateEditorialLocalisationRegistry({ schemaVersion: 1, localOnly: true, records: [{ ...approved, territorialScope: "" }] }))
      .toThrow("EDITORIAL_LOCALISATION_TERRITORIAL_SCOPE_REQUIRED");
    expect(() => validateEditorialLocalisationRegistry({ schemaVersion: 1, localOnly: true, records: [{ ...approved, editorReview: { ...approved.editorReview, state: "PENDING" } }] }))
      .toThrow("EDITORIAL_LOCALISATION_REVIEW_NOT_APPROVED");
  });
});
