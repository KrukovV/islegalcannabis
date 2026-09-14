import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocalAuditHost } from "@/lib/privateAuditHost";
import {
  buildSourceReviewWorkbench,
  parseSourceReviewWorkbenchSearchParams,
  SOURCE_REVIEW_WORKBENCH_CATEGORIES,
  SOURCE_REVIEW_WORKBENCH_STATES,
  type SourceReviewWorkbenchDossier
} from "@/truth-map/sourceReviewWorkbench";
import styles from "../EvidencePassport.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Source Review Workbench — Local evidence operations",
  robots: { index: false, follow: false }
};

function toSearchParams(input: Record<string, string | string[] | undefined>) {
  const output = new URLSearchParams();
  for (const [name, value] of Object.entries(input)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) output.append(name, item);
  }
  return output;
}

function linkedValue(value: string) {
  return /^https?:\/\//.test(value)
    ? <a href={value} target="_blank" rel="noopener noreferrer">{value}</a>
    : value;
}

function recordedBoolean(value: boolean | null) {
  return value === null ? "NOT_RECORDED" : value ? "YES" : "NO";
}

function recordedReviewFlag(value: boolean | string | null) {
  if (value === null) return "NOT_RECORDED";
  if (typeof value === "boolean") return value ? "YES" : "NO";
  return value;
}

function Dossier({ dossier }: { dossier: SourceReviewWorkbenchDossier }) {
  return <li data-testid={`source-review-dossier-${dossier.operation.operationId}`}>
    <strong>{dossier.operation.geo} · {dossier.operation.category} · {dossier.lifecycle}</strong>
    <p>{linkedValue(dossier.operation.sourceUrl)}</p>
    <dl className={styles.definitionGrid}>
      <div><dt>Operation</dt><dd>{dossier.operation.operationId}</dd></div>
      <div><dt>Current canonical signal</dt><dd>{dossier.currentSignal ? "YES" : "NO — append-only history"}</dd></div>
      <div><dt>Event</dt><dd>{dossier.operation.eventKind}</dd></div>
      <div><dt>Opened</dt><dd>{dossier.operation.openedAt}</dd></div>
      <div><dt>Initial source state</dt><dd>{dossier.operation.revalidationStateAtOpen}</dd></div>
      <div><dt>Initial change reason</dt><dd>{dossier.operation.changeReasonAtOpen}</dd></div>
      <div><dt>Latest attempt</dt><dd>{dossier.latestAttempt.attemptId}</dd></div>
      <div><dt>Attempt history</dt><dd>{dossier.attemptHistory.length} retained attempt(s), oldest to newest</dd></div>
      <div><dt>Attempted</dt><dd>{dossier.latestAttempt.attemptedAt}</dd></div>
      <div><dt>Source checked</dt><dd>{dossier.latestAttempt.sourceCheckedAt}</dd></div>
      <div><dt>Signal identity</dt><dd>{dossier.latestAttempt.signalIdentitySha256}</dd></div>
      <div><dt>Final URL</dt><dd>{linkedValue(dossier.latestAttempt.finalUrl)}</dd></div>
      <div><dt>Content SHA-256</dt><dd>{dossier.latestAttemptContentSha256}</dd></div>
      <div><dt>Fragment SHA-256</dt><dd>{dossier.latestAttempt.relevantFragmentSha256}</dd></div>
      <div><dt>Resolution</dt><dd>{dossier.resolution?.outcome || "OPEN"}</dd></div>
      <div><dt>Resolution evidence</dt><dd>{dossier.resolution ? linkedValue(dossier.resolution.evidenceUrl) : "NOT_RECORDED"}</dd></div>
      <div><dt>Reviewed attempt</dt><dd>{dossier.resolution?.reviewedAttemptId || "NOT_RECORDED"}</dd></div>
      <div><dt>Machine evidence binding</dt><dd>{dossier.evidenceAttestationState || "NOT_APPLICABLE_OPEN_OPERATION"}</dd></div>
    </dl>
    {dossier.evidenceAttestation ? <section data-testid={`source-review-evidence-attestation-${dossier.operation.operationId}`}>
      <h3>Machine-bound human evidence attestation</h3>
      <p>The committed byte hashes are the evidence identity. The locator below is only a retrieval hint and is never treated as identity.</p>
      <dl className={styles.definitionGrid}>
        <div><dt>Attestation</dt><dd>{dossier.evidenceAttestation.attestationId}</dd></div>
        <div><dt>Attestation state</dt><dd>{dossier.evidenceAttestationState}</dd></div>
        <div><dt>Mode</dt><dd>{dossier.evidenceAttestation.attestationMode}</dd></div>
        <div><dt>Attested</dt><dd>{dossier.evidenceAttestation.attestedAt}</dd></div>
        <div><dt>Resolution registry preimage SHA-256</dt><dd>{dossier.evidenceAttestation.resolutionRegistryPreimageSha256}</dd></div>
        <div><dt>Reviewed signal identity SHA-256</dt><dd>{dossier.evidenceAttestation.reviewedSignalIdentitySha256}</dd></div>
        <div><dt>Reviewed signal payload SHA-256</dt><dd>{dossier.evidenceAttestation.reviewedSignalPayloadSha256}</dd></div>
        <div><dt>Reviewer</dt><dd>{dossier.evidenceAttestation.review.reviewerId}</dd></div>
        <div><dt>Reviewed</dt><dd>{dossier.evidenceAttestation.review.reviewedAt}</dd></div>
        <div><dt>C2</dt><dd>{dossier.evidenceAttestation.review.c2}</dd></div>
        <div><dt>C3</dt><dd>{dossier.evidenceAttestation.review.c3}</dd></div>
        <div><dt>Source record SHA-256</dt><dd>{dossier.evidenceAttestation.sourceRecordSha256}</dd></div>
        <div><dt>Exact fragment SHA-256</dt><dd>{dossier.evidenceAttestation.bindings.exactFragmentUtf8.sha256}</dd></div>
        <div><dt>Exact fragment bytes</dt><dd>{dossier.evidenceAttestation.bindings.exactFragmentUtf8.byteLength}</dd></div>
        <div><dt>Visual artifact SHA-256</dt><dd>{dossier.evidenceAttestation.bindings.visualArtifactBytes.sha256}</dd></div>
        <div><dt>Visual artifact media type</dt><dd>{dossier.evidenceAttestation.bindings.visualArtifactBytes.mediaType}</dd></div>
        <div><dt>Visual artifact bytes</dt><dd>{dossier.evidenceAttestation.bindings.visualArtifactBytes.byteLength}</dd></div>
        <div><dt>Artifact retrieval hint (not identity)</dt><dd>{dossier.evidenceAttestation.bindings.visualArtifactBytes.locator}</dd></div>
        <div><dt>Artifact captured</dt><dd>{dossier.evidenceAttestation.bindings.visualArtifactBytes.capturedAt}</dd></div>
        <div><dt>Visible evidence scopes</dt><dd>{dossier.evidenceAttestation.review.visibleEvidenceScopes.join(", ") || "NOT_RECORDED"}</dd></div>
        <div><dt>Visibility checks</dt><dd><pre>{JSON.stringify(dossier.evidenceAttestation.review.visibility, null, 2)}</pre></dd></div>
        <div><dt>Evidence attestation SHA-256</dt><dd>{dossier.evidenceAttestation.attestationSha256}</dd></div>
        <div><dt>Previous attestation SHA-256</dt><dd>{dossier.evidenceAttestation.previousAttestationSha256}</dd></div>
        <div><dt>Superseded attestation</dt><dd>{dossier.evidenceAttestation.supersedesAttestationId || "GENESIS_FOR_RESOLUTION"}</dd></div>
        <div><dt>Source ledger SHA-256</dt><dd>{dossier.evidenceAttestation.inputs.sourceLedgerSha256}</dd></div>
        <div><dt>Canonical GEO list SHA-256</dt><dd>{dossier.evidenceAttestation.inputs.canonicalGeosSha256}</dd></div>
        <div><dt>Official registry SHA-256</dt><dd>{dossier.evidenceAttestation.inputs.officialRegistrySha256}</dd></div>
        <div><dt>Ownership registry SHA-256</dt><dd>{dossier.evidenceAttestation.inputs.ownershipRegistrySha256}</dd></div>
      </dl>
      <details><summary>Bound retained source record</summary><pre>{JSON.stringify(dossier.evidenceAttestation.sourceRecord, null, 2)}</pre></details>
    </section> : dossier.resolution ? <p data-testid={`source-review-evidence-attestation-${dossier.operation.operationId}`}>
      Machine-bound human evidence attestation: UNBOUND_LEGACY
    </p> : null}
    {dossier.currentSource ? <section data-testid={`source-review-current-source-${dossier.operation.operationId}`}>
      <h3>Current retained source evidence</h3>
      <dl className={styles.definitionGrid}>
        <div><dt>Title</dt><dd>{dossier.currentSource.title}</dd></div>
        <div><dt>Official publisher</dt><dd>{dossier.currentSource.publisher}</dd></div>
        <div><dt>Source owner GEO</dt><dd>{dossier.currentSource.sourceOwnerGeo || "NOT_RECORDED"}</dd></div>
        <div><dt>Applies to GEO</dt><dd>{dossier.currentSource.appliesToGeos.join(", ") || "NOT_RECORDED"}</dd></div>
        <div><dt>Applicability basis</dt><dd>{dossier.currentSource.legalBasisForExtension}</dd></div>
        <div><dt>Source role</dt><dd>{dossier.currentSource.role}</dd></div>
        <div><dt>Source type</dt><dd>{dossier.currentSource.sourceType}</dd></div>
        <div><dt>Current state</dt><dd>{dossier.currentSource.currentness}</dd></div>
        <div><dt>Effective state</dt><dd>{dossier.currentSource.effectiveState}</dd></div>
        <div><dt>Cannabis specific</dt><dd>{dossier.currentSource.cannabisSpecific ? "YES" : "NO"}</dd></div>
        <div><dt>Exact retained fragment</dt><dd>{dossier.currentSource.fragment || "NOT_RECORDED"}</dd></div>
        <div><dt>Verification</dt><dd>{dossier.currentSource.verification}</dd></div>
        <div><dt>Evidence scope</dt><dd>{dossier.currentSource.evidenceScope}</dd></div>
        <div><dt>Source confidence</dt><dd>{dossier.currentSource.confidence}</dd></div>
        <div><dt>Visual review state</dt><dd>{dossier.currentSource.visualReview || "NOT_RECORDED"}</dd></div>
        <div><dt>Visually opened</dt><dd>{recordedBoolean(dossier.currentSource.visualOpened)}</dd></div>
        <div><dt>Screenshot valid</dt><dd>{recordedBoolean(dossier.currentSource.screenshotValid)}</dd></div>
        <div><dt>Official owner visible</dt><dd>{recordedReviewFlag(dossier.currentSource.officialOwnerVisible)}</dd></div>
        <div><dt>Official domain visible</dt><dd>{recordedReviewFlag(dossier.currentSource.officialDomainVisible)}</dd></div>
        <div><dt>Cannabis fragment visible</dt><dd>{recordedReviewFlag(dossier.currentSource.cannabisFragmentVisible)}</dd></div>
        <div><dt>Effective rule visible</dt><dd>{recordedReviewFlag(dossier.currentSource.effectiveRuleVisible)}</dd></div>
        <div><dt>Screenshot available</dt><dd>{recordedBoolean(dossier.currentSource.screenshotAvailable)}</dd></div>
        <div><dt>Screenshot path(s)</dt><dd>{dossier.currentSource.screenshotPaths.length
          ? <ul>{dossier.currentSource.screenshotPaths.map((item) => <li key={item}>{item}</li>)}</ul>
          : "NOT_RECORDED"}</dd></div>
      </dl>
    </section> : <p data-testid={`source-review-current-source-${dossier.operation.operationId}`}>Current canonical source evidence: NOT_AVAILABLE_FOR_HISTORICAL_OPERATION</p>}
    <details>
      <summary>Reproducible attempt history</summary>
      <ol>
        {dossier.attemptHistory.map((attempt) => <li key={attempt.attemptId}>
          <strong>{attempt.attemptId}</strong>
          <p>{attempt.sourceCheckedAt} · {attempt.signalIdentityFormat}</p>
          <p>Signal identity: {attempt.signalIdentitySha256}<br />Payload SHA-256: {attempt.signalPayloadSha256}</p>
          <pre>{JSON.stringify(attempt.signalPayload, null, 2)}</pre>
          <details><summary>Exact identity preimage</summary><pre>{attempt.signalIdentityPreimage}</pre></details>
        </li>)}
      </ol>
    </details>
    {dossier.closeTokens ? <details data-testid={`source-review-close-tokens-${dossier.operation.operationId}`}>
      <summary>Copy-ready close tokens</summary>
      <pre>{JSON.stringify(dossier.closeTokens, null, 2)}</pre>
    </details> : null}
    <small>{dossier.resolution?.boundary || dossier.latestAttempt.boundary}</small>
  </li>;
}

export default async function SourceReviewWorkbenchPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const host = (await headers()).get("host") || "127.0.0.1:3000";
  if (!isLocalAuditHost(host)) notFound();
  const raw = searchParams ? await searchParams : {};
  let workbench: ReturnType<typeof buildSourceReviewWorkbench>;
  try {
    workbench = buildSourceReviewWorkbench(parseSourceReviewWorkbenchSearchParams(toSearchParams(raw)));
  } catch {
    notFound();
  }

  return <main className={styles.page} data-testid="source-review-workbench-page">
    <section className={styles.hero}>
      <p className={styles.eyebrow}>Local-only · bounded read-only operations view</p>
      <h1>Source Review Workbench</h1>
      <p>Current canonical review signals are separated from append-only historical operations and explicit human resolutions. This view cannot resolve an operation or change Legal Truth.</p>
    </section>

    <section className={styles.controls}>
      <form method="get">
        <label htmlFor="source-review-operation">Exact operation ID</label>
        <input id="source-review-operation" name="operationId" defaultValue={workbench.filters.operationId || ""} placeholder="SRCREV-…" spellCheck={false} />
        <label htmlFor="source-review-geo">Canonical GEO</label>
        <input id="source-review-geo" name="geo" defaultValue={workbench.filters.geo || ""} placeholder="US-MT" spellCheck={false} />
        <label htmlFor="source-review-category">Category</label>
        <select id="source-review-category" name="category" defaultValue={workbench.filters.category || ""}>
          <option value="">All categories</option>
          {SOURCE_REVIEW_WORKBENCH_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <label htmlFor="source-review-state">Lifecycle filter</label>
        <select id="source-review-state" name="state" defaultValue={workbench.filters.state || ""}>
          <option value="">All operations</option>
          {SOURCE_REVIEW_WORKBENCH_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
        </select>
        <button type="submit">Filter review queue</button>
      </form>
      <div className={styles.monitor} data-testid="source-review-workbench-summary">
        <strong>{workbench.summary.canonicalGeos}/307 canonical GEO</strong>
        <span>{workbench.summary.geosAnalysed} GEO analysed · {workbench.summary.geosRemainingFirstPass} GEO remain for first-pass C2/C3</span>
        <span>{workbench.summary.geosFullyClosed} GEO fully closed · {workbench.summary.geosWithCurrentSignalsRemaining} GEO still have current signals</span>
        <span>{workbench.summary.currentGeoDocumentsReviewed}/{workbench.summary.currentGeoDocuments} current GEO legal-source records reviewed · {workbench.summary.currentGeoDocumentsRemaining} remain</span>
        <span>{workbench.summary.currentSignalsReviewed}/{workbench.summary.currentSignals} current signals reviewed · {workbench.summary.currentSignalsRemaining} remain</span>
        <span>{workbench.summary.currentSignals} current signals</span>
        <span>{workbench.summary.currentActive} current active operations</span>
        <span>{workbench.summary.openHistorical} historical open operations</span>
        <span>{workbench.summary.resolved} explicitly resolved operations</span>
        <span>{workbench.summary.evidenceAttested}/{workbench.summary.resolved} resolved operations with machine-bound evidence</span>
        <span>{workbench.summary.evidenceBoundPreClose} pre-close · {workbench.summary.evidenceBoundPostHoc} post-hoc · {workbench.summary.evidenceUnboundLegacy} legacy unbound</span>
        <span>{workbench.summary.matchingOperations} matching · {workbench.summary.returnedOperations} shown</span>
        <span>Exact registry SHA-256: {workbench.registrySha256}</span>
        {workbench.summary.truncated ? <small>Result is bounded. Narrow GEO, category or lifecycle to inspect the exact dossier.</small> : null}
        <a href={`/api/truth-map/b2b/source-review${toSearchParams(raw).size ? `?${toSearchParams(raw).toString()}` : ""}`}>Open the same read-only JSON</a>
      </div>
    </section>

    <section className={styles.passport}>
      <div className={styles.passportHeader}><div><p className={styles.eyebrow}>Exact operation dossiers</p><h2>{workbench.summary.matchingOperations} matches</h2></div></div>
      <section className={styles.section}>
        <p className={styles.hint}>The latest attempt retains its exact signal identity, final URL and content/fragment hashes. A network result never closes this queue automatically.</p>
        {workbench.dossiers.length
          ? <ol className={styles.citations}>{workbench.dossiers.map((dossier) => <Dossier key={dossier.operation.operationId} dossier={dossier} />)}</ol>
          : <p>No operation matches these exact filters.</p>}
      </section>
    </section>

    <aside className={styles.boundaries}>
      <strong>{workbench.boundary}</strong><br />
      <Link href="/truth-map/evidence-passport">Back to Evidence Passport</Link> · <Link href="/truth-map/evidence-passport/changelog">Open professional changelog</Link>
    </aside>
  </main>;
}
