import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaticLawProfile } from "@/laws/registry";
import StatusBadge from "@/components/StatusBadge";
import { STATUS_BANNERS } from "@islegal/shared";
import styles from "./seo.module.css";
import { SEO_MAP } from "@/lib/seo/seoMap.generated";
import { getSeoEntryBySlug, parseJurisdictionKey } from "@/lib/seo/seoMap";
import { buildFaqJsonLd, buildWeedSeo, buildBreadcrumbs } from "@/lib/seo/seoContent";
import { buildExtrasCards } from "@/lib/extras";

export const dynamic = "force-static";

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

  const canonical = `/is-weed-legal-in-${entry.slug}`;
  const title = `Is weed legal in ${entry.displayName}?`;
  const description =
    "Educational summary of local cannabis laws. Not legal advice.";

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        en: canonical
      }
    }
  };
}

export default function SeoResultPage({
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

  const seo = buildWeedSeo(profile);
  const extrasCards = buildExtrasCards(profile, 3);
  const faqJsonLd = buildFaqJsonLd({
    title: `Is weed legal in ${entry.displayName}?`,
    status: seo.status.label,
    bullets: seo.bullets,
    risks: seo.risks
  });
  const breadcrumbs = buildBreadcrumbs({
    place: entry.displayName,
    placeHref: `/is-weed-legal-in-${entry.slug}`,
    current: "Weed"
  });

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <section className={styles.card}>
          <p className={styles.kicker}>Educational summary</p>
          <h1>{`Is weed legal in ${entry.displayName}?`}</h1>
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
          {extrasCards.length > 0 ? (
            <div className={styles.section} data-testid="seo-extras">
              <h2>Key extras</h2>
              <div className={styles.extrasCards}>
                {extrasCards.map((card) => (
                  <div
                    key={card.key}
                    className={styles.extrasCard}
                    data-testid="seo-extras-card"
                  >
                    <div className={styles.extrasCardHeader}>
                      <span className={styles.extrasCardTitle}>
                        {card.title}
                      </span>
                      <span className={styles.extrasCardValue}>
                        {card.value}
                      </span>
                    </div>
                    <p className={styles.extrasCardBody}>{card.whyMatters}</p>
                    <p className={styles.extrasCardHint}>
                      {card.userActionHint}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className={styles.section} data-testid="sources">
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
            <h2>Related forms</h2>
            <ul className={styles.links}>
              <li>
                <Link href={`/is-cbd-legal-in-${entry.slug}`}>CBD</Link>
              </li>
              <li>
                <Link href={`/are-edibles-legal-in-${entry.slug}`}>Edibles</Link>
              </li>
              <li>
                <Link href={`/are-vapes-legal-in-${entry.slug}`}>Vapes</Link>
              </li>
              <li>
                <Link href={`/are-concentrates-legal-in-${entry.slug}`}>
                  Concentrates
                </Link>
              </li>
            </ul>
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
