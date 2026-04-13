import Script from "next/script";
import NewMapClientEntry from "@/app/new-map/NewMapClientEntry";
import { getNewMapRuntimeIdentity } from "@/app/new-map/runtimeConfig";
import { buildSeoCountryIndex, computeCountryHashes, stripCountryPageHashes, type CountryPageData } from "@/lib/countryPageStorage";
import { formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { buildCountryIntentSections } from "@/lib/seo/countryIntentContent";
import { getLocalizedCountryName, getSeoText, type SeoLocale } from "@/lib/seo/i18n";
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
  const intentSections = buildCountryIntentSections(data, { query });
  const heading = getCountrySeoTitle(data, locale);
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: heading,
        acceptedAnswer: {
          "@type": "Answer",
          text: data.notes_normalized
        }
      }
    ]
  };

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
      />
      <article className={styles.article}>
        <section id="seo-content" className={styles.section}>
          <p className={styles.eyebrow}>{data.node_type === "state" ? seo.statePrefix : seo.countryPrefix}</p>
          <h1 className={styles.title}>{heading}</h1>
          <p className={styles.intro}>{seo.intro(data)}</p>
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
        {intentSections.map((section) => (
          <section key={section.id} className={styles.section}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
            {section.related_regions.length > 0 ? (
              <>
                <h3 className={styles.subheading}>{section.related_heading}</h3>
                <ul className={styles.relatedList}>
                  {section.related_regions.map((item) => (
                    <li key={`${section.id}-${item.code}`}>
                      <a href={`/c/${item.code}`}>{item.name}</a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ))}
        <section id="law-facts" className={styles.section}>
          <h2>{seo.keyFacts}</h2>
          <ul className={styles.factsList}>
            <li>Possession: {data.facts.possession_limit || "No stable possession fact found in normalized storage."}</li>
            <li>Cultivation: {data.facts.cultivation || "No stable cultivation fact found in normalized storage."}</li>
            <li>Penalty: {data.facts.penalty || "No stable penalty fact found in normalized storage."}</li>
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
