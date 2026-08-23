import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("truth-map audit route", () => {
  it("keeps an isolated, dynamic proposal-only route", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src", "app", "truth-map", "page.tsx"), "utf8");
    const runtime = fs.readFileSync(path.join(process.cwd(), "src", "app", "truth-map", "runtimeConfig.ts"), "utf8");
    expect(page).toContain('export const dynamic = "force-dynamic";');
    expect(page).toContain('countriesUrl="/api/truth-map/countries"');
    expect(page).toContain('usStatesUrl="/api/truth-map/us-states"');
    expect(runtime).toContain('dataSource: "FINAL_307_RECONCILIATION_PROPOSAL"');
    expect(runtime).toContain('mapRuntime: "active"');
  });

  it("does not alter either current public map route", () => {
    const root = fs.readFileSync(path.join(process.cwd(), "src", "app", "page.tsx"), "utf8");
    const currentMap = fs.readFileSync(path.join(process.cwd(), "src", "app", "new-map", "page.tsx"), "utf8");
    expect(root).toContain('import NewMapPage from "./new-map/page";');
    expect(root).toContain("await NewMapPage({ searchParams })");
    expect(root).not.toContain("TruthMapRoot");
    expect(root).not.toContain("TruthMapSocialPanel");
    expect(currentMap).toContain("NewMapClientEntry");
    expect(currentMap).not.toContain("TruthMapRoot");
  });

  it("keeps Store projection and its viewport API isolated to the audit map", () => {
    const mainMap = fs.readFileSync(path.join(process.cwd(), "src", "new-map", "MapRoot.tsx"), "utf8");
    const storeLayer = fs.readFileSync(path.join(process.cwd(), "src", "new-map", "stores", "StoreLayer.ts"), "utf8");
    const truthMap = fs.readFileSync(path.join(process.cwd(), "src", "truth-map", "TruthMapRoot.tsx"), "utf8");
    expect(mainMap).not.toContain("useStoreMapLayer");
    expect(mainMap).not.toContain("useSocialMapLayer");
    expect(storeLayer).toContain('"/api/truth-map/stores"');
    expect(storeLayer).toContain('"icon-image": STORE_MARKER_ICON_ID');
    expect(storeLayer).toContain('type: "symbol"');
    expect(fs.readFileSync(path.join(process.cwd(), "public", "cannabis-store-leaf.svg"), "utf8")).toContain("<svg");
    expect(truthMap).toContain("useStoreMapLayer");
    expect(truthMap).toContain("useStoreMapLayer(mapInstance, mapReady, storesEnabled)");
    expect(truthMap).toContain('data-testid="truth-map-store-control"');
    expect(truthMap).toContain('data-store-layer-enabled={String(storesEnabled)}');
    expect(truthMap).toContain("useSocialMapLayer");
    expect(truthMap).toContain("TruthMapSocialPanel");
    expect(truthMap).toContain('data-testid="truth-map-legal-evidence-guide"');
    expect(truthMap).toContain("not a prohibition finding");
  });

  it("keeps the Social Chat surface on the audit route only", () => {
    const auditPage = fs.readFileSync(path.join(process.cwd(), "src", "app", "truth-map", "page.tsx"), "utf8");
    const mainMap = fs.readFileSync(path.join(process.cwd(), "src", "new-map", "MapRoot.tsx"), "utf8");
    const currentMap = fs.readFileSync(path.join(process.cwd(), "src", "app", "new-map", "page.tsx"), "utf8");
    const socialPanel = fs.readFileSync(path.join(process.cwd(), "src", "truth-map", "TruthMapSocialPanel.tsx"), "utf8");
    const socialLayer = fs.readFileSync(path.join(process.cwd(), "src", "new-map", "social", "SocialLayer.ts"), "utf8");
    expect(auditPage).toContain("getSocialRuntimeConfig");
    expect(mainMap).not.toContain("TruthMapSocialPanel");
    expect(currentMap).not.toContain("getSocialRuntimeConfig");
    expect(socialPanel).toContain("DURABLE_SOCIAL_STORAGE_REQUIRED");
    expect(socialPanel).toContain("disabled");
    expect(socialPanel).toContain("truth-map-social-map-area-focus");
    expect(socialPanel).toContain("SOCIAL_MAP_ACTIVITY_INVALIDATED_EVENT");
    expect(socialLayer).toContain("SOCIAL_MAP_ACTIVITY_SELECTED_EVENT");
    expect(socialLayer).toContain("SOCIAL_MAP_ACTIVITY_INVALIDATED_EVENT");
    expect(socialLayer).toContain("geoCell: item.geoCell");
    expect(socialLayer).toContain('"/social-discussion-chat.svg"');
    expect(socialLayer).not.toContain('"/cannabis-store-leaf.svg"');
    const socialIcon = fs.readFileSync(path.join(process.cwd(), "public", "social-discussion-chat.svg"), "utf8");
    const storeIcon = fs.readFileSync(path.join(process.cwd(), "public", "cannabis-store-leaf.svg"), "utf8");
    expect(socialIcon).toContain("<svg");
    expect(socialIcon).not.toBe(storeIcon);
  });

  it("allows 5m-scale zoom only on the isolated audit route", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src", "app", "truth-map", "page.tsx"), "utf8");
    const truthMap = fs.readFileSync(path.join(process.cwd(), "src", "truth-map", "TruthMapRoot.tsx"), "utf8");
    const createMap = fs.readFileSync(path.join(process.cwd(), "src", "new-map", "createMap.ts"), "utf8");
    const currentMap = fs.readFileSync(path.join(process.cwd(), "src", "app", "new-map", "page.tsx"), "utf8");
    expect(page).toContain("readBoundedNumber(resolvedSearchParams?.zoom, 0, 15)");
    expect(truthMap).toContain("runtime.map.setMaxZoom(15)");
    expect(createMap).toContain("maxZoom: 14");
    expect(currentMap).toContain("readBoundedNumber(resolvedSearchParams?.zoom, 0, 14)");
  });

  it("keeps QA popup selection inside the complete route-local reconciliation datasets", () => {
    const truthMap = fs.readFileSync(path.join(process.cwd(), "src", "truth-map", "TruthMapRoot.tsx"), "utf8");
    expect(truthMap).toContain("Promise.all([\n          fetch(countriesUrl");
    expect(truthMap).toContain("fetch(usStatesUrl");
    expect(truthMap).toContain("countries.features.find");
    expect(truthMap).toContain("usStates.features.find");
    expect(truthMap).toContain("openGeo: async (geo)");
  });
});
