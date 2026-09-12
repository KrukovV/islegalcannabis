import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendEditorialLocalisationEventFile,
  assertEditorialLocalisationWriterLocalOnly,
  parseEditorialLocalisationWriterOptions,
  type EditorialLocalisationWriterOptions
} from "../../scripts/append-editorial-localisation-event";
import { buildEvidencePassportCollection } from "./evidencePassport";
import { sha256EvidencePayload } from "./evidenceHash";
import {
  buildEditorialLocalisationManifest,
  editorialCitationIdentity,
  editorialLocalisationRegistryBytesSha256,
  editorialScopeSha256,
  validateEditorialLocalisationRegistry,
  type EditorialLocalisationDraftEvent,
  type EditorialLocalisationRegistry
} from "./editorialLocalisation";

const emptyRegistry: EditorialLocalisationRegistry = {
  schemaVersion: 2,
  localOnly: true,
  appendOnly: true,
  events: []
};

const emptyRegistryBytes = `${JSON.stringify(emptyRegistry, null, 2)}\n`;

function fixture() {
  const passports = buildEvidencePassportCollection().passports;
  const passport = passports.find((candidate) => candidate.geo === "MN")!;
  const citation = passport.citations.find((candidate) => candidate.quote || candidate.annotation)!;
  const originalFragment = citation.quote || citation.annotation;
  const draftOptions: EditorialLocalisationWriterOptions = {
    action: "draft",
    localisationId: "MN.ru.writer.fixture",
    geo: "MN",
    assertionKind: "CURRENT_CONCLUSION",
    expectedRegistrySha256: editorialLocalisationRegistryBytesSha256(emptyRegistryBytes),
    locale: "ru",
    retainedCitationIdentity: editorialCitationIdentity(passport, citation),
    sourceLanguage: "mn",
    originalFragment,
    localizedText: "Редакторский перевод для теста writer.",
    territorialScope: "Mongolia",
    disclaimer: "Translation does not replace the official source.",
    author: "AUTHOR-TEST",
    at: "2026-09-12T03:00:00.000Z"
  };
  return { passports, passport, draftOptions };
}

function withTemporaryRegistry(run: (_registryPath: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-editorial-localisation-"));
  const registryPath = path.join(root, "editorial_localisations.json");
  try {
    fs.writeFileSync(registryPath, emptyRegistryBytes);
    run(registryPath);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("editorial localisation local writer", () => {
  it("atomically appends a draft and exact Passport-bound approval while publishing only the approval", () => {
    withTemporaryRegistry((registryPath) => {
      const { passports, passport, draftOptions } = fixture();
      appendEditorialLocalisationEventFile({ registryPath, passports, options: draftOptions });
      const draftedBytes = fs.readFileSync(registryPath, "utf8");
      const drafted = validateEditorialLocalisationRegistry(JSON.parse(draftedBytes));
      const draft = drafted.events[0] as EditorialLocalisationDraftEvent;
      expect(draft.state).toBe("DRAFT");
      expect(buildEditorialLocalisationManifest("MN", { registry: drafted, passports }).approvedRecords).toBe(0);

      const approvalOptions: EditorialLocalisationWriterOptions = {
        action: "approve",
        localisationId: draft.localisationId,
        geo: draft.geo,
        assertionKind: draft.assertionKind,
        expectedRegistrySha256: editorialLocalisationRegistryBytesSha256(draftedBytes),
        draftEventId: draft.eventId,
        retainedCitationIdentity: draft.retainedCitationIdentity,
        originalFragmentSha256: sha256EvidencePayload(draft.originalFragment),
        passportVersionId: passport.version.id,
        passportPayloadSha256: passport.integrity.payloadSha256,
        scopeSha256: editorialScopeSha256(passport, draft.territorialScope),
        disclaimerSha256: sha256EvidencePayload(draft.disclaimer),
        editor: "EDITOR-TEST",
        at: "2026-09-12T04:00:00.000Z"
      };
      appendEditorialLocalisationEventFile({ registryPath, passports, options: approvalOptions });
      const approved = validateEditorialLocalisationRegistry(JSON.parse(fs.readFileSync(registryPath, "utf8")));
      expect(approved.events.map((event) => event.state)).toEqual(["DRAFT", "APPROVED"]);
      expect(buildEditorialLocalisationManifest("MN", { registry: approved, passports }).approvedRecords).toBe(1);
    });
  });

  it("rejects a stale preimage and a byte change after staging without overwriting either registry", () => {
    withTemporaryRegistry((registryPath) => {
      const { passports, draftOptions } = fixture();
      expect(() => appendEditorialLocalisationEventFile({
        registryPath,
        passports,
        options: { ...draftOptions, expectedRegistrySha256: "0".repeat(64) }
      })).toThrow("EDITORIAL_LOCALISATION_REGISTRY_CAS_STALE");
      expect(fs.readFileSync(registryPath, "utf8")).toBe(emptyRegistryBytes);

      const changedBytes = `${emptyRegistryBytes} `;
      expect(() => appendEditorialLocalisationEventFile({
        registryPath,
        passports,
        options: draftOptions,
        beforeCommit: () => fs.writeFileSync(registryPath, changedBytes)
      })).toThrow("EDITORIAL_LOCALISATION_REGISTRY_CAS_CHANGED_BEFORE_COMMIT");
      expect(fs.readFileSync(registryPath, "utf8")).toBe(changedBytes);
      expect(fs.existsSync(`${registryPath}.append.lock`)).toBe(false);
    });
  });

  it("preserves another writer's lock and refuses production execution", () => {
    withTemporaryRegistry((registryPath) => {
      const lockPath = `${registryPath}.append.lock`;
      const { passports, draftOptions } = fixture();
      fs.writeFileSync(lockPath, "other-writer");
      expect(() => appendEditorialLocalisationEventFile({ registryPath, passports, options: draftOptions }))
        .toThrow(/EEXIST/);
      expect(fs.readFileSync(lockPath, "utf8")).toBe("other-writer");
      expect(fs.readFileSync(registryPath, "utf8")).toBe(emptyRegistryBytes);
    });
    expect(() => assertEditorialLocalisationWriterLocalOnly({ NODE_ENV: "production", VERCEL: undefined }))
      .toThrow("EDITORIAL_LOCALISATION_WRITER_LOCAL_ONLY");
    expect(() => assertEditorialLocalisationWriterLocalOnly({ NODE_ENV: "development", VERCEL: "1" }))
      .toThrow("EDITORIAL_LOCALISATION_WRITER_LOCAL_ONLY");
  });

  it("requires explicit action bindings instead of inferring approval hashes", () => {
    expect(() => parseEditorialLocalisationWriterOptions([
      "--action=approve",
      "--localisation-id=MN.ru.fixture",
      "--geo=MN",
      "--assertion-kind=CURRENT_CONCLUSION",
      `--expected-registry-sha256=${"a".repeat(64)}`,
      "--draft-event-id=EDLOC-DRAFT-fixture"
    ])).toThrow("EDITORIAL_LOCALISATION_WRITER_OPTION_REQUIRED=--retained-citation-identity");
  });
});
