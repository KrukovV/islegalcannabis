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

export default async function CountryCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const data = getCountryPageData(code);
  if (!data) notFound();
  ensurePageHash(data);
  const seoCountryIndex = buildSeoCountryIndex(code);

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
      <NewMapClientEntry
        countriesUrl="/api/new-map/countries"
        visibleStamp={NEW_MAP_VISIBLE_STAMP}
        runtimeIdentity={NEW_MAP_RUNTIME_IDENTITY}
        initialGeoCode={data.geo_code}
        seoCountryData={data}
        seoCountryIndex={seoCountryIndex}
      />
    </main>
  );
}
