import type { Metadata } from "next";
import Link from "next/link";
import { listCountryPageDataCached } from "@/lib/countryPageStorage";
import { listSeoTranslationEntries } from "@/lib/seo/wikiLocaleContent";
import styles from "./page.module.css";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Cannabis law by jurisdiction",
  description: "Browse the canonical cannabis-law pages for countries, U.S. states and available language editions.",
  alternates: { canonical: "/jurisdictions" },
  robots: { index: true, follow: true }
};

export default function JurisdictionsPage() {
  const entries = listCountryPageDataCached();
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en");
  const countries = entries.filter((entry) => entry.node_type === "country").sort(byName);
  const states = entries.filter((entry) => entry.node_type === "state").sort(byName);
  const nameByCode = new Map(entries.map((entry) => [entry.code, entry.name]));
  const translations = listSeoTranslationEntries().sort((a, b) =>
    a.locale.localeCompare(b.locale) ||
    (nameByCode.get(a.code) || a.code).localeCompare(nameByCode.get(b.code) || b.code, "en")
  );

  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href="/">← Return to the map</Link>
      <h1>Cannabis law by jurisdiction</h1>
      <p className={styles.intro}>Browse the same canonical country and U.S. state pages listed in our sitemap. Each page separates the current legal conclusion from supplementary context and cites its retained sources.</p>
      <section aria-labelledby="countries-heading">
        <h2 id="countries-heading">Countries and territories ({countries.length})</h2>
        <ul className={styles.links}>
          {countries.map((entry) => <li key={entry.code}><Link href={`/c/${entry.code}`} prefetch={false}>{entry.name}</Link></li>)}
        </ul>
      </section>
      <section aria-labelledby="states-heading">
        <h2 id="states-heading">U.S. states ({states.length})</h2>
        <ul className={styles.links}>
          {states.map((entry) => <li key={entry.code}><Link href={`/c/${entry.code}`} prefetch={false}>{entry.name}</Link></li>)}
        </ul>
      </section>
      <section aria-labelledby="languages-heading">
        <h2 id="languages-heading">Available language editions ({translations.length})</h2>
        <p className={styles.note}>Language editions translate the evidence explanations and supplementary context; original legal quotations remain in their source language.</p>
        <ul className={styles.links}>
          {translations.map(({ code, locale }) => (
            <li key={`${locale}-${code}`}>
              <Link href={`/${locale}/c/${code}`} lang={locale} prefetch={false}>{locale.toUpperCase()} · {nameByCode.get(code) || code}</Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
