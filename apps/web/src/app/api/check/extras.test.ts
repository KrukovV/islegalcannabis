import { describe, expect, it } from "vitest";
import { GET } from "./route";

function getExtrasCount(json: { viewModel?: { extrasPreview?: unknown; extrasFull?: unknown } }) {
  const preview = Array.isArray(json.viewModel?.extrasPreview)
    ? json.viewModel?.extrasPreview.length
    : 0;
  const full = Array.isArray(json.viewModel?.extrasFull)
    ? json.viewModel?.extrasFull.length
    : 0;
  return { preview, full };
}

describe("GET /api/check extras", () => {
  it("free returns preview + paywallHint", async () => {
    const req = new Request("http://localhost/api/check?country=DE");
    const res = await GET(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const counts = getExtrasCount(json);
    expect(counts.preview).toBe(2);
    expect(json.viewModel?.meta?.paywallHint).toBe(true);
    expect(json.viewModel?.meta?.paid).toBe(false);
  });

  it("paid returns full list", async () => {
    const req = new Request("http://localhost/api/check?country=DE&paid=1");
    const res = await GET(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const counts = getExtrasCount(json);
    expect(counts.full).toBe(13);
    expect(json.viewModel?.meta?.paid).toBe(true);
  });
});
