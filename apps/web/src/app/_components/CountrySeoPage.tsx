import Script from "next/script";
import Link from "next/link";
import {
  computeCountryHashes,
  stripCountryPageHashes,
  type CountryPageData,
} from "@/lib/countryPageStorage";
import { getCannabisProfileCardSections } from "@/lib/cannabisProfile";
import { formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { getLocalizedCountryName, getSeoText, type SeoLocale } from "@/lib/seo/i18n";
import { sanitizeEvidenceQuoteText } from "@/lib/text/sanitizeEvidenceQuoteText";
import { getLinkScope, isSameLink } from "@/lib/linkDisplayPolicy";
import TruthMapRoot from "@/truth-map/TruthMapRoot";
import TruthMapLegalEvidence from "@/truth-map/TruthMapLegalEvidence";
import { getTruthMapRuntimeIdentity } from "@/app/truth-map/runtimeConfig";
import {
  getTruthMapCountryPageProjection,
  type TruthMapCountryPageProjection
} from "@/truth-map/truthMapCountryPage";
import { isTruthMapCurrentStatusAssertion } from "@/truth-map/truthMapRichCard";
import styles from "@/app/c/[code]/page.module.css";
export { sanitizeEvidenceQuoteText };

export function getCountrySeoTitle(
  data: CountryPageData,
  locale: SeoLocale
) {
  const seo = getSeoText(locale);
  const name = data.node_type === "country" ? getLocalizedCountryName(data, locale) : data.name;
  return seo.title(name);
}

export function ensureCountryPageHash(data: CountryPageData) {
  const expected = computeCountryHashes(stripCountryPageHashes(data));
  if (expected.model_hash === data.hashes.model_hash) return;
  const message = `COUNTRY_PAGE_HASH_MISMATCH:${data.code}`;
  if (typeof process?.stderr?.write === "function") {
    process.stderr.write(`${message}\n`);
    return;
  }
  console.warn(message);
}

export function getSafeSeoCountryData(data: CountryPageData): CountryPageData {
  return {
    ...data,
    notes_raw: sanitizeEvidenceQuoteText(data.notes_raw),
    notes_normalized: sanitizeEvidenceQuoteText(data.notes_normalized)
  };
}

export default function CountrySeoPage({
  data,
  locale,
  query: _query,
  truthMapProjection = getTruthMapCountryPageProjection(data)
}: {
  data: CountryPageData;
  locale: SeoLocale;
  query: string | null;
  truthMapProjection?: TruthMapCountryPageProjection | null;
}) {
  void _query;
  if (!truthMapProjection) {
    throw new Error(`TRUTH_MAP_COUNTRY_PAGE_PROJECTION_MISSING:${data.geo_code}`);
  }
  const seo = getSeoText(locale);
  const runtimeIdentity = getTruthMapRuntimeIdentity();
  const visibleStamp = formatVisibleRuntimeStamp(runtimeIdentity);
  const heading = getCountrySeoTitle(data, locale);
  const { properties, card } = truthMapProjection;
  const intro = properties.legalEvidenceSummary;
  const cannabisProfileSections = getCannabisProfileCardSections(card.cannabisProfile);
  const selfPath = `/c/${data.code}`;
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: heading,
        acceptedAnswer: {
          "@type": "Answer",
          text: intro
        }
      }
    ]
  };

  const humanFallback = {
    currentEvidence: "Current legal conclusion, citations and annotations",
    supplementaryAction: "Supplementary action-specific context — not the current legal conclusion",
    jurisdictionContext: "Jurisdiction and regulatory context — supplementary to current legal evidence",
    retainedContext: "Retained historical and profile context — not the current legal conclusion",
    supportingFacts: "Supporting operational facts — not a substitute for the current legal conclusion",
    retainedSourceRegister: "Retained supplementary source register"
  };

  const articleLinkClass = (href: string) => {
    return getLinkScope(href) === "project" ? styles.internalLink : styles.externalLink;
  };

  const articleLinkTarget = (href: string) => {
    if (getLinkScope(href) === "external") {
      return {
        target: "_blank" as const,
        rel: "nofollow noopener noreferrer"
      };
    }
    return {};
  };

  const renderArticleLink = (href: string, label: string) => {
    if (!href) return null;
    const className = articleLinkClass(href);
    const targetProps = articleLinkTarget(href);
    if (getLinkScope(href) === "project" && !href.startsWith("#")) {
      return (
        <Link href={href} className={className}>
          {label}
        </Link>
      );
    }
    return (
      <a href={href} className={className} {...targetProps}>
        {label}
      </a>
    );
  };

  const isSelfLink = (href: string) => isSameLink(href, selfPath, selfPath);
  const supplementaryActions = [...card.panel.critical, ...card.panel.info];
  const jurisdictionContext = Array.from(new Set([
    card.parentLawSummary,
    ...(card.jurisdictionContextNotes || [])
  ]
    .map((item) => sanitizeEvidenceQuoteText(String(item || "")).trim())
    .filter(Boolean)));
  const safeProfileSections = cannabisProfileSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !isTruthMapCurrentStatusAssertion(item))
    }))
    .filter((section) => section.items.length > 0);
  const supportingFacts = [
    data.facts.possession_limit ? `${seo.possession}: ${data.facts.possession_limit}` : null,
    data.facts.cultivation ? `${seo.cultivation}: ${data.facts.cultivation}` : null,
    data.facts.penalty ? `${seo.penalty}: ${data.facts.penalty}` : null
  ].filter((item): item is string => Boolean(item));

  return (
    <main className={styles.page}>
      <Script
        id={`country-seo-faq-${data.code}-${locale}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <TruthMapRoot
        countriesUrl="/api/public-map/countries"
        usStatesUrl="/api/public-map/us-states"
        visibleStamp={visibleStamp}
        runtimeIdentity={runtimeIdentity}
        initialGeoCode={properties.geo}
        presentation="public"
        showPublicMapNotice={false}
        bodyScroll="allow"
      />
      <article className={styles.article}>
        <section id="seo-content" className={styles.section}>
          <p className={styles.eyebrow}>{data.node_type === "state" ? seo.statePrefix : seo.countryPrefix}</p>
          <h1 className={styles.title}>{heading}</h1>
          <p className={styles.intro}>{intro}</p>
          <div id="law-summary" className={styles.metaGrid}>
            <div className={styles.metaBlock}>
              <p className={styles.metaLabel}>Current legal conclusion</p>
              <p className={styles.metaText}>{properties.legalEvidenceIcon} {properties.legalTruthColor} · {properties.truthConfidence}</p>
            </div>
            <div className={styles.metaBlock}>
              <p className={styles.metaLabel}>Evidence status</p>
              <p className={styles.metaText}>{properties.legalEvidenceLabel}</p>
            </div>
            <div className={styles.metaBlock}>
              <p className={styles.metaLabel}>Map display</p>
              <p className={styles.metaText}>{properties.displayIsResearchDirection ? `Research direction ${properties.truthMapDisplayColor}` : `Legal verdict ${properties.truthMapDisplayColor}`}</p>
            </div>
            <div className={styles.metaBlock}>
              <p className={styles.metaLabel}>Final-reconciliation rule</p>
              <p className={styles.metaText}>{properties.truthRuleId}</p>
            </div>
          </div>
        </section>
        <section id="law-status-explanation" className={styles.section}>
          <h2>{humanFallback.currentEvidence}</h2>
          <TruthMapLegalEvidence properties={properties} auditOnly={false} testId="country-page-current-legal-evidence" />
        </section>
        {supplementaryActions.length > 0 ? (
          <section id="law-recreational" className={styles.section}>
            <h2>{humanFallback.supplementaryAction}</h2>
            <ul className={styles.factsList}>
              {supplementaryActions.map((item) => (
                <li key={item.id}>
                  {item.text}
                  {item.sourceUrl ? <>{" "}{renderArticleLink(item.sourceUrl, "Source")}</> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {jurisdictionContext.length > 0 ? (
          <section className={styles.section}>
            <h2>{humanFallback.jurisdictionContext}</h2>
            <ul className={styles.factsList}>
              {jurisdictionContext.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ) : null}
        {safeProfileSections.length > 0 ? (
          <section id="cannabis-profile" className={styles.section}>
            <h2>{humanFallback.retainedContext}</h2>
            {card.cannabisProfile?.sourceUrl ? <p className={styles.intro}>{renderArticleLink(card.cannabisProfile.sourceUrl, card.cannabisProfile.sourceTitle || "Profile source")}</p> : null}
            {safeProfileSections.map((section) => (
              <div key={section.id} id={`cannabis-profile-${section.id}`}>
                <h3 className={styles.subheading}>{section.heading}</h3>
                <ul className={styles.factsList}>
                  {section.items.map((item) => (
                    <li key={`${section.id}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ) : null}
        {supportingFacts.length > 0 ? (
          <section id="law-facts" className={styles.section}>
            <h2>{humanFallback.supportingFacts}</h2>
            <ul className={styles.factsList}>{supportingFacts.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        ) : null}
        {card.sources.length > 0 ? (
          <section id="law-source-register" className={styles.section}>
            <h2>{humanFallback.retainedSourceRegister}</h2>
            <ul className={styles.factsList}>
              {card.sources.map((source) => (
                <li key={source.id}>{renderArticleLink(source.url, source.title)}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <div id="law-border" />
        <section className={styles.section}>
          <h2>{seo.relatedPlaces}</h2>
          <ul className={styles.relatedList}>
            {data.related_names.map((item) => (
              <li key={item.code}>
                {!isSelfLink(`/c/${item.code}`) ? renderArticleLink(`/c/${item.code}`, item.name) : null}
              </li>
            ))}
          </ul>
        </section>
      </article>
    </main>
  );
}
