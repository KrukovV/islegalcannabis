import Link from "next/link";
import Script from "next/script";
import { getCannabisProfileCardSections } from "@/lib/cannabisProfile";
import { getLinkScope } from "@/lib/linkDisplayPolicy";
import { formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { getTruthMapRuntimeIdentity } from "@/app/truth-map/runtimeConfig";
import TruthMapLegalEvidence from "@/truth-map/TruthMapLegalEvidence";
import TruthMapRoot from "@/truth-map/TruthMapRoot";
import type { TruthMapCountryPageProjection } from "@/truth-map/truthMapCountryPage";
import { isTruthMapCurrentStatusAssertion } from "@/truth-map/truthMapRichCard";
import styles from "@/app/c/[code]/page.module.css";

/**
 * A map-detail view for a final-reconciliation GEO which has no legacy
 * country page. It deliberately stays outside the protected 311-URL sitemap,
 * but never falls back to a stale legal model when a public map link opens it.
 */
export default function TruthMapTerritorySeoPage({
  code,
  projection
}: {
  code: string;
  projection: TruthMapCountryPageProjection;
}) {
  const { properties, card } = projection;
  const runtimeIdentity = getTruthMapRuntimeIdentity();
  const visibleStamp = formatVisibleRuntimeStamp(runtimeIdentity);
  const profileSections = getCannabisProfileCardSections(card.cannabisProfile)
    .map((section) => ({ ...section, items: section.items.filter((item) => !isTruthMapCurrentStatusAssertion(item)) }))
    .filter((section) => section.items.length > 0);
  const supplementaryActions = [...card.panel.critical, ...card.panel.info];
  const renderLink = (href: string, label: string) => {
    const external = getLinkScope(href) === "external";
    if (!external && !href.startsWith("#")) return <Link href={href} className={styles.internalLink}>{label}</Link>;
    return <a href={href} className={external ? styles.externalLink : styles.internalLink} {...(external ? { target: "_blank", rel: "nofollow noopener noreferrer" } : {})}>{label}</a>;
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [{
      "@type": "Question",
      name: `Cannabis law in ${properties.displayName}`,
      acceptedAnswer: { "@type": "Answer", text: properties.legalEvidenceSummary }
    }]
  };

  return (
    <main className={styles.page}>
      <Script id={`truth-map-territory-faq-${code}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <TruthMapRoot
        countriesUrl="/api/public-map/countries"
        usStatesUrl="/api/public-map/us-states"
        visibleStamp={visibleStamp}
        runtimeIdentity={runtimeIdentity}
        initialGeoCode={properties.geo}
        initialGeoOpensPopup={false}
        presentation="public"
        showPublicMapNotice={false}
        bodyScroll="allow"
      />
      <article className={styles.article}>
        <section id="seo-content" className={styles.section}>
          <p className={styles.eyebrow}>Territory view</p>
          <h1 className={styles.title}>Cannabis law in {properties.displayName} — {properties.legalTruthColor}</h1>
          <p className={styles.intro}>{properties.legalEvidenceSummary}</p>
          <div className={styles.metaGrid}>
            <div className={styles.metaBlock}><p className={styles.metaLabel}>Current legal conclusion</p><p className={styles.metaText}>{properties.legalEvidenceIcon} {properties.legalTruthColor} · {properties.truthConfidence}</p></div>
            <div className={styles.metaBlock}><p className={styles.metaLabel}>Evidence status</p><p className={styles.metaText}>{properties.legalEvidenceLabel}</p></div>
            <div className={styles.metaBlock}><p className={styles.metaLabel}>Map display</p><p className={styles.metaText}>{properties.displayIsResearchDirection ? `Research direction ${properties.truthMapDisplayColor}` : `Legal verdict ${properties.truthMapDisplayColor}`}</p></div>
            <div className={styles.metaBlock}><p className={styles.metaLabel}>Final-reconciliation rule</p><p className={styles.metaText}>{properties.truthRuleId}</p></div>
          </div>
        </section>
        <section id="law-status-explanation" className={styles.section}>
          <h2>Current legal conclusion, citations and annotations</h2>
          <TruthMapLegalEvidence properties={properties} auditOnly={false} testId="territory-page-current-legal-evidence" />
        </section>
        {supplementaryActions.length > 0 ? (
          <section id="law-recreational" className={styles.section}>
            <h2>Supplementary action-specific context — not the current legal conclusion</h2>
            <ul className={styles.factsList}>
              {supplementaryActions.map((item) => <li key={item.id}>{item.text}{item.sourceUrl ? <> {renderLink(item.sourceUrl, "Source")}</> : null}</li>)}
            </ul>
          </section>
        ) : null}
        {profileSections.length > 0 ? (
          <section id="cannabis-profile" className={styles.section}>
            <h2>Retained historical and profile context — not the current legal conclusion</h2>
            {card.cannabisProfile?.sourceUrl ? <p className={styles.intro}>{renderLink(card.cannabisProfile.sourceUrl, card.cannabisProfile.sourceTitle || "Profile source")}</p> : null}
            {profileSections.map((section) => <div key={section.id}><h3 className={styles.subheading}>{section.heading}</h3><ul className={styles.factsList}>{section.items.map((item) => <li key={`${section.id}-${item}`}>{item}</li>)}</ul></div>)}
          </section>
        ) : null}
        {card.sources.length > 0 ? (
          <section className={styles.section}>
            <h2>Retained supplementary source register</h2>
            <ul className={styles.factsList}>{card.sources.map((source) => <li key={source.id}>{renderLink(source.url, source.title)}</li>)}</ul>
          </section>
        ) : null}
      </article>
    </main>
  );
}
