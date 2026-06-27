import Script from "next/script";
import Link from "next/link";
import NewMapClientEntry from "@/app/new-map/NewMapClientEntry";
import { getNewMapRuntimeIdentity } from "@/app/new-map/runtimeConfig";
import { buildSeoCountryIndex, computeCountryHashes, stripCountryPageHashes, type CountryPageData } from "@/lib/countryPageStorage";
import { deriveCountryCardEntryFromCountryPageData } from "@/lib/countryCardEntry";
import { getCannabisProfileCardSections } from "@/lib/cannabisProfile";
import { formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { buildCountryIntentSections } from "@/lib/seo/countryIntentContent";
import { getLocalizedCountryName, getSeoText, type SeoLocale } from "@/lib/seo/i18n";
import { localizePanel } from "@/lib/seo/panelLocale";
import { getStaticCountriesAsset } from "@/new-map/staticCountries";
import { sanitizeEvidenceQuoteText } from "@/lib/text/sanitizeEvidenceQuoteText";
import { getLinkScope, isSameLink } from "@/lib/linkDisplayPolicy";
import styles from "@/app/c/[code]/page.module.css";
export { sanitizeEvidenceQuoteText };

export function getCountrySeoTitle(data: CountryPageData, locale: SeoLocale) {
  const seo = getSeoText(locale);
  const name = data.node_type === "country" ? getLocalizedCountryName(data, locale) : data.name;
  return seo.title(name).replace(/\s{2,}/g, " ").trim();
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
  query
}: {
  data: CountryPageData;
  locale: SeoLocale;
  query: string | null;
}) {
  ensureCountryPageHash(data);
  const seo = getSeoText(locale);
  const runtimeIdentity = getNewMapRuntimeIdentity();
  const visibleStamp = formatVisibleRuntimeStamp(runtimeIdentity);
  const countriesUrl = getStaticCountriesAsset().url;
  const seoCountryIndex = buildSeoCountryIndex(data.code);
  const intentSections = buildCountryIntentSections(data, { query, locale });
  const heading = getCountrySeoTitle(data, locale);
  const intro = seo.intro(data);
  const card = deriveCountryCardEntryFromCountryPageData(data);
  const localizedPanel = localizePanel(card, data, locale);
  const cannabisProfileSections = getCannabisProfileCardSections(card.cannabisProfile);
  const safeSeoCountryData = getSafeSeoCountryData(data);
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
    missingFact:
      locale === "de"
        ? "Im aktuellen Quellensnapshot nicht klar angegeben."
        : locale === "es"
          ? "No está claramente indicado en la fuente actual."
          : locale === "fr"
            ? "Ce point n'est pas clairement indiqué dans la source actuelle."
            : locale === "pt"
              ? "Não está claramente indicado na fonte atual."
              : locale === "nl"
                ? "Niet duidelijk vermeld in de huidige bron."
                : "Not clearly stated in the current source.",
    statusExplain:
      locale === "de"
        ? "Warum dieser Status"
        : locale === "es"
          ? "Por qué este estado"
          : locale === "fr"
            ? "Pourquoi ce statut"
            : locale === "pt"
              ? "Por que este status"
              : locale === "nl"
                ? "Waarom deze status"
                : "Why this status",
    quotedEvidence:
      locale === "de"
        ? "Quellenbelege"
        : locale === "es"
          ? "Citas de la fuente"
          : locale === "fr"
            ? "Citations de la source"
            : locale === "pt"
              ? "Trechos da fonte"
              : locale === "nl"
                ? "Broncitaten"
                : "Source quotes"
  };

  const cleanQuoteText = sanitizeEvidenceQuoteText(
    String(
    [
      data.notes_raw || "",
      data.notes_normalized || "",
      data.facts.possession_limit ? `Possession: ${data.facts.possession_limit}` : "",
      data.facts.cultivation ? `Cultivation: ${data.facts.cultivation}` : "",
      data.facts.penalty ? `Penalty: ${data.facts.penalty}` : ""
    ]
      .filter(Boolean)
      .join(" ")
    )
  );

  const evidenceQuotes = cleanQuoteText
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.length >= 24)
    .filter((line) =>
      /(decriminal|fine|medical|license|tolerat|illegal|prison|sale|distribution|allowed|personal use|possession|cultivation)/i.test(line)
    )
    .slice(0, 3);

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
  const isSameReasonSourceLink = (sourceUrl: string, reasonHref: string) =>
    isSelfLink(sourceUrl) || isSameLink(sourceUrl, reasonHref, selfPath);

  return (
    <main className={styles.page}>
      <Script
        id={`country-seo-faq-${data.code}-${locale}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <NewMapClientEntry
        countriesUrl={countriesUrl}
        visibleStamp={visibleStamp}
        runtimeIdentity={runtimeIdentity}
        initialGeoCode={data.geo_code}
        seoCountryData={safeSeoCountryData}
        seoCountryIndex={seoCountryIndex}
        locale={locale}
      />
      <article className={styles.article}>
        <section id="seo-content" className={styles.section}>
          <p className={styles.eyebrow}>{data.node_type === "state" ? seo.statePrefix : seo.countryPrefix}</p>
          <h1 className={styles.title}>{heading}</h1>
          <p className={styles.intro}>{intro}</p>
          <div id="law-summary" className={styles.metaGrid}>
            <div id="law-recreational" className={styles.metaBlock}>
              <p className={styles.metaLabel}>{seo.recreational}</p>
              <p className={styles.metaText}>
                {data.legal_model.recreational.status} · {data.legal_model.recreational.enforcement} · {data.legal_model.recreational.scope}
              </p>
            </div>
            <div id="law-medical" className={styles.metaBlock}>
              <p className={styles.metaLabel}>{seo.medical}</p>
              <p className={styles.metaText}>
                {data.legal_model.medical.status} · {data.legal_model.medical.scope}
              </p>
            </div>
            <div id="law-distribution" className={styles.metaBlock}>
              <p className={styles.metaLabel}>{seo.distribution}</p>
              <p className={styles.metaText}>{data.legal_model.distribution.status}</p>
            </div>
            <div id="law-risk" className={styles.metaBlock}>
              <p className={styles.metaLabel}>{seo.risk}</p>
              <p className={styles.metaText}>
                {data.legal_model.signals?.final_risk || "UNKNOWN"} · prison {data.legal_model.signals?.penalties?.prison ? "yes" : "no"}
              </p>
            </div>
          </div>
        </section>
        <section id="law-status-explanation" className={styles.section}>
          <h2>{humanFallback.statusExplain}</h2>
          {localizedPanel.why.length > 0 ? (
            <ul className={styles.factsList}>
              {localizedPanel.why.map((reason) => (
                <li key={reason.id}>
                  {!isSelfLink(reason.href) ? renderArticleLink(reason.href, reason.text) : null}
                  {reason.sourceUrl && !isSameReasonSourceLink(reason.sourceUrl, reason.href) ? (
                    <>
                      {" "}
                      {renderArticleLink(reason.sourceUrl, "Source")}
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {localizedPanel.critical.length > 0 ? (
            <>
              <h3 className={styles.subheading}>{localizedPanel.labels.hardRestrictions}</h3>
              <ul className={styles.factsList}>
                {localizedPanel.critical.map((reason) => (
                  <li key={reason.id}>
                    {!isSelfLink(reason.href) ? <strong>{renderArticleLink(reason.href, reason.text)}</strong> : null}
                    {reason.sourceUrl && !isSameReasonSourceLink(reason.sourceUrl, reason.href) ? (
                      <>
                        {" "}
                        {renderArticleLink(reason.sourceUrl, "Source")}
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {localizedPanel.info.length > 0 ? (
            <>
              <h3 className={styles.subheading}>{localizedPanel.labels.moreContext}</h3>
              <ul className={styles.factsList}>
                {localizedPanel.info.map((reason) => (
                  <li key={reason.id}>
                    {!isSelfLink(reason.href) ? renderArticleLink(reason.href, reason.text) : null}
                    {reason.sourceUrl && !isSameReasonSourceLink(reason.sourceUrl, reason.href) ? (
                      <>
                        {" "}
                        {renderArticleLink(reason.sourceUrl, "Source")}
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {evidenceQuotes.length > 0 ? (
            <>
              <h3 id="law-status-quotes" className={styles.subheading}>{humanFallback.quotedEvidence}</h3>
              <ul className={styles.factsList}>
                {evidenceQuotes.map((quote) => (
                  <li key={quote}>
                    <blockquote style={{ margin: "0 0 6px", fontStyle: "italic" }}>{quote}</blockquote>
                    {data.sources.legal && !isSelfLink(data.sources.legal) ? (
                      renderArticleLink(data.sources.legal, "Source")
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        {intentSections.map((section) => (
          <section key={section.id} className={styles.section}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}
        {cannabisProfileSections.length > 0 ? (
          <section id="cannabis-profile" className={styles.section}>
            <h2>Cannabis profile</h2>
            {cannabisProfileSections.map((section) => (
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
        <section id="law-facts" className={styles.section}>
          <h2>{seo.keyFacts}</h2>
          <ul className={styles.factsList}>
            <li>{seo.possession}: {data.facts.possession_limit || humanFallback.missingFact}</li>
            <li>{seo.cultivation}: {data.facts.cultivation || humanFallback.missingFact}</li>
            <li>{seo.penalty}: {data.facts.penalty || humanFallback.missingFact}</li>
          </ul>
        </section>
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
