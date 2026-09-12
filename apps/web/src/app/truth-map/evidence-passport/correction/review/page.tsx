import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocalAuditHost } from "@/lib/privateAuditHost";
import { buildCorrectionReviewQueueSnapshot, correctionSourceReviewRegistrySha256 } from "@/truth-map/correctionRequest";
import CorrectionReviewQueue from "./CorrectionReviewQueue";
import styles from "../../EvidencePassport.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Correction review queue — Local evidence operations", robots: { index: false, follow: false } };

export default async function CorrectionReviewPage() {
  const host = (await headers()).get("host") || "127.0.0.1:3000";
  if (!isLocalAuditHost(host)) notFound();
  const snapshot = buildCorrectionReviewQueueSnapshot();
  return <main className={styles.page} data-testid="correction-review-page">
    <section className={styles.hero}><p className={styles.eyebrow}>Local-only · fail-closed operations</p><h1>Correction review queue</h1><p>Assignment, evidence decision and outcome are append-only. Approval only marks a candidate as awaiting a separate manual canonical handoff; it creates no canonical review operation and never applies a legal, Store, coordinate, leaf, position or ranking change.</p></section>
    <section className={styles.controls}><CorrectionReviewQueue
      initialQueue={snapshot.queue}
      initialReviewEventsSha256={snapshot.reviewEventsSha256}
      initialSourceReviewRegistrySha256={correctionSourceReviewRegistrySha256()}
    /></section>
    <aside className={styles.boundaries}><Link href="/truth-map/evidence-passport/correction">Submit a candidate</Link> · <Link href="/truth-map/evidence-passport">Back to Evidence Passport</Link></aside>
  </main>;
}
