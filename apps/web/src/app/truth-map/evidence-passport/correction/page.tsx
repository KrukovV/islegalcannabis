import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocalAuditHost } from "@/lib/privateAuditHost";
import { buildEvidencePassportCollection } from "@/truth-map/evidencePassport";
import CorrectionRequestForm from "./CorrectionRequestForm";
import styles from "../EvidencePassport.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Correction request — Local evidence candidate", robots: { index: false, follow: false } };

export default async function CorrectionRequestPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const host = (await headers()).get("host") || "127.0.0.1:3000";
  if (!isLocalAuditHost(host)) notFound();
  const params = searchParams ? await searchParams : {};
  const passports = buildEvidencePassportCollection().passports;
  const requested = typeof params.geo === "string" ? params.geo.trim().toUpperCase() : "";
  const initialGeo = passports.some((passport) => passport.geo === requested) ? requested : passports[0].geo;
  return <main className={styles.page} data-testid="correction-request-page">
    <section className={styles.hero}><p className={styles.eyebrow}>Local-only · untrusted candidate inbox</p><h1>Submit an evidence correction</h1><p>A licence or official source submitted here enters an independent review queue. It cannot automatically change a legal conclusion, Store record, coordinate, leaf, position or ranking.</p></section>
    <section className={styles.controls}><CorrectionRequestForm geos={passports.map(({ geo, territory }) => ({ geo, territory }))} initialGeo={initialGeo} /></section>
    <aside className={styles.boundaries}><strong>Receipt boundary</strong><ul><li>Submission is classified as untrusted.</li><li>Independent evidence review is mandatory.</li><li>No paid placement or verification is available.</li><li>No personal contact field is collected by this local prototype.</li></ul><Link href="/truth-map/evidence-passport/correction/review">Open review queue</Link> · <Link href={`/truth-map/evidence-passport?geo=${encodeURIComponent(initialGeo)}`}>Back to Evidence Passport</Link></aside>
  </main>;
}
