import { describe, expect, it } from "vitest";
import { getCountryPageData } from "@/lib/countryPageStorage";
import { getLocalizedSeoEvidenceDescription } from "@/lib/seo/i18n";
import { listSeoTranslationEntries } from "@/lib/seo/wikiLocaleContent";

describe("localized canonical metadata", () => {
  it("covers every advertised localized URL with neutral native-language description", () => {
    const entries = listSeoTranslationEntries();
    expect(entries).toHaveLength(22);
    for (const entry of entries) {
      const data = getCountryPageData(entry.code);
      expect(data).toBeTruthy();
      const description = getLocalizedSeoEvidenceDescription(data!, entry.locale);
      expect(description.length).toBeGreaterThan(50);
      expect(description.length).toBeLessThan(190);
      expect(description).not.toContain("undefined");
      expect(description).not.toContain("UNKNOWN");
      expect(description).not.toContain("GREEN");
      expect(description).not.toContain("RED");
    }
  });
});
