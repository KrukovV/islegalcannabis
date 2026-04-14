import Script from "next/script";
import NewMapClientEntry from "@/app/new-map/NewMapClientEntry";
import { getNewMapRuntimeIdentity } from "@/app/new-map/runtimeConfig";
import { buildSeoCountryIndex, computeCountryHashes, stripCountryPageHashes, type CountryPageData } from "@/lib/countryPageStorage";
import { deriveCountryCardEntryFromCountryPageData } from "@/lib/countryCardEntry";
import { formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { buildCountryIntentSections } from "@/lib/seo/countryIntentContent";
import { getLocalizedCountryName, getSeoText, type SeoLocale } from "@/lib/seo/i18n";
import { localizePanel } from "@/lib/seo/panelLocale";
import styles from "@/app/c/[code]/page.module.css";

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
  const seoCountryIndex = buildSeoCountryIndex(data.code);
  const intentSections = buildCountryIntentSections(data, { query, locale });
  const heading = getCountrySeoTitle(data, locale);
  const intro = seo.intro(data);
  const card = deriveCountryCardEntryFromCountryPageData(data);
  const localizedPanel = localizePanel(card, data, locale);
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

  const cleanQuoteText = String(
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
    .replace(/\{\{[^}]+\}\}/g, " ")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^/>]*\/>/gi, " ")
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  const evidenceQuotes = cleanQuoteText
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.length >= 24)
    .filter((line) =>
      /(decriminal|fine|medical|license|tolerat|illegal|prison|sale|distribution|allowed|personal use|possession|cultivation)/i.test(line)
    )
    .slice(0, 3);

  return (
    <main className={styles.page}>
      <Script
        id={`country-seo-faq-${data.code}-${locale}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <NewMapClientEntry
        countriesUrl="/api/new-map/countries"
        visibleStamp={visibleStamp}
        runtimeIdentity={runtimeIdentity}
        initialGeoCode={data.geo_code}
        seoCountryData={data}
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
                  <a href={reason.href}>{reason.text}</a>
                  {reason.sourceUrl && reason.sourceUrl !== reason.href ? (
                    <>
                      {" "}
                      <a href={reason.sourceUrl} rel="nofollow noopener noreferrer" target="_blank">
                        Source
                      </a>
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
                    <a href={reason.href}>
                      <strong>{reason.text}</strong>
                    </a>
                    {reason.sourceUrl && reason.sourceUrl !== reason.href ? (
                      <>
                        {" "}
                        <a href={reason.sourceUrl} rel="nofollow noopener noreferrer" target="_blank">
                          Source
                        </a>
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
                    <a href={reason.href}>{reason.text}</a>
                    {reason.sourceUrl && reason.sourceUrl !== reason.href ? (
                      <>
                        {" "}
                        <a href={reason.sourceUrl} rel="nofollow noopener noreferrer" target="_blank">
                          Source
                        </a>
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
                    {data.sources.legal ? (
                      <a href={data.sources.legal} rel="nofollow noopener noreferrer" target="_blank">
                        Source
                      </a>
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
                <a href={`/c/${item.code}`}>{item.name}</a>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </main>
  );
}
