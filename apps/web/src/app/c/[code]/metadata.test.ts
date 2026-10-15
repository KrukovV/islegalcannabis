import { describe, expect, it } from "vitest";
import { listCountryPageCodes } from "@/lib/countryPageStorage";
import { generateMetadata } from "./page";

describe("/c/[code] metadata", () => {
  it("emits canonical metadata for country pages", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ code: "us-ca" })
    });
    expect(metadata.title).toBe("Is cannabis legal in California, USA?");
    expect(metadata.alternates?.canonical).toBe("/c/us-ca");
    expect(metadata.alternates?.languages?.en).toBe("/c/us-ca");
    expect(metadata.openGraph && "url" in metadata.openGraph ? metadata.openGraph.url : null).toBe(
      "https://www.islegal.info/c/us-ca"
    );
  });

  it("gives every advertised English jurisdiction a distinct descriptive snippet", async () => {
    const descriptions: string[] = [];
    for (const code of listCountryPageCodes()) {
      const metadata = await generateMetadata({ params: Promise.resolve({ code }) });
      expect(metadata.description).toMatch(/^Cannabis law in .+: current legal evidence,/);
      expect(metadata.description).not.toMatch(/undefined|UNKNOWN|GREEN|RED/);
      expect(metadata.openGraph && "description" in metadata.openGraph ? metadata.openGraph.description : null)
        .toBe(metadata.description);
      descriptions.push(String(metadata.description));
    }
    expect(descriptions).toHaveLength(288);
    expect(new Set(descriptions).size).toBe(288);
  });

  it("distinguishes Georgia the country from Georgia the U.S. state", async () => {
    const [country, state] = await Promise.all([
      generateMetadata({ params: Promise.resolve({ code: "geo" }) }),
      generateMetadata({ params: Promise.resolve({ code: "us-ga" }) })
    ]);
    expect(country.title).toBe("Is cannabis legal in Georgia?");
    expect(state.title).toBe("Is cannabis legal in Georgia, USA?");
    expect(country.description).toContain("in Georgia:");
    expect(state.description).toContain("in Georgia, USA:");
    expect(country.alternates?.canonical).toBe("/c/geo");
    expect(state.alternates?.canonical).toBe("/c/us-ga");
  });
});
