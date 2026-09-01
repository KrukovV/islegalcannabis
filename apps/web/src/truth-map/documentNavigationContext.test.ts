import { describe, expect, it } from "vitest";
import { canonicalDocumentPath, normalizeTruthMapDocumentNavigationContext } from "./documentNavigationContext";

describe("Truth Map document navigation context", () => {
  const now = 1_700_000_000_000;
  const valid = {
    targetPath: "/c/us-tx",
    geo: "us-tx",
    camera: { lat: 31.2, lng: -99.7, zoom: 6.4 },
    createdAt: now - 50
  };

  it("keeps the canonical sitemap path while accepting a bounded country or state camera", () => {
    expect(canonicalDocumentPath("/c/mng#law-recreational")).toBe("/c/mng");
    expect(canonicalDocumentPath("https://www.islegal.info/c/us-tx?source=map")).toBe("/c/us-tx");
    expect(normalizeTruthMapDocumentNavigationContext(valid, "/c/us-tx", now)).toEqual({
      ...valid,
      geo: "US-TX"
    });
    expect(normalizeTruthMapDocumentNavigationContext({
      ...valid,
      targetPath: "/c/zaf",
      geo: "za",
      camera: { lat: -29.1, lng: 24.7, zoom: 4.8 }
    }, "/c/zaf", now)).toMatchObject({
      targetPath: "/c/zaf",
      geo: "ZA",
      camera: { lat: -29.1, lng: 24.7, zoom: 4.8 }
    });
  });

  it("fails closed for another GEO route, stale data, and invalid cameras", () => {
    expect(normalizeTruthMapDocumentNavigationContext(valid, "/c/mng", now)).toBeNull();
    expect(normalizeTruthMapDocumentNavigationContext({ ...valid, createdAt: now - 300_001 }, "/c/us-tx", now)).toBeNull();
    expect(normalizeTruthMapDocumentNavigationContext({ ...valid, camera: { lat: 91, lng: 0, zoom: 4 } }, "/c/us-tx", now)).toBeNull();
    expect(normalizeTruthMapDocumentNavigationContext({ ...valid, targetPath: "/new-map" }, "/new-map", now)).toBeNull();
  });
});
