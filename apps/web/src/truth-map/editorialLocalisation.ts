import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import { buildEvidencePassportCollection, type EvidencePassport, type EvidencePassportCitation } from "./evidencePassport";
import { sha256EvidencePayload } from "./evidenceHash";

export const EDITORIAL_ASSERTION_KINDS = [
  "CURRENT_CONCLUSION",
  "MATERIAL_RESTRICTION",
  "SOURCE_ANNOTATION"
] as const;

export type EditorialAssertionKind = typeof EDITORIAL_ASSERTION_KINDS[number];

type EditorialEventBase = {
  eventId: string;
  localisationId: string;
  geo: string;
  assertionKind: EditorialAssertionKind;
  previousEventSha256: "GENESIS" | string;
  eventSha256: string;
};

export type EditorialLocalisationDraftEvent = EditorialEventBase & {
  state: "DRAFT";
  locale: string;
  retainedCitationIdentity: string;
  sourceUrl: string;
  sourceLanguage: string;
  originalFragment: string;
  localizedText: string;
  territorialScope: string;
  disclaimer: string;
  createdBy: string;
  createdAt: string;
};

export type EditorialLocalisationApprovalEvent = EditorialEventBase & {
  state: "APPROVED";
  draftEventId: string;
  retainedCitationIdentity: string;
  originalFragmentSha256: string;
  passportVersionId: string;
  passportPayloadSha256: string;
  scopeSha256: string;
  disclaimerSha256: string;
  editorId: string;
  approvedAt: string;
};

export type EditorialLocalisationSupersededEvent = EditorialEventBase & {
  state: "SUPERSEDED";
  approvedEventId: string;
  editorId: string;
  supersededAt: string;
  reason: string;
};

export type EditorialLocalisationEvent =
  | EditorialLocalisationDraftEvent
  | EditorialLocalisationApprovalEvent
  | EditorialLocalisationSupersededEvent;

export type EditorialLegalLocalisation = {
  id: string;
  geo: string;
  locale: string;
  assertionKind: EditorialAssertionKind;
  sourceUrl: string;
  sourceLanguage: string;
  originalFragment: string;
  localizedText: string;
  territorialScope: string;
  disclaimer: string;
  approval: {
    eventId: string;
    editorId: string;
    approvedAt: string;
    retainedCitationIdentity: string;
    originalFragmentSha256: string;
    passportVersionId: string;
    passportPayloadSha256: string;
    scopeSha256: string;
    disclaimerSha256: string;
  };
};

export type EditorialLocalisationRegistry = {
  schemaVersion: 2;
  localOnly: true;
  appendOnly: true;
  events: EditorialLocalisationEvent[];
};

type LocalisationState = {
  draft: EditorialLocalisationDraftEvent;
  approval: EditorialLocalisationApprovalEvent | null;
  superseded: EditorialLocalisationSupersededEvent | null;
};

export function editorialLocalisationRegistryPath(repoRoot = findRepoRoot(process.cwd())) {
  return path.join(repoRoot, "data", "b2b_evidence", "editorial_localisations.json");
}

function requiredText(value: unknown, field: string) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`EDITORIAL_LOCALISATION_${field}_REQUIRED`);
  return text;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function canonicalDate(value: unknown, field: string) {
  const text = requiredText(value, field);
  if (!Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text) {
    throw new Error(`EDITORIAL_LOCALISATION_${field}_INVALID`);
  }
  return text;
}

function assertLocalisationId(value: unknown) {
  const id = requiredText(value, "ID");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(id)) {
    throw new Error(`EDITORIAL_LOCALISATION_ID_INVALID=${id}`);
  }
  return id;
}

function eventUnsigned(event: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(event).filter(([key]) => key !== "eventId" && key !== "eventSha256"));
}

function sealEvent<T extends Record<string, unknown> & { state: EditorialLocalisationEvent["state"] }>(event: T) {
  const unsigned = eventUnsigned(event);
  const eventSha256 = sha256EvidencePayload(unsigned);
  return {
    eventId: `EDLOC-${event.state}-${eventSha256.slice(0, 24)}`,
    ...event,
    eventSha256
  } as T & Pick<EditorialLocalisationEvent, "eventId" | "eventSha256">;
}

function validateEventIntegrity(event: EditorialLocalisationEvent) {
  const eventSha256 = sha256EvidencePayload(eventUnsigned(event as unknown as Record<string, unknown>));
  const eventId = `EDLOC-${event.state}-${eventSha256.slice(0, 24)}`;
  if (event.eventSha256 !== eventSha256 || event.eventId !== eventId) {
    throw new Error(`EDITORIAL_LOCALISATION_EVENT_TAMPERED=${event.eventId || "UNKNOWN"}`);
  }
}

function assertAssertionKind(value: unknown): asserts value is EditorialAssertionKind {
  if (!EDITORIAL_ASSERTION_KINDS.includes(value as EditorialAssertionKind)) {
    throw new Error(`EDITORIAL_LOCALISATION_ASSERTION_KIND_INVALID=${String(value || "")}`);
  }
}

function validateDraftFields(event: EditorialLocalisationDraftEvent) {
  assertLocalisationId(event.localisationId);
  requiredText(event.geo, "GEO");
  assertAssertionKind(event.assertionKind);
  requiredText(event.locale, "LOCALE");
  if (!isSha256(event.retainedCitationIdentity)) throw new Error(`EDITORIAL_LOCALISATION_CITATION_IDENTITY_INVALID=${event.localisationId}`);
  if (!/^https:\/\//.test(requiredText(event.sourceUrl, "SOURCE_URL"))) throw new Error(`EDITORIAL_LOCALISATION_SOURCE_URL_INVALID=${event.localisationId}`);
  requiredText(event.sourceLanguage, "SOURCE_LANGUAGE");
  requiredText(event.originalFragment, "ORIGINAL_FRAGMENT");
  requiredText(event.localizedText, "LOCALIZED_TEXT");
  requiredText(event.territorialScope, "TERRITORIAL_SCOPE");
  requiredText(event.disclaimer, "DISCLAIMER");
  requiredText(event.createdBy, "AUTHOR");
  canonicalDate(event.createdAt, "CREATED_AT");
}

function validateApprovalFields(event: EditorialLocalisationApprovalEvent) {
  assertLocalisationId(event.localisationId);
  requiredText(event.geo, "GEO");
  assertAssertionKind(event.assertionKind);
  requiredText(event.draftEventId, "DRAFT_EVENT_ID");
  requiredText(event.editorId, "EDITOR");
  canonicalDate(event.approvedAt, "APPROVED_AT");
  for (const [field, value] of [
    ["CITATION_IDENTITY", event.retainedCitationIdentity],
    ["ORIGINAL_FRAGMENT_SHA", event.originalFragmentSha256],
    ["PASSPORT_PAYLOAD_SHA", event.passportPayloadSha256],
    ["SCOPE_SHA", event.scopeSha256],
    ["DISCLAIMER_SHA", event.disclaimerSha256]
  ] as const) {
    if (!isSha256(value)) throw new Error(`EDITORIAL_LOCALISATION_${field}_INVALID=${event.localisationId}`);
  }
  requiredText(event.passportVersionId, "PASSPORT_VERSION");
}

function validateSupersededFields(event: EditorialLocalisationSupersededEvent) {
  assertLocalisationId(event.localisationId);
  requiredText(event.geo, "GEO");
  assertAssertionKind(event.assertionKind);
  requiredText(event.approvedEventId, "APPROVED_EVENT_ID");
  requiredText(event.editorId, "EDITOR");
  canonicalDate(event.supersededAt, "SUPERSEDED_AT");
  requiredText(event.reason, "SUPERSEDE_REASON");
}

function replayEditorialEvents(registry: EditorialLocalisationRegistry) {
  const stateById = new Map<string, LocalisationState>();
  const eventIds = new Set<string>();
  let previousEventSha256: "GENESIS" | string = "GENESIS";
  for (const event of registry.events) {
    validateEventIntegrity(event);
    if (eventIds.has(event.eventId)) throw new Error(`EDITORIAL_LOCALISATION_DUPLICATE_EVENT=${event.eventId}`);
    eventIds.add(event.eventId);
    if (event.previousEventSha256 !== previousEventSha256) {
      throw new Error(`EDITORIAL_LOCALISATION_EVENT_CHAIN_INVALID=${event.eventId}`);
    }
    previousEventSha256 = event.eventSha256;
    const state = stateById.get(event.localisationId);
    if (event.state === "DRAFT") {
      validateDraftFields(event);
      if (state) throw new Error(`EDITORIAL_LOCALISATION_DUPLICATE_ID=${event.localisationId}`);
      stateById.set(event.localisationId, { draft: event, approval: null, superseded: null });
      continue;
    }
    if (!state) throw new Error(`EDITORIAL_LOCALISATION_DRAFT_MISSING=${event.localisationId}`);
    if (event.geo !== state.draft.geo || event.assertionKind !== state.draft.assertionKind) {
      throw new Error(`EDITORIAL_LOCALISATION_CROSS_GEO_OR_ASSERTION=${event.localisationId}`);
    }
    if (event.state === "APPROVED") {
      validateApprovalFields(event);
      if (state.approval || state.superseded) throw new Error(`EDITORIAL_LOCALISATION_INVALID_APPROVAL_TRANSITION=${event.localisationId}`);
      if (event.draftEventId !== state.draft.eventId) throw new Error(`EDITORIAL_LOCALISATION_DRAFT_ID_MISMATCH=${event.localisationId}`);
      if (Date.parse(event.approvedAt) < Date.parse(state.draft.createdAt)) throw new Error(`EDITORIAL_LOCALISATION_APPROVAL_BEFORE_DRAFT=${event.localisationId}`);
      state.approval = event;
      continue;
    }
    validateSupersededFields(event);
    if (!state.approval || state.superseded || event.approvedEventId !== state.approval.eventId) {
      throw new Error(`EDITORIAL_LOCALISATION_INVALID_SUPERSEDE_TRANSITION=${event.localisationId}`);
    }
    if (Date.parse(event.supersededAt) < Date.parse(state.approval.approvedAt)) {
      throw new Error(`EDITORIAL_LOCALISATION_SUPERSEDED_BEFORE_APPROVAL=${event.localisationId}`);
    }
    state.superseded = event;
  }
  const activeIdentities = new Set<string>();
  for (const state of stateById.values()) {
    if (!state.approval || state.superseded) continue;
    const identity = `${state.draft.geo}|${state.draft.locale}|${state.draft.assertionKind}`;
    if (activeIdentities.has(identity)) throw new Error(`EDITORIAL_LOCALISATION_DUPLICATE_ACTIVE=${identity}`);
    activeIdentities.add(identity);
  }
  return stateById;
}

export function validateEditorialLocalisationRegistry(value: unknown): EditorialLocalisationRegistry {
  const registry = value as Partial<EditorialLocalisationRegistry> | null;
  if (!registry || registry.schemaVersion !== 2 || registry.localOnly !== true || registry.appendOnly !== true || !Array.isArray(registry.events)) {
    throw new Error("EDITORIAL_LOCALISATION_REGISTRY_INVALID");
  }
  replayEditorialEvents(registry as EditorialLocalisationRegistry);
  return registry as EditorialLocalisationRegistry;
}

export function editorialCitationIdentity(passport: EvidencePassport, citation: EvidencePassportCitation) {
  return sha256EvidencePayload({
    geo: passport.geo,
    url: citation.url,
    title: citation.title,
    publisher: citation.publisher,
    quote: citation.quote,
    annotation: citation.annotation,
    relation: citation.relation,
    role: citation.role,
    sourceOwnerGeo: citation.sourceOwnerGeo,
    appliesToGeos: citation.appliesToGeos,
    sourceType: citation.sourceType
  });
}

export function editorialScopeSha256(passport: EvidencePassport, territorialScope: string) {
  return sha256EvidencePayload({ geo: passport.geo, territorialScope, passportScope: passport.scope });
}

function citationForDraft(passport: EvidencePassport, retainedCitationIdentity: string) {
  return passport.citations.find((citation) => editorialCitationIdentity(passport, citation) === retainedCitationIdentity) || null;
}

function assertDraftBoundToPassport(draft: EditorialLocalisationDraftEvent, passport: EvidencePassport) {
  if (draft.geo !== passport.geo) throw new Error(`EDITORIAL_LOCALISATION_CROSS_GEO=${draft.localisationId}`);
  const citation = citationForDraft(passport, draft.retainedCitationIdentity);
  if (!citation || citation.url !== draft.sourceUrl) throw new Error(`EDITORIAL_LOCALISATION_RETAINED_CITATION_STALE=${draft.localisationId}`);
  const retainedFragments = [citation.quote, citation.annotation].filter((value): value is string => Boolean(value));
  if (!retainedFragments.includes(draft.originalFragment)) {
    throw new Error(`EDITORIAL_LOCALISATION_ORIGINAL_FRAGMENT_NOT_RETAINED=${draft.localisationId}`);
  }
  return citation;
}

function assertApprovalBoundToCurrentPassport(
  draft: EditorialLocalisationDraftEvent,
  approval: EditorialLocalisationApprovalEvent,
  passport: EvidencePassport
) {
  assertDraftBoundToPassport(draft, passport);
  if (approval.geo !== passport.geo || approval.retainedCitationIdentity !== draft.retainedCitationIdentity) {
    throw new Error(`EDITORIAL_LOCALISATION_APPROVAL_CROSS_GEO=${approval.localisationId}`);
  }
  if (approval.originalFragmentSha256 !== sha256EvidencePayload(draft.originalFragment)) {
    throw new Error(`EDITORIAL_LOCALISATION_APPROVAL_FRAGMENT_STALE=${approval.localisationId}`);
  }
  if (approval.passportVersionId !== passport.version.id || approval.passportPayloadSha256 !== passport.integrity.payloadSha256) {
    throw new Error(`EDITORIAL_LOCALISATION_APPROVAL_PASSPORT_STALE=${approval.localisationId}`);
  }
  if (approval.scopeSha256 !== editorialScopeSha256(passport, draft.territorialScope)) {
    throw new Error(`EDITORIAL_LOCALISATION_APPROVAL_SCOPE_STALE=${approval.localisationId}`);
  }
  if (approval.disclaimerSha256 !== sha256EvidencePayload(draft.disclaimer)) {
    throw new Error(`EDITORIAL_LOCALISATION_APPROVAL_DISCLAIMER_STALE=${approval.localisationId}`);
  }
}

function previousEventSha256(registry: EditorialLocalisationRegistry) {
  return registry.events.at(-1)?.eventSha256 || "GENESIS";
}

function passportsIndex(passports: EvidencePassport[]) {
  return new Map(passports.map((passport) => [passport.geo, passport]));
}

export function createEditorialLocalisationDraft(
  registry: EditorialLocalisationRegistry,
  input: Omit<EditorialLocalisationDraftEvent, "state" | "eventId" | "eventSha256" | "previousEventSha256" | "sourceUrl">,
  passports = buildEvidencePassportCollection().passports
) {
  validateEditorialLocalisationRegistry(registry);
  const geo = requiredText(input.geo, "GEO");
  const passport = passportsIndex(passports).get(geo);
  if (!passport) throw new Error(`EDITORIAL_LOCALISATION_UNKNOWN_GEO=${geo}`);
  const citation = citationForDraft(passport, input.retainedCitationIdentity);
  if (!citation) throw new Error(`EDITORIAL_LOCALISATION_RETAINED_CITATION_STALE=${input.localisationId}`);
  const draft = sealEvent({
    localisationId: assertLocalisationId(input.localisationId),
    geo,
    assertionKind: input.assertionKind,
    locale: input.locale,
    retainedCitationIdentity: input.retainedCitationIdentity,
    sourceUrl: citation.url,
    sourceLanguage: input.sourceLanguage,
    originalFragment: input.originalFragment,
    localizedText: input.localizedText,
    territorialScope: input.territorialScope,
    disclaimer: input.disclaimer,
    createdBy: input.createdBy,
    createdAt: input.createdAt,
    state: "DRAFT" as const,
    previousEventSha256: previousEventSha256(registry)
  }) as EditorialLocalisationDraftEvent;
  validateDraftFields(draft);
  assertDraftBoundToPassport(draft, passport);
  return draft;
}

export function createEditorialLocalisationApproval(
  registry: EditorialLocalisationRegistry,
  input: Omit<EditorialLocalisationApprovalEvent, "state" | "eventId" | "eventSha256" | "previousEventSha256">,
  passports = buildEvidencePassportCollection().passports
) {
  const states = replayEditorialEvents(validateEditorialLocalisationRegistry(registry));
  const draft = states.get(input.localisationId)?.draft;
  if (!draft) throw new Error(`EDITORIAL_LOCALISATION_DRAFT_MISSING=${input.localisationId}`);
  const passport = passportsIndex(passports).get(input.geo);
  if (!passport) throw new Error(`EDITORIAL_LOCALISATION_UNKNOWN_GEO=${input.geo}`);
  const approval = sealEvent({
    localisationId: assertLocalisationId(input.localisationId),
    draftEventId: input.draftEventId,
    geo: input.geo,
    assertionKind: input.assertionKind,
    retainedCitationIdentity: input.retainedCitationIdentity,
    originalFragmentSha256: input.originalFragmentSha256,
    passportVersionId: input.passportVersionId,
    passportPayloadSha256: input.passportPayloadSha256,
    scopeSha256: input.scopeSha256,
    disclaimerSha256: input.disclaimerSha256,
    editorId: input.editorId,
    approvedAt: input.approvedAt,
    state: "APPROVED" as const,
    previousEventSha256: previousEventSha256(registry)
  }) as EditorialLocalisationApprovalEvent;
  validateApprovalFields(approval);
  assertApprovalBoundToCurrentPassport(draft, approval, passport);
  return approval;
}

export function createEditorialLocalisationSuperseded(
  registry: EditorialLocalisationRegistry,
  input: Omit<EditorialLocalisationSupersededEvent, "state" | "eventId" | "eventSha256" | "previousEventSha256">
) {
  replayEditorialEvents(validateEditorialLocalisationRegistry(registry));
  const event = sealEvent({
    localisationId: assertLocalisationId(input.localisationId),
    approvedEventId: input.approvedEventId,
    geo: input.geo,
    assertionKind: input.assertionKind,
    editorId: input.editorId,
    supersededAt: input.supersededAt,
    reason: input.reason,
    state: "SUPERSEDED" as const,
    previousEventSha256: previousEventSha256(registry)
  }) as EditorialLocalisationSupersededEvent;
  validateSupersededFields(event);
  return event;
}

export function editorialLocalisationRegistryBytesSha256(bytes: string | Buffer) {
  return sha256EvidencePayload(bytes.toString());
}

export function appendEditorialLocalisationEvent({
  registryBytes,
  expectedRegistrySha256,
  event,
  passports = buildEvidencePassportCollection().passports
}: {
  registryBytes: string;
  expectedRegistrySha256: string;
  event: EditorialLocalisationEvent;
  passports?: EvidencePassport[];
}) {
  if (!isSha256(expectedRegistrySha256)) throw new Error("EDITORIAL_LOCALISATION_EXPECTED_REGISTRY_SHA_INVALID");
  const actualRegistrySha256 = editorialLocalisationRegistryBytesSha256(registryBytes);
  if (actualRegistrySha256 !== expectedRegistrySha256) {
    throw new Error(`EDITORIAL_LOCALISATION_REGISTRY_CAS_STALE expected=${expectedRegistrySha256} actual=${actualRegistrySha256}`);
  }
  const registry = validateEditorialLocalisationRegistry(JSON.parse(registryBytes));
  if (event.previousEventSha256 !== previousEventSha256(registry)) {
    throw new Error(`EDITORIAL_LOCALISATION_EVENT_STALE=${event.eventId}`);
  }
  const passport = passportsIndex(passports).get(event.geo);
  if (!passport) throw new Error(`EDITORIAL_LOCALISATION_UNKNOWN_GEO=${event.geo}`);
  if (event.state === "DRAFT") assertDraftBoundToPassport(event, passport);
  if (event.state === "APPROVED") {
    const draft = replayEditorialEvents(registry).get(event.localisationId)?.draft;
    if (!draft) throw new Error(`EDITORIAL_LOCALISATION_DRAFT_MISSING=${event.localisationId}`);
    assertApprovalBoundToCurrentPassport(draft, event, passport);
  }
  const next = validateEditorialLocalisationRegistry({ ...registry, events: [...registry.events, event] });
  return {
    registry: next,
    registryBytes: `${JSON.stringify(next, null, 2)}\n`,
    preimageSha256: actualRegistrySha256
  };
}

export function loadEditorialLocalisationRegistry(repoRoot?: string) {
  return validateEditorialLocalisationRegistry(JSON.parse(fs.readFileSync(editorialLocalisationRegistryPath(repoRoot), "utf8")));
}

export function buildEditorialLocalisationPreparation(
  input: { mode: "DRAFT"; geo: string } | { mode: "APPROVAL"; localisationId: string },
  {
    registryBytes = fs.readFileSync(editorialLocalisationRegistryPath(), "utf8"),
    passports = buildEvidencePassportCollection().passports
  }: {
    registryBytes?: string;
    passports?: EvidencePassport[];
  } = {}
) {
  const registry = validateEditorialLocalisationRegistry(JSON.parse(registryBytes));
  const registrySha256 = editorialLocalisationRegistryBytesSha256(registryBytes);
  const passportByGeo = passportsIndex(passports);
  if (input.mode === "DRAFT") {
    const geo = requiredText(input.geo, "GEO").toUpperCase();
    const passport = passportByGeo.get(geo);
    if (!passport) throw new Error(`EDITORIAL_LOCALISATION_UNKNOWN_GEO=${geo}`);
    return {
      schemaVersion: 1 as const,
      localOnly: true as const,
      mode: "DRAFT" as const,
      geo,
      expectedRegistrySha256: registrySha256,
      passportVersionId: passport.version.id,
      passportPayloadSha256: passport.integrity.payloadSha256,
      citations: passport.citations.map((citation) => ({
        retainedCitationIdentity: editorialCitationIdentity(passport, citation),
        sourceUrl: citation.url,
        title: citation.title,
        fragments: [
          ...(citation.quote ? [{ sourceField: "quote" as const, originalFragment: citation.quote, originalFragmentSha256: sha256EvidencePayload(citation.quote) }] : []),
          ...(citation.annotation && citation.annotation !== citation.quote
            ? [{ sourceField: "annotation" as const, originalFragment: citation.annotation, originalFragmentSha256: sha256EvidencePayload(citation.annotation) }]
            : [])
        ]
      }))
    };
  }

  const localisationId = assertLocalisationId(input.localisationId);
  const state = replayEditorialEvents(registry).get(localisationId);
  if (!state) throw new Error(`EDITORIAL_LOCALISATION_DRAFT_MISSING=${localisationId}`);
  if (state.approval || state.superseded) {
    throw new Error(`EDITORIAL_LOCALISATION_NOT_AWAITING_APPROVAL=${localisationId}`);
  }
  const { draft } = state;
  const passport = passportByGeo.get(draft.geo);
  if (!passport) throw new Error(`EDITORIAL_LOCALISATION_UNKNOWN_GEO=${draft.geo}`);
  assertDraftBoundToPassport(draft, passport);
  return {
    schemaVersion: 1 as const,
    localOnly: true as const,
    mode: "APPROVAL" as const,
    localisationId,
    approvalTokens: {
      geo: draft.geo,
      assertionKind: draft.assertionKind,
      expectedRegistrySha256: registrySha256,
      draftEventId: draft.eventId,
      retainedCitationIdentity: draft.retainedCitationIdentity,
      originalFragmentSha256: sha256EvidencePayload(draft.originalFragment),
      passportVersionId: passport.version.id,
      passportPayloadSha256: passport.integrity.payloadSha256,
      scopeSha256: editorialScopeSha256(passport, draft.territorialScope),
      disclaimerSha256: sha256EvidencePayload(draft.disclaimer)
    }
  };
}

function activeApprovedRecords(registry: EditorialLocalisationRegistry, passports: EvidencePassport[]) {
  const states = replayEditorialEvents(registry);
  const passportByGeo = passportsIndex(passports);
  return [...states.values()].flatMap((state): EditorialLegalLocalisation[] => {
    const { draft, approval, superseded } = state;
    if (!approval || superseded) return [];
    const passport = passportByGeo.get(draft.geo);
    if (!passport) return [];
    try {
      assertApprovalBoundToCurrentPassport(draft, approval, passport);
    } catch {
      return [];
    }
    return [{
      id: draft.localisationId,
      geo: draft.geo,
      locale: draft.locale,
      assertionKind: draft.assertionKind,
      sourceUrl: draft.sourceUrl,
      sourceLanguage: draft.sourceLanguage,
      originalFragment: draft.originalFragment,
      localizedText: draft.localizedText,
      territorialScope: draft.territorialScope,
      disclaimer: draft.disclaimer,
      approval: {
        eventId: approval.eventId,
        editorId: approval.editorId,
        approvedAt: approval.approvedAt,
        retainedCitationIdentity: approval.retainedCitationIdentity,
        originalFragmentSha256: approval.originalFragmentSha256,
        passportVersionId: approval.passportVersionId,
        passportPayloadSha256: approval.passportPayloadSha256,
        scopeSha256: approval.scopeSha256,
        disclaimerSha256: approval.disclaimerSha256
      }
    }];
  }).sort((left, right) => `${left.geo}|${left.locale}|${left.assertionKind}`.localeCompare(`${right.geo}|${right.locale}|${right.assertionKind}`));
}

export function buildEditorialLocalisationManifest(
  geo?: string,
  {
    registry = loadEditorialLocalisationRegistry(),
    passports = buildEvidencePassportCollection().passports
  }: {
    registry?: EditorialLocalisationRegistry;
    passports?: EvidencePassport[];
  } = {}
) {
  const normalizedGeo = String(geo || "").trim().toUpperCase();
  const canonicalGeos = new Set(passports.map((passport) => passport.geo));
  if (normalizedGeo && !canonicalGeos.has(normalizedGeo)) throw new Error(`EDITORIAL_LOCALISATION_UNKNOWN_GEO=${normalizedGeo}`);
  const active = activeApprovedRecords(validateEditorialLocalisationRegistry(registry), passports);
  const records = normalizedGeo ? active.filter((record) => record.geo === normalizedGeo) : active;
  const unsigned = {
    schemaVersion: 2 as const,
    localOnly: true as const,
    publicationGate: "EDITOR_APPROVED_CURRENT_PASSPORT_OR_NOT_PUBLISHED" as const,
    geo: normalizedGeo || null,
    approvedRecords: records.length,
    records
  };
  return { ...unsigned, payloadSha256: sha256EvidencePayload(unsigned) };
}
