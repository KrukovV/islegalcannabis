import { describe, expect, it } from "vitest";
import { buildEvidencePassportCollection } from "./evidencePassport";
import { sha256EvidencePayload } from "./evidenceHash";
import {
  appendEditorialLocalisationEvent,
  buildEditorialLocalisationManifest,
  buildEditorialLocalisationPreparation,
  createEditorialLocalisationApproval,
  createEditorialLocalisationDraft,
  createEditorialLocalisationSuperseded,
  editorialCitationIdentity,
  editorialLocalisationRegistryBytesSha256,
  editorialScopeSha256,
  loadEditorialLocalisationRegistry,
  validateEditorialLocalisationRegistry,
  type EditorialLocalisationEvent,
  type EditorialLocalisationRegistry
} from "./editorialLocalisation";

const emptyRegistry: EditorialLocalisationRegistry = {
  schemaVersion: 2,
  localOnly: true,
  appendOnly: true,
  events: []
};

function fixture() {
  const passports = buildEvidencePassportCollection().passports;
  const passport = passports.find((candidate) => candidate.geo === "MN")!;
  const citation = passport.citations.find((candidate) => candidate.quote || candidate.annotation)!;
  const originalFragment = citation.quote || citation.annotation;
  const retainedCitationIdentity = editorialCitationIdentity(passport, citation);
  const draft = createEditorialLocalisationDraft(emptyRegistry, {
    localisationId: "MN.ru.current.fixture",
    geo: "MN",
    locale: "ru",
    assertionKind: "CURRENT_CONCLUSION",
    retainedCitationIdentity,
    sourceLanguage: "mn",
    originalFragment,
    localizedText: "Редакторский перевод правового утверждения.",
    territorialScope: "Mongolia",
    disclaimer: "Translation does not replace the official source.",
    createdBy: "AUTHOR-TEST",
    createdAt: "2026-09-12T01:00:00.000Z"
  }, passports);
  return { passports, passport, draft, retainedCitationIdentity };
}

function append(registry: EditorialLocalisationRegistry, event: EditorialLocalisationEvent, passports = fixture().passports) {
  const registryBytes = `${JSON.stringify(registry, null, 2)}\n`;
  return appendEditorialLocalisationEvent({
    registryBytes,
    expectedRegistrySha256: editorialLocalisationRegistryBytesSha256(registryBytes),
    event,
    passports
  }).registry;
}

function approvalFor(registry: EditorialLocalisationRegistry) {
  const { passports, passport, draft, retainedCitationIdentity } = fixture();
  const retainedDraft = registry.events.find((event) => event.state === "DRAFT") || draft;
  if (retainedDraft.state !== "DRAFT") throw new Error("FIXTURE_DRAFT_MISSING");
  return createEditorialLocalisationApproval(registry, {
    localisationId: retainedDraft.localisationId,
    draftEventId: retainedDraft.eventId,
    geo: retainedDraft.geo,
    assertionKind: retainedDraft.assertionKind,
    retainedCitationIdentity,
    originalFragmentSha256: sha256EvidencePayload(retainedDraft.originalFragment),
    passportVersionId: passport.version.id,
    passportPayloadSha256: passport.integrity.payloadSha256,
    scopeSha256: editorialScopeSha256(passport, retainedDraft.territorialScope),
    disclaimerSha256: sha256EvidencePayload(retainedDraft.disclaimer),
    editorId: "EDITOR-TEST",
    approvedAt: "2026-09-12T02:00:00.000Z"
  }, passports);
}

describe("editorial legal localisation", () => {
  it("keeps the migrated real registry append-only and empty until human approval exists", () => {
    expect(loadEditorialLocalisationRegistry()).toEqual(emptyRegistry);
    expect(buildEditorialLocalisationManifest()).toEqual(expect.objectContaining({
      publicationGate: "EDITOR_APPROVED_CURRENT_PASSPORT_OR_NOT_PUBLISHED",
      approvedRecords: 0,
      records: []
    }));
  });

  it("never publishes a draft, publishes an exact current approval, then removes a superseded approval", () => {
    const { passports, draft } = fixture();
    const drafted = append(emptyRegistry, draft, passports);
    expect(buildEditorialLocalisationManifest("MN", { registry: drafted, passports }).records).toEqual([]);

    const approval = approvalFor(drafted);
    const approved = append(drafted, approval, passports);
    const approvedManifest = buildEditorialLocalisationManifest("MN", { registry: approved, passports });
    expect(approvedManifest.approvedRecords).toBe(1);
    expect(approvedManifest.records[0]).toEqual(expect.objectContaining({
      id: draft.localisationId,
      geo: "MN",
      locale: "ru",
      localizedText: "Редакторский перевод правового утверждения."
    }));
    expect(approvedManifest.records[0].approval).toEqual(expect.objectContaining({
      eventId: approval.eventId,
      passportVersionId: passports.find((passport) => passport.geo === "MN")!.version.id
    }));

    const supersededEvent = createEditorialLocalisationSuperseded(approved, {
      localisationId: draft.localisationId,
      geo: "MN",
      assertionKind: "CURRENT_CONCLUSION",
      approvedEventId: approval.eventId,
      editorId: "EDITOR-TEST",
      supersededAt: "2026-09-12T03:00:00.000Z",
      reason: "Fixture superseded after editorial withdrawal."
    });
    const superseded = append(approved, supersededEvent, passports);
    expect(buildEditorialLocalisationManifest("MN", { registry: superseded, passports }).approvedRecords).toBe(0);
  });

  it("rejects stale Passport bindings and cross-GEO approvals", () => {
    const { passports, draft } = fixture();
    const drafted = append(emptyRegistry, draft, passports);
    const approval = approvalFor(drafted);
    expect(() => createEditorialLocalisationApproval(drafted, {
      ...approval,
      passportPayloadSha256: "0".repeat(64)
    }, passports)).toThrow("EDITORIAL_LOCALISATION_APPROVAL_PASSPORT_STALE");
    expect(() => createEditorialLocalisationApproval(drafted, {
      ...approval,
      geo: "AD"
    }, passports)).toThrow(/EDITORIAL_LOCALISATION_(?:CROSS_GEO|APPROVAL_CROSS_GEO)/);
  });

  it("rejects tampered events and stale exact-registry byte preimages", () => {
    const { passports, draft } = fixture();
    const registryBytes = `${JSON.stringify(emptyRegistry, null, 2)}\n`;
    expect(() => appendEditorialLocalisationEvent({
      registryBytes,
      expectedRegistrySha256: "0".repeat(64),
      event: draft,
      passports
    })).toThrow("EDITORIAL_LOCALISATION_REGISTRY_CAS_STALE");
    const tampered = { ...draft, localizedText: "Tampered after sealing." };
    expect(() => appendEditorialLocalisationEvent({
      registryBytes,
      expectedRegistrySha256: editorialLocalisationRegistryBytesSha256(registryBytes),
      event: tampered,
      passports
    })).toThrow("EDITORIAL_LOCALISATION_EVENT_TAMPERED");
  });

  it("rejects unknown GEO manifests instead of widening or returning an empty success", () => {
    expect(() => buildEditorialLocalisationManifest("NOT-A-GEO"))
      .toThrow("EDITORIAL_LOCALISATION_UNKNOWN_GEO=NOT-A-GEO");
    expect(() => validateEditorialLocalisationRegistry({ schemaVersion: 1, localOnly: true, records: [] }))
      .toThrow("EDITORIAL_LOCALISATION_REGISTRY_INVALID");
  });

  it("reproduces exact read-only draft and approval tokens from current Passport and registry bytes", () => {
    const { passports, passport, draft, retainedCitationIdentity } = fixture();
    const draftPreparation = buildEditorialLocalisationPreparation({ mode: "DRAFT", geo: "mn" }, {
      registryBytes: `${JSON.stringify(emptyRegistry, null, 2)}\n`,
      passports
    });
    const preparedCitation = draftPreparation.citations.find((citation) => citation.retainedCitationIdentity === retainedCitationIdentity);
    expect(preparedCitation).toEqual(expect.objectContaining({ sourceUrl: draft.sourceUrl }));
    expect(preparedCitation?.fragments.some((fragment) => fragment.originalFragment === draft.originalFragment)).toBe(true);

    const drafted = append(emptyRegistry, draft, passports);
    const draftedBytes = `${JSON.stringify(drafted, null, 2)}\n`;
    const before = draftedBytes;
    const approvalPreparation = buildEditorialLocalisationPreparation({ mode: "APPROVAL", localisationId: draft.localisationId }, {
      registryBytes: draftedBytes,
      passports
    });
    expect(draftedBytes).toBe(before);
    expect(approvalPreparation.approvalTokens).toEqual({
      geo: draft.geo,
      assertionKind: draft.assertionKind,
      expectedRegistrySha256: editorialLocalisationRegistryBytesSha256(draftedBytes),
      draftEventId: draft.eventId,
      retainedCitationIdentity,
      originalFragmentSha256: sha256EvidencePayload(draft.originalFragment),
      passportVersionId: passport.version.id,
      passportPayloadSha256: passport.integrity.payloadSha256,
      scopeSha256: editorialScopeSha256(passport, draft.territorialScope),
      disclaimerSha256: sha256EvidencePayload(draft.disclaimer)
    });
  });
});
