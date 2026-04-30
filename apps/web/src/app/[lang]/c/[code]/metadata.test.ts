import { describe, expect, it } from "vitest";
import { generateMetadata } from "./page";

describe("/[lang]/c/[code] metadata", () => {
  it("emits localized title with self canonical and hreflang alternates when translation exists", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ lang: "es", code: "nld" })
    });
    expect(metadata.title).toBe("¿Es legal el cannabis en Nederland?");
    expect(metadata.alternates?.canonical).toBe("/es/c/nld");
    expect(metadata.alternates?.languages).toEqual({
      en: "/c/nld",
      es: "/es/c/nld",
      pt: "/pt/c/nld",
      fr: "/fr/c/nld"
    });
    expect(metadata.openGraph && "url" in metadata.openGraph ? metadata.openGraph.url : null).toBe(
      "https://www.islegal.info/es/c/nld"
    );
  });

  it("falls back to english metadata when localized content does not exist", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ lang: "de", code: "tha" })
    });
    expect(metadata.title).toBe("Is cannabis legal in Thailand?");
    expect(metadata.alternates?.canonical).toBe("/c/tha");
    expect(metadata.alternates?.languages).toEqual({
      en: "/c/tha"
    });
    expect(metadata.openGraph && "url" in metadata.openGraph ? metadata.openGraph.url : null).toBe(
      "https://www.islegal.info/c/tha"
    );
  });
});
