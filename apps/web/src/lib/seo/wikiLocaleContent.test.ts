import { describe, expect, it } from "vitest";
import {
  buildSeoLanguageAlternates,
  getSeoTranslation,
  isSeoPriorityCode,
  pickPreferredSeoLocale,
  resolveBrowserLocaleRedirect,
  resolveSeoRouteLocale
} from "@/lib/seo/wikiLocaleContent";

describe("wikiLocaleContent", () => {
  it("publishes priority alternates for configured multilingual geo", () => {
    const alternates = buildSeoLanguageAlternates("nld");
    expect(alternates.en).toBe("/c/nld");
    expect(alternates.es).toBe("/es/c/nld");
    expect(alternates.pt).toBe("/pt/c/nld");
    expect(alternates.fr).toBe("/fr/c/nld");
    expect(getSeoTranslation("nld", "es")).toBeTruthy();
  });

  it("keeps non-priority countries on canonical english only", () => {
    expect(isSeoPriorityCode("irn")).toBe(false);
    expect(buildSeoLanguageAlternates("irn")).toEqual({
      en: "/c/irn"
    });
  });

  it("picks the highest-priority supported locale from Accept-Language", () => {
    expect(pickPreferredSeoLocale("de-DE,de;q=0.9,en;q=0.8")).toBe("de");
    expect(pickPreferredSeoLocale("it-IT,it;q=0.9,en;q=0.8")).toBeNull();
  });

  it("redirects canonical english routes only when a real localized translation exists", () => {
    expect(resolveBrowserLocaleRedirect("/c/deu", "de-DE,de;q=0.9")).toBe("/de/c/deu");
    expect(resolveBrowserLocaleRedirect("/c/tha", "de-DE,de;q=0.9")).toBeNull();
    expect(resolveBrowserLocaleRedirect("/de/c/deu", "fr-FR,fr;q=0.9")).toBeNull();
    expect(resolveBrowserLocaleRedirect("/", "de-DE,de;q=0.9")).toBeNull();
  });

  it("keeps html lang on the effective content locale", () => {
    expect(resolveSeoRouteLocale("/c/deu")).toBe("en");
    expect(resolveSeoRouteLocale("/de/c/deu")).toBe("de");
    expect(resolveSeoRouteLocale("/de/c/tha")).toBe("en");
  });
});
