import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("card-entry route", () => {
  it("keeps popup card responses CDN-cacheable for fast rich-popup upgrades", async () => {
    const response = await GET(new Request("https://www.islegal.info/api/new-map/card-entry?geo=FR"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(response.headers.get("cache-control")).toContain("stale-while-revalidate=604800");
  });
});
