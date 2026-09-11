import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocalAuditHost } from "@/lib/privateAuditHost";
import { buildChangeMonitor, parseChangeMonitorWatchlistValues, type ChangeMonitorEvent, type SourceReviewHistoryEvent } from "@/truth-map/changeMonitor";
import styles from "../EvidencePassport.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Professional legal changelog — Local evidence monitor", robots: { index: false, follow: false } };

function readWatchInput(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value : value === undefined ? [] : [value])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(", ");
}

function eventList(title: string, explanation: string, events: ChangeMonitorEvent[]) {
  return <section className={styles.section}><h2>{title}</h2><p className={styles.hint}>{explanation}</p>{events.length ? <ol className={styles.citations}>{events.map((event) => <li key={`${event.kind}:${event.geo}:${event.currentEvidenceIdentity}`}><strong>{event.geo} · {event.territory}</strong><p>{event.detail}</p><dl className={styles.definitionGrid}><div><dt>Event time</dt><dd>{event.occurredAt || "NOT_RECORDED"}</dd></div><div><dt>Source checked</dt><dd>{event.sourceCheckedAt || "NOT_RECORDED"}</dd></div><div><dt>Review category</dt><dd>{event.reviewCategory || "NOT_APPLICABLE"}</dd></div><div><dt>Review outcome</dt><dd>{event.reviewOutcome || "NOT_APPLICABLE"}</dd></div><div><dt>Review operation</dt><dd>{event.reviewOperationId || "NOT_APPLICABLE"}</dd></div><div><dt>Previous identity</dt><dd>{event.previousEvidenceIdentity || "NOT_RECORDED"}</dd></div><div><dt>Current identity</dt><dd>{event.currentEvidenceIdentity}</dd></div></dl><small>{event.boundary}</small></li>)}</ol> : <p>No events in this class for the selected Watchlist.</p>}</section>;
}

function reviewHistory(events: SourceReviewHistoryEvent[]) {
  return <section className={styles.section}><h2>Append-only review operation history</h2><p className={styles.hint}>An operation remains visible after its current source signal is resolved. C1 reachability, HTTP 304, or byte equality never closes legal review; a close requires an explicit human evidence review and remains separate from any legal-conclusion change.</p>{events.length ? <ol className={styles.citations}>{events.map((event) => <li key={event.operationId}><strong>{event.geo} · {event.territory} · {event.eventKind}</strong><p><a href={event.sourceUrl}>{event.sourceUrl}</a></p><dl className={styles.definitionGrid}><div><dt>Opened</dt><dd>{event.openedAt}</dd></div><div><dt>Last source attempt</dt><dd>{event.lastAttemptAt}</dd></div><div><dt>Category</dt><dd>{event.category}</dd></div><div><dt>Initial outcome</dt><dd>{event.initialOutcome}</dd></div><div><dt>Resolved</dt><dd>{event.resolvedAt || "OPEN"}</dd></div><div><dt>Resolution</dt><dd>{event.resolutionOutcome || "OPEN"}</dd></div><div><dt>Reviewer</dt><dd>{event.resolutionReviewerId || "NOT_RECORDED"}</dd></div><div><dt>Resolution basis</dt><dd>{event.resolutionBasis || "NOT_RECORDED"}</dd></div><div><dt>Resolution evidence</dt><dd>{event.resolutionEvidenceUrl ? <a href={event.resolutionEvidenceUrl}>{event.resolutionEvidenceUrl}</a> : "NOT_RECORDED"}</dd></div><div><dt>Resolution note</dt><dd>{event.resolutionNote || "NOT_RECORDED"}</dd></div><div><dt>Resulting source state</dt><dd>{event.resultingRevalidationState || "NOT_RECORDED"}</dd></div></dl><small>{event.boundary}</small></li>)}</ol> : <p>No review operation exists for this Watchlist.</p>}</section>;
}

export default async function ChangelogPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const host = (await headers()).get("host") || "127.0.0.1:3000";
  if (!isLocalAuditHost(host)) notFound();
  const params = searchParams ? await searchParams : {};
  let geos: string[] = [];
  let monitor: ReturnType<typeof buildChangeMonitor> | null = null;
  let error = "";
  try {
    geos = parseChangeMonitorWatchlistValues({ geo: params.geo, watch: params.watch });
    monitor = buildChangeMonitor({ origin: `http://${host}`, geos });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "CHANGE_MONITOR_INVALID_WATCHLIST";
  }
  return <main className={styles.page} data-testid="professional-changelog-page">
    <section className={styles.hero}><p className={styles.eyebrow}>Local-only · append-only canonical projection history</p><h1>Professional legal changelog</h1><p>Source activity, pending review and a published canonical legal-conclusion change are different events. One never silently becomes another.</p></section>
    <section className={styles.controls}><form method="get"><label htmlFor="changelog-watch">Canonical GEO Watchlist</label><input id="changelog-watch" name="watch" defaultValue={readWatchInput(params.watch)} placeholder="AD, MN, US-CA" /><button type="submit">Filter changelog</button></form>{error ? <p className={styles.warning} data-testid="changelog-watchlist-rejected">{error}. No changelog data was returned.</p> : null}</section>
    {monitor ? <>
      <section className={styles.passport} data-testid="professional-changelog-summary"><div className={styles.passportHeader}><div><p className={styles.eyebrow}>{monitor.watchlist.mode}</p><h2>{monitor.summary.geosWatched} GEO monitored</h2></div></div><section className={styles.section}><dl className={styles.definitionGrid}><div><dt>Source changes</dt><dd>{monitor.summary.sourceChanges}</dd></div><div><dt>Pending reviews</dt><dd>{monitor.summary.pendingReviews}</dd></div><div><dt>Classified review events</dt><dd>{monitor.summary.classifiedReviewEvents}</dd></div><div><dt>Unclassified review events</dt><dd>{monitor.summary.unclassifiedReviewEvents}</dd></div><div><dt>Review operations</dt><dd>{monitor.summary.reviewOperations}</dd></div><div><dt>Open review operations</dt><dd>{monitor.summary.openReviewOperations}</dd></div><div><dt>Resolved review operations</dt><dd>{monitor.summary.resolvedReviewOperations}</dd></div><div><dt>Canonical changes</dt><dd>{monitor.summary.canonicalLegalConclusionChanges}</dd></div><div><dt>Previous baseline</dt><dd>{monitor.canonicalComparison.previousVersionId || "NOT_RECORDED"}</dd></div></dl><p>{monitor.canonicalComparison.note}</p></section>
      {eventList("Source changes", "A content, owner or final-URL signal. It does not change Legal Truth.", monitor.sourceChanges)}
      {eventList("Pending reviews", "A semantic, visual, effective-date or access review queue. It is not a legal conclusion.", monitor.pendingReviews)}
      {eventList("Canonical legal-conclusion changes", "Only a difference between two retained canonical projection versions may appear here.", monitor.canonicalLegalConclusionChanges)}
      {reviewHistory(monitor.reviewHistory)}</section>
    </> : null}
    <aside className={styles.boundaries}><Link href="/truth-map/evidence-passport">Back to Evidence Passport</Link> · <Link href="/api/truth-map/b2b/snapshot-ledger">Open immutable snapshot ledger</Link></aside>
  </main>;
}
