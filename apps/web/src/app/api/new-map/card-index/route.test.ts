import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("card-index route", () => {
  it("keeps the full card index CDN-cacheable when it is loaded after selection", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(response.headers.get("cache-control")).toContain("stale-while-revalidate=604800");
  });
});
