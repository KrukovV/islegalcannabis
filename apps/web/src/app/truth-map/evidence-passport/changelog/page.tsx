import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocalAuditHost } from "@/lib/privateAuditHost";
import { buildChangeMonitor, type ChangeMonitorEvent } from "@/truth-map/changeMonitor";
import styles from "../EvidencePassport.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Professional legal changelog — Local evidence monitor", robots: { index: false, follow: false } };

function readWatchlist(value: string | string[] | undefined) {
  return (typeof value === "string" ? value.split(",") : []).map((geo) => geo.trim()).filter(Boolean);
}

function eventList(title: string, explanation: string, events: ChangeMonitorEvent[]) {
  return <section className={styles.section}><h2>{title}</h2><p className={styles.hint}>{explanation}</p>{events.length ? <ol className={styles.citations}>{events.map((event) => <li key={`${event.kind}:${event.geo}:${event.currentEvidenceIdentity}`}><strong>{event.geo} · {event.territory}</strong><p>{event.detail}</p><dl className={styles.definitionGrid}><div><dt>Event time</dt><dd>{event.occurredAt || "NOT_RECORDED"}</dd></div><div><dt>Source checked</dt><dd>{event.sourceCheckedAt || "NOT_RECORDED"}</dd></div><div><dt>Previous identity</dt><dd>{event.previousEvidenceIdentity || "NOT_RECORDED"}</dd></div><div><dt>Current identity</dt><dd>{event.currentEvidenceIdentity}</dd></div></dl><small>{event.boundary}</small></li>)}</ol> : <p>No events in this class for the selected Watchlist.</p>}</section>;
}

export default async function ChangelogPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const host = (await headers()).get("host") || "127.0.0.1:3000";
  if (!isLocalAuditHost(host)) notFound();
  const params = searchParams ? await searchParams : {};
  const geos = readWatchlist(params.watch);
  let monitor: ReturnType<typeof buildChangeMonitor> | null = null;
  let error = "";
  try {
    monitor = buildChangeMonitor({ origin: `http://${host}`, geos });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "CHANGE_MONITOR_INVALID_WATCHLIST";
  }
  return <main className={styles.page} data-testid="professional-changelog-page">
    <section className={styles.hero}><p className={styles.eyebrow}>Local-only · append-only canonical projection history</p><h1>Professional legal changelog</h1><p>Source activity, pending review and a published canonical legal-conclusion change are different events. One never silently becomes another.</p></section>
    <section className={styles.controls}><form method="get"><label htmlFor="changelog-watch">Canonical GEO Watchlist</label><input id="changelog-watch" name="watch" defaultValue={geos.join(", ")} placeholder="AD, MN, US-CA" /><button type="submit">Filter changelog</button></form>{error ? <p className={styles.warning} data-testid="changelog-watchlist-rejected">{error}. No changelog data was returned.</p> : null}</section>
    {monitor ? <>
      <section className={styles.passport} data-testid="professional-changelog-summary"><div className={styles.passportHeader}><div><p className={styles.eyebrow}>{monitor.watchlist.mode}</p><h2>{monitor.summary.geosWatched} GEO monitored</h2></div></div><section className={styles.section}><dl className={styles.definitionGrid}><div><dt>Source changes</dt><dd>{monitor.summary.sourceChanges}</dd></div><div><dt>Pending reviews</dt><dd>{monitor.summary.pendingReviews}</dd></div><div><dt>Canonical changes</dt><dd>{monitor.summary.canonicalLegalConclusionChanges}</dd></div><div><dt>Previous baseline</dt><dd>{monitor.canonicalComparison.previousVersionId || "NOT_RECORDED"}</dd></div></dl><p>{monitor.canonicalComparison.note}</p></section>
      {eventList("Source changes", "A content, owner or final-URL signal. It does not change Legal Truth.", monitor.sourceChanges)}
      {eventList("Pending reviews", "A semantic, visual, effective-date or access review queue. It is not a legal conclusion.", monitor.pendingReviews)}
      {eventList("Canonical legal-conclusion changes", "Only a difference between two retained canonical projection versions may appear here.", monitor.canonicalLegalConclusionChanges)}</section>
    </> : null}
    <aside className={styles.boundaries}><Link href="/truth-map/evidence-passport">Back to Evidence Passport</Link> · <Link href="/api/truth-map/b2b/snapshot-ledger">Open immutable snapshot ledger</Link></aside>
  </main>;
}
