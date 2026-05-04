import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/sitemap/route";

describe("api sitemap route", () => {
  it("returns xml with no-store delivery headers", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.text();
    expect(body).toContain("<urlset");
    expect(body).toContain("<loc>https://www.islegal.info/</loc>");
    expect(body).toContain("<loc>https://www.islegal.info/c/nld</loc>");
    expect(body).toContain("<loc>https://www.islegal.info/c/us-ca</loc>");
    expect(body).not.toContain("https://islegal.info/");
  });
});
