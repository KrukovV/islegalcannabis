import { getBuildStamp } from "@/lib/buildStamp";
import { getCountryPageData, listCountryPageData } from "@/lib/countryPageStorage";
import { buildSeoLanguageAlternates, getSeoLocaleHref, listSeoTranslationEntries } from "@/lib/seo/wikiLocaleContent";

export const SEO_BASE_URL = "https://www.islegal.info";

export type SitemapEntry = {
  url: string;
  lastModified: string;
  priority?: string;
  alternates?: Array<{ hreflang: string; href: string }>;
};

function toIsoDate(value: string | null | undefined) {
  const fallback = new Date(getBuildStamp().buildTime).toISOString().slice(0, 10);
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString().slice(0, 10);
}

function toCanonicalUrl(pathname: string) {
  return `${SEO_BASE_URL}${pathname}`;
}

function getPageLastModified(code: string) {
  return toIsoDate(getCountryPageData(code)?.updated_at || null);
}

function buildLocaleAlternates(code: string) {
  return Object.entries(buildSeoLanguageAlternates(code)).map(([locale, href]) => ({
    hreflang: locale,
    href: toCanonicalUrl(href)
  }));
}

export function buildSitemapIndexEntries() {
  return [
    { url: toCanonicalUrl("/sitemap-main.xml") },
    { url: toCanonicalUrl("/sitemap-countries.xml") },
    { url: toCanonicalUrl("/sitemap-states.xml") },
    { url: toCanonicalUrl("/sitemap-i18n.xml") }
  ];
}

export function buildMainSitemapEntries(): SitemapEntry[] {
  return [
    {
      url: toCanonicalUrl("/"),
      lastModified: toIsoDate(getBuildStamp().buildTime),
      priority: "1.0"
    }
  ];
}

export function buildPrimarySitemapEntries(): SitemapEntry[] {
  return [
    ...buildMainSitemapEntries(),
    ...buildCountrySitemapEntries(),
    ...buildStateSitemapEntries(),
    ...buildI18nSitemapEntries()
  ];
}

export function buildCountrySitemapEntries(): SitemapEntry[] {
  return listCountryPageData()
    .filter((entry) => entry.node_type === "country")
    .map((entry) => ({
      url: toCanonicalUrl(`/c/${entry.code}`),
      lastModified: getPageLastModified(entry.code),
      priority: "0.9"
    }));
}

export function buildStateSitemapEntries(): SitemapEntry[] {
  return listCountryPageData()
    .filter((entry) => entry.node_type === "state")
    .map((entry) => ({
      url: toCanonicalUrl(`/c/${entry.code}`),
      lastModified: getPageLastModified(entry.code),
      priority: "0.8"
    }));
}

export function buildI18nSitemapEntries(): SitemapEntry[] {
  return listSeoTranslationEntries().map((entry) => ({
    url: toCanonicalUrl(getSeoLocaleHref(entry.code, entry.locale)),
    lastModified: getPageLastModified(entry.code),
    alternates: buildLocaleAlternates(entry.code)
  }));
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderSitemapIndexXml(entries: Array<{ url: string }>) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map((entry) => `  <sitemap><loc>${escapeXml(entry.url)}</loc></sitemap>`)
    .join("\n")}\n</sitemapindex>\n`;
}

export function renderUrlSetXml(entries: SitemapEntry[]) {
  const usesAlternates = entries.some((entry) => (entry.alternates || []).length > 0);
  const xmlns = usesAlternates
    ? 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"'
    : 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${xmlns}>\n${entries
    .map((entry) => {
      const alternateXml = (entry.alternates || [])
        .map(
          (alternate) =>
            `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.hreflang)}" href="${escapeXml(alternate.href)}"/>`
        )
        .join("\n");
      const priorityXml = entry.priority ? `\n    <priority>${escapeXml(entry.priority)}</priority>` : "";
      return `  <url>\n    <loc>${escapeXml(entry.url)}</loc>\n    <lastmod>${escapeXml(entry.lastModified)}</lastmod>${priorityXml}${
        alternateXml ? `\n${alternateXml}` : ""
      }\n  </url>`;
    })
    .join("\n")}\n</urlset>\n`;
}
