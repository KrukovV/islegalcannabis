import { describe, expect, it } from "vitest";
import { GET as publicCountries } from "./countries/route";
import { GET as auditCountries } from "../truth-map/countries/route";
import { GET as publicStores } from "./stores/route";
import { GET as auditStores } from "../truth-map/stores/route";
import { GET as publicSummary } from "./stores/summary/route";
import { GET as auditSummary } from "../truth-map/stores/summary/route";

describe("public-map read adapters", () => {
  it("serves exactly the same canonical 307-GEO display datasets as the local audit route", async () => {
    const [publicResponse, auditResponse] = await Promise.all([publicCountries(), auditCountries()]);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get("cache-control")).toBe("no-store");
    expect(await publicResponse.json()).toEqual(await auditResponse.json());
  });

  it("preserves the Store Truth visibility gate for individual leaves", async () => {
    const query = "?west=-112&south=40&east=-111&north=41&zoom=12";
    const [publicResponse, auditResponse] = await Promise.all([
      publicStores(new Request(`http://localhost/api/public-map/stores${query}`)),
      auditStores(new Request(`http://localhost/api/truth-map/stores${query}`)),
    ]);
    const publicPayload = await publicResponse.json();
    const auditPayload = await auditResponse.json();
    expect(publicResponse.status).toBe(200);
    expect(publicPayload.features).toEqual(auditPayload.features);
    expect(publicPayload.meta.level).toBe(auditPayload.meta.level);
    expect(publicPayload.meta.visibleStores).toBe(auditPayload.meta.visibleStores);
    expect(publicPayload.meta.blockedStores).toBe(auditPayload.meta.blockedStores);
    expect(publicPayload.meta.circularTruthDependencies).toBe(auditPayload.meta.circularTruthDependencies);
  });

  it("preserves the same gated country and GEO aggregates", async () => {
    const [publicResponse, auditResponse] = await Promise.all([publicSummary(), auditSummary()]);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await publicResponse.json()).toEqual(await auditResponse.json());
  });
});
