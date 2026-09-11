import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocalAuditHost } from "@/lib/privateAuditHost";
import { buildChangeMonitor } from "@/truth-map/changeMonitor";
import { buildEvidencePassportCollection, type EvidencePassport } from "@/truth-map/evidencePassport";
import styles from "./EvidencePassport.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Evidence Passport — Local B2B Preview",
  robots: { index: false, follow: false }
};

function statusClass(value: string) {
  return value === "GREEN" ? styles.green : value === "YELLOW" ? styles.yellow : value === "RED" ? styles.red : styles.unknown;
}

function formatDate(value: string | null) {
  if (!value) return "NOT_RECORDED";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString();
}

function relativeUrl(url: string, origin: string) {
  return url.startsWith(origin) ? url.slice(origin.length) : url;
}

function readWatchlist(value: string | string[] | undefined) {
  return (typeof value === "string" ? value.split(",") : [])
    .map((geo) => geo.trim())
    .filter(Boolean);
}

function PassportDetail({ passport, origin }: { passport: EvidencePassport; origin: string }) {
  const exactCitations = passport.citations.filter((citation) => citation.relation === "MAP_POPUP_SEO_EXACT");
  const extendedCitations = passport.citations.filter((citation) => citation.relation === "RETAINED_OFFICIAL_SOURCE_EXTENSION");
  const localEmbed = `<iframe title="isLegal Evidence Passport — ${passport.territory}" src="${passport.delivery.embedCard}" width="420" height="480" loading="lazy"></iframe>`;
  return (
    <section className={styles.passport} data-testid="evidence-passport-detail" data-geo={passport.geo}>
      <div className={styles.passportHeader}>
        <div>
          <p className={styles.eyebrow}>Evidence Passport · local design-partner preview</p>
          <h2>{passport.territory}</h2>
          <p className={styles.geo}>{passport.geo} · canonical 307-GEO projection</p>
        </div>
        <span className={`${styles.status} ${statusClass(passport.currentConclusion.legalTruthColor)}`}>
          {passport.currentConclusion.legalTruthColor}
        </span>
      </div>

      <section className={styles.current} aria-labelledby="passport-current-conclusion">
        <h3 id="passport-current-conclusion">Current legal conclusion</h3>
        <strong>{passport.currentConclusion.label}</strong>
        <p>{passport.currentConclusion.summary}</p>
        <dl className={styles.definitionGrid}>
          <div><dt>Confidence</dt><dd>{passport.currentConclusion.confidence}</dd></div>
          <div><dt>Map display</dt><dd>{passport.currentConclusion.display.color} · {passport.currentConclusion.display.basis}</dd></div>
          <div><dt>Versioned at</dt><dd>{formatDate(passport.version.generatedAt)}</dd></div>
          <div><dt>Current status free</dt><dd>Yes</dd></div>
        </dl>
        {passport.currentConclusion.display.isResearchDirection ? <p className={styles.warning}>The map display is labelled research direction, not a confirmed legal conclusion.</p> : null}
      </section>

      <section className={styles.section}>
        <h3>Scope and applicability</h3>
        <dl className={styles.definitionGrid}>
          <div><dt>Rule</dt><dd><code>{passport.scope.ruleId}</code></dd></div>
          <div><dt>Source coverage</dt><dd>{passport.scope.sourceCoverage}</dd></div>
          <div><dt>Apply state</dt><dd>{passport.scope.applyState}</dd></div>
        </dl>
        <p>{passport.scope.rationale}</p>
      </section>

      <section className={styles.section}>
        <h3>Current official citations</h3>
        <p className={styles.hint}>Titles, URLs and publishers are selected from the map popup and SEO panel. A repeated metadata block under a different official URL is withheld until its source record is corrected rather than presented as jurisdiction-specific proof.</p>
        {exactCitations.length ? <ol className={styles.citations}>
          {exactCitations.map((citation) => <li key={citation.url}>
            <a href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title}</a>
            {citation.metadataIntegrity === "METADATA_COLLISION_REQUIRES_REVIEW" ? <p className={styles.warning}>Conflicting reused metadata was withheld. The official source link remains available.</p> : <><p>{citation.publisher} · {citation.annotation || citation.role}</p>
              {citation.quote ? <blockquote>{citation.quote}</blockquote> : null}</>}
            <dl className={styles.definitionGrid}>
              <div><dt>Owner</dt><dd>{citation.sourceOwnerGeo}</dd></div>
              <div><dt>Applies to</dt><dd>{citation.appliesToGeos.join(", ") || "NOT_RECORDED"}</dd></div>
              <div><dt>Source type</dt><dd>{citation.sourceType}</dd></div>
              <div><dt>Effective state</dt><dd>{citation.effectiveState}</dd></div>
            </dl>
            <small>Checked: {formatDate(citation.checkedAt)} · {citation.revalidationState} · {citation.accessState}</small>
          </li>)}
        </ol> : <p className={styles.warning}>No selected official citation is retained for this record.</p>}
        {extendedCitations.length ? <details className={styles.retainedSources}>
          <summary>Additional retained official source records ({extendedCitations.length})</summary>
          <p className={styles.hint}>These provenance records extend the Passport; they do not create another current legal conclusion.</p>
          <ol className={styles.citations}>{extendedCitations.map((citation) => <li key={citation.url}>
            <a href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title}</a>
            {citation.metadataIntegrity === "METADATA_COLLISION_REQUIRES_REVIEW" ? <p className={styles.warning}>Conflicting reused metadata was withheld. The official source link remains available.</p> : <><p>{citation.publisher} · {citation.role}</p>
              {citation.quote ? <blockquote>{citation.quote}</blockquote> : null}</>}
            <small>Checked: {formatDate(citation.checkedAt)} · {citation.revalidationState} · {citation.accessState}</small>
          </li>)}</ol>
        </details> : null}
      </section>

      <section className={styles.section}>
        <h3>Freshness and change boundary</h3>
        <dl className={styles.definitionGrid}>
          <div><dt>Retained official sources</dt><dd>{passport.sourceFreshness.retainedOfficialSourceCount}</dd></div>
          <div><dt>Latest source check</dt><dd>{formatDate(passport.sourceFreshness.latestCheckedAt)}</dd></div>
          <div><dt>Source change detected</dt><dd>{formatDate(passport.sourceFreshness.latestSourceChangeDetectedAt)}</dd></div>
          <div><dt>Review opened</dt><dd>{formatDate(passport.sourceFreshness.latestReviewOpenedAt)}</dd></div>
          <div><dt>Conclusion published</dt><dd>{formatDate(passport.sourceFreshness.canonicalConclusionPublishedAt)}</dd></div>
          <div><dt>Source events</dt><dd>{passport.sourceFreshness.changedSourceCount}</dd></div>
          <div><dt>Pending reviews</dt><dd>{passport.sourceFreshness.pendingReviewSourceCount}</dd></div>
          <div><dt>Metadata integrity reviews</dt><dd>{passport.sourceFreshness.metadataIntegrityReviewCount}</dd></div>
        </dl>
        <p>{passport.history.note}</p>
        <code className={styles.version}>{passport.history.entries[0].versionId}</code>
      </section>

      <section className={styles.section}>
        <h3>Read-only delivery</h3>
        <p className={styles.hint}>Both endpoints are local-only and return 404 for a non-local host. They expose the same current conclusion; neither writes Store Truth or Legal Truth.</p>
        <dl className={styles.endpointList}>
          <div><dt>JSON export</dt><dd><a href={passport.delivery.jsonExport}>{relativeUrl(passport.delivery.jsonExport, origin)}</a></dd></div>
          <div><dt>Embed card</dt><dd><a href={passport.delivery.embedCard}>{relativeUrl(passport.delivery.embedCard, origin)}</a></dd></div>
          <div><dt>Print / Save as PDF</dt><dd><a href={passport.delivery.printDocument}>{relativeUrl(passport.delivery.printDocument, origin)}</a></dd></div>
          <div><dt>Why no leaf?</dt><dd><Link href={`/truth-map/evidence-passport/why-no-leaf?geo=${encodeURIComponent(passport.geo)}`}>Open Store Truth gate explanation</Link></dd></div>
          <div><dt>Correction request</dt><dd><Link href={`/truth-map/evidence-passport/correction?geo=${encodeURIComponent(passport.geo)}`}>Submit an untrusted evidence candidate</Link></dd></div>
          <div><dt>Editorial localisations</dt><dd><Link href={`/api/truth-map/b2b/localisations?geo=${encodeURIComponent(passport.geo)}`}>Open approved-localisation manifest</Link></dd></div>
        </dl>
        <p className={styles.hint}>Passport SHA-256: <code>{passport.integrity.payloadSha256}</code></p>
        <pre className={styles.embed} data-testid="evidence-passport-embed-snippet">{localEmbed}</pre>
      </section>
    </section>
  );
}

export default async function EvidencePassportPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "127.0.0.1:3000";
  if (!isLocalAuditHost(host)) notFound();
  const origin = `http://${host}`;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedGeo = typeof resolvedSearchParams.geo === "string" ? resolvedSearchParams.geo.trim().toUpperCase() : "";
  const requestedWatchlist = readWatchlist(resolvedSearchParams.watch);
  const { passports, version } = buildEvidencePassportCollection(origin);
  const selected = requestedGeo ? passports.find((passport) => passport.geo === requestedGeo) : passports[0];
  if (!selected) notFound();
  let monitor: ReturnType<typeof buildChangeMonitor> | null = null;
  let watchlistError: string | null = null;
  try {
    monitor = buildChangeMonitor({ origin, geos: requestedWatchlist });
  } catch (error) {
    watchlistError = error instanceof Error ? error.message : "CHANGE_MONITOR_INVALID_WATCHLIST";
  }
  const monitorQuery = monitor?.watchlist.mode === "EXPLICIT_GEOS"
    ? `?${monitor.watchlist.geos.map((geo) => `geo=${encodeURIComponent(geo)}`).join("&")}`
    : "";
  const eventPreview = monitor ? [
    ...monitor.sourceChanges,
    ...monitor.pendingReviews,
    ...monitor.canonicalLegalConclusionChanges
  ].slice(0, 8) : [];

  return (
    <main className={styles.page} data-testid="evidence-passport-page">
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Local-only · complete 307-GEO evidence collection</p>
        <h1>Global cannabis law evidence infrastructure</h1>
        <p>Current legal status, official sources, scope, review boundary and reusable proof — jurisdiction by jurisdiction. This is not a dispensary directory, lead database or paid map placement.</p>
        <div className={styles.pillRow}>
          <span>307/307 canonical GEO</span><span>Version {version.id}</span><span>Read-only · no billing</span>
        </div>
      </section>

      <section className={styles.designPartners} aria-label="Evidence infrastructure surfaces">
        <article><strong>Evidence Passport</strong><span>Complete source-bound legal proof for every canonical jurisdiction.</span></article>
        <article><strong>Freshness and change</strong><span>Source events, pending review and canonical legal change remain separate.</span></article>
        <article><strong>Reusable delivery</strong><span>Deterministic JSON, script-free embed and print/PDF representations.</span></article>
      </section>

      <section className={styles.controls}>
        <form method="get">
          <label htmlFor="passport-geo">Demonstrate a jurisdiction</label>
          <select id="passport-geo" name="geo" defaultValue={selected.geo}>
            {passports.map((passport) => <option key={passport.geo} value={passport.geo}>{passport.territory} ({passport.geo})</option>)}
          </select>
          <button type="submit">Open Evidence Passport</button>
          <label htmlFor="watchlist">Change Monitor watchlist (optional canonical GEO codes)</label>
          <input id="watchlist" name="watch" defaultValue={requestedWatchlist.join(", ")} placeholder="AD, MN, US-CA" spellCheck={false} />
        </form>
        <div className={styles.monitor} data-testid="change-monitor-summary">
          <strong>Change Monitor</strong>
          {monitor ? <>
            <span>{monitor.watchlist.mode === "EXPLICIT_GEOS" ? `${monitor.summary.geosWatched} watched GEO` : "all 307 GEO"}</span>
            {monitor.watchlist.mode === "EXPLICIT_GEOS" ? <span>Watchlist: {monitor.watchlist.geos.join(", ")}</span> : <span>Watchlist: all canonical jurisdictions</span>}
            <span>{monitor.summary.sourceChanges} source events</span>
            <span>{monitor.summary.pendingReviews} pending reviews</span>
            <span>{monitor.summary.canonicalLegalConclusionChanges} canonical legal-conclusion changes</span>
            <small>{monitor.canonicalComparison.note}</small>
            <a href={`/api/truth-map/b2b/change-monitor${monitorQuery}`}>Open read-only monitor JSON</a>
          </> : null}
          <Link href="/api/truth-map/b2b/manifest">Open 307-GEO delivery manifest</Link>
          <Link href="/api/truth-map/b2b/snapshot-ledger">Open immutable snapshot ledger</Link>
          <Link href="/truth-map/evidence-passport/changelog">Open professional changelog</Link>
          {watchlistError ? <p className={styles.warning} data-testid="watchlist-rejected">Unknown GEO input was rejected: {watchlistError}. No watchlist data was returned.</p> : null}
          {monitor && eventPreview.length ? <details>
            <summary>Preview recorded monitor events ({eventPreview.length})</summary>
            <ul>{eventPreview.map((event) => <li key={`${event.kind}:${event.geo}:${event.sourceUrl}`}><strong>{event.kind}</strong> · {event.territory}{event.sourceTitle ? ` — ${event.sourceTitle}` : ""}</li>)}</ul>
          </details> : monitor ? <small>No retained source or canonical-change events are currently recorded for this watchlist.</small> : null}
        </div>
      </section>

      <PassportDetail passport={selected} origin={origin} />

      <aside className={styles.boundaries}>
        <strong>Non-negotiable boundaries</strong>
        <ul>
          <li>No paid leaf, ranking, map position or verified badge.</li>
          <li>Current status, material limits and primary official links remain free.</li>
          <li>No commercial listing source becomes legal or Store Truth.</li>
          <li>No production AI/Social, Google Ads or payment integration belongs to this MVP.</li>
        </ul>
      </aside>
    </main>
  );
}
