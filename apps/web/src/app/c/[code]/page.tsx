import Script from "next/script";
import { notFound } from "next/navigation";
import NewMapClientEntry from "@/app/new-map/NewMapClientEntry";
import { NEW_MAP_RUNTIME_IDENTITY, NEW_MAP_VISIBLE_STAMP } from "@/app/new-map/runtimeConfig";
import {
  buildSeoCountryIndex,
  computeCountryHashes,
  getCountryPageData,
  listCountryPageCodes,
  stripCountryPageHashes
} from "@/lib/countryPageStorage";
import { buildCountryIntentSections } from "@/lib/seo/countryIntentContent";
import styles from "./page.module.css";

export const revalidate = 604800;

function getSeoTitle(data: NonNullable<ReturnType<typeof getCountryPageData>>) {
  if (data.node_type === "state") {
    return `Is cannabis legal in ${data.name}? (USA laws 2026)`;
  }
  return `Is cannabis legal in ${data.name}? (2026)`;
}

export async function generateStaticParams() {
  return listCountryPageCodes().map((code) => ({ code }));
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const data = getCountryPageData(code);
  if (!data) {
    return {
      title: "Country not found"
    };
  }
  const title = getSeoTitle(data);
  return {
    title,
    description: data.notes_normalized
  };
}

function ensurePageHash(data: NonNullable<ReturnType<typeof getCountryPageData>>) {
  const expected = computeCountryHashes(stripCountryPageHashes(data));
  if (expected.model_hash === data.hashes.model_hash) return;
  const message = `COUNTRY_PAGE_HASH_MISMATCH:${data.code}`;
  if (process.env.NODE_ENV !== "production") {
    throw new Error(message);
  }
  console.error(message);
}

export default async function CountryCodePage({
  params,
  searchParams
}: {
  params: Promise<{ code: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = typeof resolvedSearchParams?.q === "string" ? resolvedSearchParams.q : null;
  const data = getCountryPageData(code);
  if (!data) notFound();
  ensurePageHash(data);
  const seoCountryIndex = buildSeoCountryIndex(code);
  const intentSections = buildCountryIntentSections(data, { query });

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: getSeoTitle(data).replace(/\s*\(.*\)$/, ""),
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
        id={`country-seo-faq-${data.code}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <section className={styles.hero}>
        <div className={styles.panel}>
          <div className={styles.panelCard}>
            <p className={styles.eyebrow}>{data.node_type === "state" ? "State View" : "Country View"}</p>
            <h1 className={styles.title}>{getSeoTitle(data).replace(/\s*\(.*\)$/, "")}</h1>
            <p className={styles.intro}>{data.notes_normalized}</p>
            <div className={styles.metaGrid}>
              <div className={styles.metaBlock}>
                <p className={styles.metaLabel}>Recreational</p>
                <p className={styles.metaText}>
                  {data.legal_model.recreational.status} · {data.legal_model.recreational.enforcement} · {data.legal_model.recreational.scope}
                </p>
              </div>
              <div className={styles.metaBlock}>
                <p className={styles.metaLabel}>Medical</p>
                <p className={styles.metaText}>
                  {data.legal_model.medical.status} · {data.legal_model.medical.scope}
                </p>
              </div>
              <div className={styles.metaBlock}>
                <p className={styles.metaLabel}>Distribution</p>
                <p className={styles.metaText}>{data.legal_model.distribution.status}</p>
              </div>
              <div className={styles.metaBlock}>
                <p className={styles.metaLabel}>Risk</p>
                <p className={styles.metaText}>
                  {data.legal_model.signals?.final_risk || "UNKNOWN"} · prison {data.legal_model.signals?.penalties?.prison ? "yes" : "no"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <NewMapClientEntry
        countriesUrl="/api/new-map/countries"
        visibleStamp={NEW_MAP_VISIBLE_STAMP}
        runtimeIdentity={NEW_MAP_RUNTIME_IDENTITY}
        initialGeoCode={data.geo_code}
        seoCountryData={data}
        seoCountryIndex={seoCountryIndex}
      />
      <article className={styles.article}>
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
        <section className={styles.section}>
          <h2>Key facts</h2>
          <ul className={styles.factsList}>
            <li>Possession: {data.facts.possession_limit || "No stable possession fact found in normalized storage."}</li>
            <li>Cultivation: {data.facts.cultivation || "No stable cultivation fact found in normalized storage."}</li>
            <li>Penalty: {data.facts.penalty || "No stable penalty fact found in normalized storage."}</li>
          </ul>
        </section>
        <section className={styles.section}>
          <h2>Related places</h2>
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
