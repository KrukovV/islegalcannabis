import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaticLawProfile } from "@/laws/registry";
import StatusBadge from "@/components/StatusBadge";
import { STATUS_BANNERS } from "@islegal/shared";
import styles from "../is-cannabis-legal-in-[slug]/seo.module.css";
import { SEO_MAP } from "@/lib/seo/seoMap.generated";
import { getSeoEntryBySlug, parseJurisdictionKey } from "@/lib/seo/seoMap";
import { buildExtrasSeo, buildFaqJsonLd, buildBreadcrumbs } from "@/lib/seo/seoContent";

export const dynamic = "force-static";

const EXTRA_KEY = "vapes";
const EXTRA_LABEL = "Vapes";

export function generateStaticParams() {
  return SEO_MAP.map((entry) => entry.slug).sort().map((slug) => ({ slug }));
}

export function generateMetadata({
  params
}: {
  params: { slug: string };
}): Metadata {
  const entry = getSeoEntryBySlug(params.slug);
  if (!entry) {
    return { title: "Jurisdiction not found" };
  }

  const canonical = `/are-vapes-legal-in-${entry.slug}`;
  return {
    title: `Are ${EXTRA_LABEL.toLowerCase()} legal in ${entry.displayName}?`,
    description: "Educational summary of local cannabis laws. Not legal advice.",
    alternates: {
      canonical,
      languages: {
        en: canonical
      }
    }
  };
}

export default function VapesSeoPage({
  params
}: {
  params: { slug: string };
}) {
  const entry = getSeoEntryBySlug(params.slug);
  if (!entry) notFound();

  const { country, region } = parseJurisdictionKey(entry.jurisdictionKey);
  const profile = getStaticLawProfile({
    country,
    region
  });

  if (!profile) notFound();

  const seo = buildExtrasSeo(profile, EXTRA_KEY, EXTRA_LABEL);
  const faqJsonLd = buildFaqJsonLd({
    title: `Are ${EXTRA_LABEL.toLowerCase()} legal in ${entry.displayName}?`,
    status: seo.status.label,
    bullets: seo.bullets,
    risks: seo.risks
  });
  const breadcrumbs = buildBreadcrumbs({
    place: entry.displayName,
    placeHref: `/is-weed-legal-in-${entry.slug}`,
    current: EXTRA_LABEL
  });

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <section className={styles.card}>
          <p className={styles.kicker}>Educational summary</p>
          <h1>{`Are ${EXTRA_LABEL.toLowerCase()} legal in ${entry.displayName}?`}</h1>
          <p className={styles.subtitle}>
            Official sources summary only. Not legal advice.
          </p>
          <nav className={styles.breadcrumbs}>
            {breadcrumbs.map((item) => (
              <Link key={item.label} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className={styles.section}>
            <h2>Status</h2>
            <StatusBadge level={seo.status.level} label={seo.status.label} />
            {profile.status === "provisional" ? (
              <p className={styles.updated}>
                {STATUS_BANNERS.provisional.body}
              </p>
            ) : null}
            {profile.status === "needs_review" ? (
              <p className={styles.updated}>
                {STATUS_BANNERS.needs_review.body}
              </p>
            ) : null}
          </div>
          <div className={styles.section}>
            <h2>Facts</h2>
            <ul className={styles.bullets}>
              {seo.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className={styles.section}>
            <h2>Key risks</h2>
            <ul className={styles.risks}>
              {seo.risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          </div>
          <div className={styles.section}>
            <h2>Sources</h2>
            <p className={styles.updated}>
              Verified: {profile.verified_at ?? "Not verified"}
            </p>
            <ul className={styles.sources}>
              {profile.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                </li>
              ))}
            </ul>
            <p className={styles.updated}>Educational only. Not legal advice.</p>
          </div>
          <div className={styles.section}>
            <Link href={`/is-weed-legal-in-${entry.slug}`}>
              Back to cannabis legality in {entry.displayName}
            </Link>
          </div>
        </section>
        <div className={styles.cta}>
          <Link className={styles.ctaLink} href="/">
            Open interactive check
          </Link>
        </div>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </main>
  );
}
