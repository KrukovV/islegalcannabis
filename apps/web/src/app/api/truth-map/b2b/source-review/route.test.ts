import { describe, expect, it } from "vitest";
import * as route from "./route";

const localRequest = (query = "") => new Request(`http://127.0.0.1:3000/api/truth-map/b2b/source-review${query}`, {
  headers: { host: "127.0.0.1:3000" }
});
const productionRequest = () => new Request("https://www.islegal.info/api/truth-map/b2b/source-review", {
  headers: { host: "www.islegal.info" }
});

describe("local source review workbench API", () => {
  it("returns a bounded 307-GEO read-only workbench with exact attempt provenance", async () => {
    const response = await route.GET(localRequest("?geo=US-MT&category=SOURCE_OWNER_OR_FINAL_URL_CHANGE&state=current"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.json();
    expect(payload).toEqual(expect.objectContaining({ schemaVersion: 1, localOnly: true, readOnly: true }));
    expect(payload.summary.canonicalGeos).toBe(307);
    expect(payload.summary.currentSignals).toBe(1405);
    expect(payload.dossiers.length).toBeGreaterThan(0);
    expect(payload.dossiers.every((dossier: { currentSignal: boolean }) => dossier.currentSignal)).toBe(true);
    expect(payload.dossiers[0].latestAttempt).toEqual(expect.objectContaining({
      attemptId: expect.stringMatching(/^SRCATT-[a-f0-9]{24}$/),
      signalIdentitySha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(payload.dossiers[0]).toHaveProperty("resolution");
  });

  it("distinguishes historical open operations and fails closed for invalid filters", async () => {
    const historical = await route.GET(localRequest("?geo=US-MT&state=historical"));
    expect(historical.status).toBe(200);
    const payload = await historical.json();
    expect(payload.summary.matchingOpenHistorical).toBeGreaterThan(0);
    expect(payload.dossiers.every((dossier: { currentSignal: boolean }) => !dossier.currentSignal)).toBe(true);

    for (const query of ["?geo=NOT-A-GEO", "?category=NOPE", "?state=stale", "?geo=", "?unexpected=true"]) {
      const invalid = await route.GET(localRequest(query));
      expect(invalid.status, query).toBe(400);
      expect((await invalid.json()).error, query).toMatch(/^SOURCE_REVIEW_WORKBENCH_/);
    }
  });

  it("is absent on production and exposes no write handler", async () => {
    expect((await route.GET(productionRequest())).status).toBe(404);
    expect("POST" in route).toBe(false);
  });
});
