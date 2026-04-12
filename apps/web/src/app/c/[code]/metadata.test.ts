import { describe, expect, it } from "vitest";
import { generateMetadata } from "./page";

describe("/c/[code] metadata", () => {
  it("emits canonical metadata for country pages", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ code: "us-ca" })
    });
    expect(metadata.title).toBe("Is cannabis legal in California?");
    expect(metadata.alternates?.canonical).toBe("/c/us-ca");
    expect(metadata.alternates?.languages).toEqual({
      en: "/c/us-ca",
      es: "/es/c/us-ca",
      fr: "/fr/c/us-ca",
      de: "/de/c/us-ca"
    });
    expect(metadata.openGraph && "url" in metadata.openGraph ? metadata.openGraph.url : null).toBe(
      "https://islegal.info/c/us-ca"
    );
  });
});
