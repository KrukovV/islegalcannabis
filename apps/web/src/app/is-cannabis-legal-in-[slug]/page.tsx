import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ResultCard from "@/components/ResultCard";
import SimpleTermsStatic from "@/components/SimpleTermsStatic";
import { TOP25 } from "@islegal/shared";
import { getStaticLawProfile } from "@/laws/registry";
import { buildExplanationInput } from "@/lib/explanation";
import { buildFallbackText } from "@/lib/ai/paraphrase";
import styles from "./seo.module.css";
import { buildResultViewModel } from "@/lib/resultViewModel";

export const dynamic = "force-static";

export function generateStaticParams() {
  return TOP25.map((entry) => entry.slug).sort().map((slug) => ({ slug }));
}

export function generateMetadata({
  params
}: {
  params: { slug: string };
}): Metadata {
  const entry = TOP25.find((item) => item.slug === params.slug);
  if (!entry) {
    return { title: "Jurisdiction not found" };
  }

  const title = `Is cannabis legal in ${entry.displayName}?`;
  const description =
    "Educational summary of local cannabis laws. Not legal advice.";

  return { title, description };
}

export default function SeoResultPage({
  params
}: {
  params: { slug: string };
}) {
  const entry = TOP25.find((item) => item.slug === params.slug);
  if (!entry) notFound();

  const profile = getStaticLawProfile({
    country: entry.country,
    region: entry.region
  });

  if (!profile) notFound();

  const { status, bullets, risksText } = buildExplanationInput(profile);
  const fallbackText = buildFallbackText({
    profile,
    status,
    bullets,
    risksText,
    locale: "en"
  });
  const viewModel = buildResultViewModel({
    profile,
    title: entry.displayName
  });

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <ResultCard
          profile={profile}
          title={entry.displayName}
          kicker="Educational summary"
          subtitle="Clear, up-to-date cannabis laws by location. No advice. Just facts."
          isPaidUser={false}
          maxBullets={6}
          showRisks={true}
          showSources={true}
          showPdf={false}
          showUpgradePrompt={false}
          showLocationMeta={false}
          viewModel={viewModel}
          simpleTerms={<SimpleTermsStatic text={fallbackText} />}
        />
        <div className={styles.cta}>
          <Link className={styles.ctaLink} href="/">
            Open interactive check
          </Link>
        </div>
      </div>
    </main>
  );
}
