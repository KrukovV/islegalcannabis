import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildEvidencePassportCollection, type EvidencePassport } from "../src/truth-map/evidencePassport";
import {
  appendEditorialLocalisationEvent,
  createEditorialLocalisationApproval,
  createEditorialLocalisationDraft,
  createEditorialLocalisationSuperseded,
  editorialLocalisationRegistryBytesSha256,
  editorialLocalisationRegistryPath,
  validateEditorialLocalisationRegistry,
  type EditorialAssertionKind,
  type EditorialLocalisationEvent,
  type EditorialLocalisationRegistry
} from "../src/truth-map/editorialLocalisation";

type SharedWriterOptions = {
  localisationId: string;
  geo: string;
  assertionKind: EditorialAssertionKind;
  expectedRegistrySha256: string;
};

export type EditorialLocalisationWriterOptions =
  | (SharedWriterOptions & {
      action: "draft";
      locale: string;
      retainedCitationIdentity: string;
      sourceLanguage: string;
      originalFragment: string;
      localizedText: string;
      territorialScope: string;
      disclaimer: string;
      author: string;
      at: string;
    })
  | (SharedWriterOptions & {
      action: "approve";
      draftEventId: string;
      retainedCitationIdentity: string;
      originalFragmentSha256: string;
      passportVersionId: string;
      passportPayloadSha256: string;
      scopeSha256: string;
      disclaimerSha256: string;
      editor: string;
      at: string;
    })
  | (SharedWriterOptions & {
      action: "supersede";
      approvedEventId: string;
      editor: string;
      at: string;
      reason: string;
    });

function optionValue(argv: string[], name: string) {
  const inline = argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] || "" : "";
}

function requiredOption(argv: string[], name: string) {
  const value = optionValue(argv, name).trim();
  if (!value) throw new Error(`EDITORIAL_LOCALISATION_WRITER_OPTION_REQUIRED=${name}`);
  return value;
}

function assertionKindOption(argv: string[]): EditorialAssertionKind {
  const value = requiredOption(argv, "--assertion-kind");
  if (value !== "CURRENT_CONCLUSION" && value !== "MATERIAL_RESTRICTION" && value !== "SOURCE_ANNOTATION") {
    throw new Error(`EDITORIAL_LOCALISATION_WRITER_ASSERTION_KIND_INVALID=${value}`);
  }
  return value;
}

function commonOptions(argv: string[]) {
  const expectedRegistrySha256 = requiredOption(argv, "--expected-registry-sha256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedRegistrySha256)) {
    throw new Error("EDITORIAL_LOCALISATION_EXPECTED_REGISTRY_SHA_INVALID");
  }
  return {
    localisationId: requiredOption(argv, "--localisation-id"),
    geo: requiredOption(argv, "--geo"),
    assertionKind: assertionKindOption(argv),
    expectedRegistrySha256
  };
}

export function parseEditorialLocalisationWriterOptions(argv: string[]): EditorialLocalisationWriterOptions {
  const action = requiredOption(argv, "--action");
  const common = commonOptions(argv);
  if (action === "draft") {
    return {
      ...common,
      action,
      locale: requiredOption(argv, "--locale"),
      retainedCitationIdentity: requiredOption(argv, "--retained-citation-identity"),
      sourceLanguage: requiredOption(argv, "--source-language"),
      originalFragment: requiredOption(argv, "--original-fragment"),
      localizedText: requiredOption(argv, "--localized-text"),
      territorialScope: requiredOption(argv, "--territorial-scope"),
      disclaimer: requiredOption(argv, "--disclaimer"),
      author: requiredOption(argv, "--author"),
      at: requiredOption(argv, "--at")
    };
  }
  if (action === "approve") {
    return {
      ...common,
      action,
      draftEventId: requiredOption(argv, "--draft-event-id"),
      retainedCitationIdentity: requiredOption(argv, "--retained-citation-identity"),
      originalFragmentSha256: requiredOption(argv, "--original-fragment-sha256"),
      passportVersionId: requiredOption(argv, "--passport-version-id"),
      passportPayloadSha256: requiredOption(argv, "--passport-payload-sha256"),
      scopeSha256: requiredOption(argv, "--scope-sha256"),
      disclaimerSha256: requiredOption(argv, "--disclaimer-sha256"),
      editor: requiredOption(argv, "--editor"),
      at: requiredOption(argv, "--at")
    };
  }
  if (action === "supersede") {
    return {
      ...common,
      action,
      approvedEventId: requiredOption(argv, "--approved-event-id"),
      editor: requiredOption(argv, "--editor"),
      at: requiredOption(argv, "--at"),
      reason: requiredOption(argv, "--reason")
    };
  }
  throw new Error(`EDITORIAL_LOCALISATION_WRITER_ACTION_INVALID=${action}`);
}

export function assertEditorialLocalisationWriterLocalOnly(
  environment: Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "VERCEL">> = process.env
) {
  if (environment.NODE_ENV === "production" || environment.VERCEL === "1") {
    throw new Error("EDITORIAL_LOCALISATION_WRITER_LOCAL_ONLY");
  }
}

export function createEditorialLocalisationWriterEvent(
  registry: EditorialLocalisationRegistry,
  options: EditorialLocalisationWriterOptions,
  passports: EvidencePassport[]
): EditorialLocalisationEvent {
  if (options.action === "draft") {
    return createEditorialLocalisationDraft(registry, {
      localisationId: options.localisationId,
      geo: options.geo,
      assertionKind: options.assertionKind,
      locale: options.locale,
      retainedCitationIdentity: options.retainedCitationIdentity,
      sourceLanguage: options.sourceLanguage,
      originalFragment: options.originalFragment,
      localizedText: options.localizedText,
      territorialScope: options.territorialScope,
      disclaimer: options.disclaimer,
      createdBy: options.author,
      createdAt: options.at
    }, passports);
  }
  if (options.action === "approve") {
    return createEditorialLocalisationApproval(registry, {
      localisationId: options.localisationId,
      draftEventId: options.draftEventId,
      geo: options.geo,
      assertionKind: options.assertionKind,
      retainedCitationIdentity: options.retainedCitationIdentity,
      originalFragmentSha256: options.originalFragmentSha256,
      passportVersionId: options.passportVersionId,
      passportPayloadSha256: options.passportPayloadSha256,
      scopeSha256: options.scopeSha256,
      disclaimerSha256: options.disclaimerSha256,
      editorId: options.editor,
      approvedAt: options.at
    }, passports);
  }
  return createEditorialLocalisationSuperseded(registry, {
    localisationId: options.localisationId,
    approvedEventId: options.approvedEventId,
    geo: options.geo,
    assertionKind: options.assertionKind,
    editorId: options.editor,
    supersededAt: options.at,
    reason: options.reason
  });
}

export function appendEditorialLocalisationEventFile({
  registryPath,
  passports,
  options,
  beforeCommit
}: {
  registryPath: string;
  passports: EvidencePassport[];
  options: EditorialLocalisationWriterOptions;
  beforeCommit?: () => void;
}) {
  const lockPath = `${registryPath}.append.lock`;
  const temporaryPath = `${registryPath}.append-${process.pid}.tmp`;
  let lockHandle: number | null = null;
  try {
    lockHandle = fs.openSync(lockPath, "wx");
    const registryBytes = fs.readFileSync(registryPath, "utf8");
    const registry = validateEditorialLocalisationRegistry(JSON.parse(registryBytes));
    const event = createEditorialLocalisationWriterEvent(registry, options, passports);
    const appended = appendEditorialLocalisationEvent({
      registryBytes,
      expectedRegistrySha256: options.expectedRegistrySha256,
      event,
      passports
    });
    fs.writeFileSync(temporaryPath, appended.registryBytes, { flag: "wx" });
    beforeCommit?.();
    const preCommitBytes = fs.readFileSync(registryPath, "utf8");
    if (
      preCommitBytes !== registryBytes
      || editorialLocalisationRegistryBytesSha256(preCommitBytes) !== options.expectedRegistrySha256
    ) {
      throw new Error("EDITORIAL_LOCALISATION_REGISTRY_CAS_CHANGED_BEFORE_COMMIT");
    }
    fs.renameSync(temporaryPath, registryPath);
    return {
      event,
      registrySha256: editorialLocalisationRegistryBytesSha256(appended.registryBytes)
    };
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    if (lockHandle !== null) {
      fs.closeSync(lockHandle);
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    }
  }
}

export function main(argv = process.argv.slice(2)) {
  assertEditorialLocalisationWriterLocalOnly();
  const options = parseEditorialLocalisationWriterOptions(argv);
  const result = appendEditorialLocalisationEventFile({
    registryPath: editorialLocalisationRegistryPath(),
    passports: buildEvidencePassportCollection().passports,
    options
  });
  process.stdout.write(
    `EDITORIAL_LOCALISATION_EVENT_APPENDED=${result.event.eventId} STATE=${result.event.state} REGISTRY_SHA256=${result.registrySha256}\n`
  );
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entrypoint) main();
