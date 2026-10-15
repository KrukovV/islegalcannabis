import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { getCountryPageData } from "@/lib/countryPageStorage";
import { getTruthMapCountryPageProjection } from "@/truth-map/truthMapCountryPage";
import { getCannabisProfileCardSections } from "@/lib/cannabisProfile";
import { isTruthMapCurrentStatusAssertion } from "@/truth-map/truthMapRichCard";
import { sanitizeEvidenceQuoteText } from "@/lib/text/sanitizeEvidenceQuoteText";
import { listSeoTranslationEntries } from "./wikiLocaleContent";
import { countryBodySource, bodySourceSha256 } from "./countryBodySource";
import { countryBodyTexts } from "./countryBodySource";
import { getCountryBodyTranslation, bodyTranslationForSource, approvedBodyLocalisations } from "./localizedBody";
import catalog from "./localizedBody.catalog.json";
import { renderToStaticMarkup } from "react-dom/server";
import CountrySeoPage from "@/app/_components/CountrySeoPage";

export function sourceRows() {
  return [...new Set(listSeoTranslationEntries().map((entry) => entry.code))].map((code) => {
    const data = getCountryPageData(code)!;
    const projection = getTruthMapCountryPageProjection(data)!;
    const { properties, card } = projection;
    return { code, geo: properties.geo, locales: listSeoTranslationEntries().filter((e) => e.code === code).map((e) => e.locale), properties,
      actions: [...card.panel.critical, ...card.panel.info],
      context: [...new Set([card.parentLawSummary, ...(card.jurisdictionContextNotes || [])].map((s) => sanitizeEvidenceQuoteText(String(s || "")).trim()).filter(Boolean))],
      profile: getCannabisProfileCardSections(card.cannabisProfile).map((s) => ({ ...s, items: s.items.filter((x) => !isTruthMapCurrentStatusAssertion(x)) })).filter((s) => s.items.length),
      facts: data.facts, sources: card.sources
    };
  });
}

describe("complete existing language-page source inventory", () => {
  it("binds all22 editions to their current retained legal and supplementary text", () => {
    const rows = sourceRows();
    expect(rows.reduce((n, r) => n + r.locales.length, 0)).toBe(22);
    expect(rows.every((r) => r.properties.truthDataset === "FINAL_307_RECONCILIATION")).toBe(true);
    if (process.env.SEO_LOCALIZATION_INVENTORY_PATH) fs.writeFileSync(process.env.SEO_LOCALIZATION_INVENTORY_PATH, JSON.stringify(rows, null, 2));
    if (process.env.SEO_LOCALIZATION_BINDINGS_PATH) fs.writeFileSync(process.env.SEO_LOCALIZATION_BINDINGS_PATH, JSON.stringify(rows.map((r) => {
      const data = getCountryPageData(r.code)!;
      const source = countryBodySource(data, getTruthMapCountryPageProjection(data)!);
      return { code: r.code, geo: r.geo, locales: r.locales, source, sourceSha256: bodySourceSha256(source) };
    }), null, 2));
  });
});

describe("source-bound substantive translations", () => {
  it("covers every retained text in all22 pages and preserves each original quotation/link", () => {
    let total = 0;
    for (const entry of listSeoTranslationEntries()) {
      const data = getCountryPageData(entry.code)!;
      const projection = getTruthMapCountryPageProjection(data)!;
      const source = countryBodySource(data, projection);
      const translation = getCountryBodyTranslation(data, projection, entry.locale);
      expect(translation.current, `${entry.locale}/${entry.code}`).toBe(true);
      const entries = catalog.entries as Record<string, Record<string, string>>;
      for (const text of countryBodyTexts(source)) {
        expect(entries[text]?.[entry.locale], `${entry.locale}/${entry.code}: ${text}`).toBeTruthy();
        // Dates, quantities, law identifiers and penalties cannot silently change.
        const numbers = (s: string) => (s.replace(/(?<=\d)[\u202f\u00a0](?=\d)/g, "").match(/\d+(?:[.,]\d+)*/g) || [])
          .map((n) => /^\d{1,3}(,\d{3})+$/.test(n) ? n.replace(/,/g, "") : n.replace(/,/g, ".")).sort();
        expect(numbers(translation.translate(text))).toEqual(numbers(text));
      }
      const html = renderToStaticMarkup(CountrySeoPage({ data, locale: entry.locale, query: null, truthMapProjection: projection, bodyTranslation: translation }));
      expect(html).toContain(`lang="${entry.locale}" data-source-translation-current="true"`);
      expect(html).not.toContain("Retained historical and profile context — not the current legal conclusion");
      const quotes = [...html.matchAll(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/g)].map((m) => m[1]
        .replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
      expect(quotes).toEqual(source.current.citations.map((c) => c.quote).filter(Boolean));
      for (const c of source.current.citations) expect(html).toContain(c.url.replace(/&/g, "&amp;"));
      for (const action of source.actions) if (action.sourceUrl) expect(html).toContain(action.sourceUrl.replace(/&/g, "&amp;"));
      expect(bodySourceSha256(countryBodySource(data, projection))).toBe(bodySourceSha256(source));
      total++;
    }
    expect(total).toBe(22);
  });

  it("rejects stale source/quotation and translation-byte changes without losing the current original", () => {
    const data = getCountryPageData("nld")!;
    const source = countryBodySource(data, getTruthMapCountryPageProjection(data)!);
    const stale = structuredClone(source); stale.current.citations[0].quote += " changed";
    const fallback = bodyTranslationForSource(stale, "es");
    expect(fallback.current).toBe(false);
    expect(fallback.translate(stale.current.summary)).toBe(stale.current.summary);
    const changed = structuredClone(catalog);
    changed.entries["Lawful access verified"].es += " changed";
    expect(bodyTranslationForSource(source, "es", changed).current).toBe(false);
  });

  it("validates22 unique approvals and rejects a tampered, duplicate or broken event chain", () => {
    expect(approvedBodyLocalisations(catalog).size).toBe(22);
    const changed = structuredClone(catalog); changed.events[1].binding.sourceSha256 = "0".repeat(64);
    expect(() => approvedBodyLocalisations(changed)).toThrow();
    const duplicate = structuredClone(catalog); duplicate.events.push(duplicate.events[0]);
    expect(() => approvedBodyLocalisations(duplicate)).toThrow();
    const broken = structuredClone(catalog); broken.events[2].previousEventSha256 = "GENESIS";
    expect(() => approvedBodyLocalisations(broken)).toThrow();
  });
});
