import { describe, expect, it } from "vitest";
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

  it("distinguishes Georgia the country from Georgia the U.S. state", async () => {
    const [country, state] = await Promise.all([
      generateMetadata({ params: Promise.resolve({ code: "geo" }) }),
      generateMetadata({ params: Promise.resolve({ code: "us-ga" }) })
    ]);
    expect(country.title).toBe("Is cannabis legal in Georgia?");
    expect(state.title).toBe("Is cannabis legal in Georgia, USA?");
    expect(country.alternates?.canonical).toBe("/c/geo");
    expect(state.alternates?.canonical).toBe("/c/us-ga");
  });
});
