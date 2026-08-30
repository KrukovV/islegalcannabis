import { describe, expect, it } from "vitest";
import { GET as publicCountries } from "./countries/route";
import { GET as publicStates } from "./us-states/route";
import { GET as publicStores } from "./stores/route";
import { GET as auditStores } from "../truth-map/stores/route";
import { GET as publicSummary } from "./stores/summary/route";
import { GET as auditSummary } from "../truth-map/stores/summary/route";
import {
  STATIC_TRUTH_MAP_COUNTRIES_HASH,
  STATIC_TRUTH_MAP_COUNTRIES_URL,
  STATIC_TRUTH_MAP_US_STATES_HASH,
  STATIC_TRUTH_MAP_US_STATES_URL
} from "@/truth-map/staticTruthMap";

describe("public-map read adapters", () => {
  it("keeps the proven content-addressed static delivery path for 307-GEO display datasets", async () => {
    const [countriesResponse, statesResponse] = await Promise.all([publicCountries(), publicStates()]);
    expect(countriesResponse.status).toBe(308);
    expect(countriesResponse.headers.get("location")).toBe(STATIC_TRUTH_MAP_COUNTRIES_URL);
    expect(countriesResponse.headers.get("x-truth-map-hash")).toBe(STATIC_TRUTH_MAP_COUNTRIES_HASH);
    expect(statesResponse.status).toBe(308);
    expect(statesResponse.headers.get("location")).toBe(STATIC_TRUTH_MAP_US_STATES_URL);
    expect(statesResponse.headers.get("x-truth-map-hash")).toBe(STATIC_TRUTH_MAP_US_STATES_HASH);
    expect(countriesResponse.headers.get("cache-control")).toContain("stale-while-revalidate");
    expect(statesResponse.headers.get("cache-control")).toContain("stale-while-revalidate");
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
