import { describe, expect, it, vi } from "vitest";
import { STATUS_BANNERS } from "@islegal/shared";

const profile = {
  id: "DE",
  country: "DE",
  medical: "restricted",
  recreational: "illegal",
  possession_limit: "Not specified",
  public_use: "illegal",
  home_grow: "illegal",
  cross_border: "illegal",
  risks: ["public_use"],
  sources: [{ title: "Example", url: "https://example.com" }],
  updated_at: "2024-01-01",
  verified_at: "2025-01-01",
  confidence: "medium",
  status: "needs_review"
};

vi.mock("@/lib/lawStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/lawStore")>();
  return {
    ...actual,
    getLawProfile: () => profile,
    normalizeKey: () => "DE"
  };
});

describe("GET /api/check needs_review", () => {
  it("returns verification label for needs_review", async () => {
    const { GET } = await import("./route");
    const req = new Request("http://localhost/api/check?country=DE");
    const res = await GET(req);
    const json = await res.json();
    expect(json.status.level).toBe("gray");
    expect(json.status.label).toBe(STATUS_BANNERS.needs_review.title);
    expect(json.profile.verified_at).toBe("2025-01-01");
  });
});
