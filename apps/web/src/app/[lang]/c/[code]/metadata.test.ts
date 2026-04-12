import { describe, expect, it } from "vitest";
import { generateMetadata } from "./page";

describe("/[lang]/c/[code] metadata", () => {
  it("emits localized title with canonical english route and hreflang alternates", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ lang: "es", code: "nld" })
    });
    expect(metadata.title).toBe("¿Es legal el cannabis en Netherlands / Nederland?");
    expect(metadata.alternates?.canonical).toBe("/c/nld");
    expect(metadata.alternates?.languages).toEqual({
      en: "/c/nld",
      es: "/es/c/nld",
      fr: "/fr/c/nld",
      de: "/de/c/nld"
    });
    expect(metadata.openGraph && "url" in metadata.openGraph ? metadata.openGraph.url : null).toBe(
      "https://islegal.info/es/c/nld"
    );
  });
});
