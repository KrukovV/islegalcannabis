import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocalAuditHost } from "@/lib/privateAuditHost";
import { buildStoreLeafTransparencyCollection } from "@/truth-map/storeLeafTransparency";
import styles from "../EvidencePassport.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Why no leaf? — Local Store Truth transparency", robots: { index: false, follow: false } };

const LABELS = {
  LEGAL_OR_STORE_TYPE: "Legal access or store-type eligibility",
  LIFECYCLE: "Licence, operating or current-source lifecycle",
  OFFICIAL_ADDRESS: "Complete official public address",
  AUTHORITATIVE_COORDINATE: "Exact authoritative coordinate",
  OFFICIAL_SOURCE: "Official source, identity or provenance"
} as const;

export default async function WhyNoLeafPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const host = (await headers()).get("host") || "127.0.0.1:3000";
  if (!isLocalAuditHost(host)) notFound();
  const params = searchParams ? await searchParams : {};
  const requestedGeo = typeof params.geo === "string" ? params.geo.trim().toUpperCase() : "";
  const collection = buildStoreLeafTransparencyCollection();
  const row = requestedGeo ? collection.rows.find((candidate) => candidate.geo === requestedGeo) : collection.rows.find((candidate) => candidate.blockedRecords > 0);
  if (!row) notFound();
  return <main className={styles.page} data-testid="why-no-leaf-page">
    <section className={styles.hero}>
      <p className={styles.eyebrow}>Local-only · Store Truth transparency</p>
      <h1>Why is there no leaf?</h1>
      <p>A missing map marker is a fail-closed publication decision, not evidence that no cannabis business exists.</p>
      <div className={styles.pillRow}><span>{collection.summary.savedRecords} saved</span><span>{collection.summary.visibleLeaves} visible</span><span>{collection.summary.blockedRecords} blocked</span></div>
    </section>
    <section className={styles.controls}>
      <form method="get">
        <label htmlFor="leaf-geo">Jurisdiction</label>
        <select id="leaf-geo" name="geo" defaultValue={row.geo}>{collection.rows.map((candidate) => <option key={candidate.geo} value={candidate.geo}>{candidate.territory} ({candidate.geo})</option>)}</select>
        <button type="submit">Explain this jurisdiction</button>
      </form>
    </section>
    <section className={styles.passport} data-testid="why-no-leaf-detail" data-geo={row.geo}>
      <div className={styles.passportHeader}><div><p className={styles.eyebrow}>Store publication gate</p><h2>{row.territory}</h2><p className={styles.geo}>{row.geo}</p></div></div>
      <section className={styles.section}>
        <dl className={styles.definitionGrid}><div><dt>Saved records</dt><dd>{row.savedRecords}</dd></div><div><dt>Visible leaves</dt><dd>{row.visibleLeaves}</dd></div><div><dt>Blocked records</dt><dd>{row.blockedRecords}</dd></div><div><dt>Multiple gate groups</dt><dd>{row.blockedByMultipleCategories}</dd></div></dl>
        <p className={styles.warning}>{row.interpretation}</p>
      </section>
      <section className={styles.section}><h3>Fail-closed reason groups</h3><p className={styles.hint}>One retained record can have more than one blocker, so category counts are not added as a distinct-store total.</p><dl className={styles.definitionGrid}>{Object.entries(row.blockedByCategory).map(([category, count]) => <div key={category}><dt>{LABELS[category as keyof typeof LABELS]}</dt><dd>{count}</dd></div>)}</dl></section>
      <section className={styles.section}><h3>Privacy boundary</h3><p>No hidden exact location, individual record identity, owner contact or inferred operating status is exposed here.</p><p><Link href={`/api/truth-map/b2b/why-no-leaf/${row.geo.toLowerCase()}`}>Open read-only aggregate JSON</Link></p><p><Link href={`/truth-map/evidence-passport?geo=${encodeURIComponent(row.geo)}`}>Back to Evidence Passport</Link></p></section>
    </section>
  </main>;
}
