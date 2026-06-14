import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

describe("MapRoot map selection wiring", () => {
  test("routes hover-controller click selection into popup state", () => {
    const source = readFileSync(fileURLToPath(new URL("./MapRoot.tsx", import.meta.url)), "utf8");
    const start = source.indexOf("attachHoverController(runtime.map");
    const end = source.indexOf("});", start);
    const attachBlock = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(attachBlock).toContain("onSelectChange");
    expect(attachBlock).toContain("setSelectedGeo(geo)");
  });

  test("keeps card index in bundled product state instead of production fetch path", () => {
    const source = readFileSync(fileURLToPath(new URL("./MapRoot.tsx", import.meta.url)), "utf8");

    expect(source).toContain('import staticCardIndex from "../../public/new-map-card-index.json"');
    expect(source).toContain("const EMBEDDED_CARD_INDEX = staticCardIndex as Record<string, CountryCardEntry>");
    expect(source).toContain("useState<Record<string, CountryCardEntry>>(() => EMBEDDED_CARD_INDEX)");
    expect(source).toContain("__NEW_MAP_CARD_INDEX__");
    expect(source).not.toContain('CARD_INDEX_STATIC_URL = "/new-map-card-index.json"');
    expect(source).not.toContain('CARD_INDEX_API_URL = "/api/new-map/card-index"');
    expect(source).not.toContain("requestCardIndexFrom(CARD_INDEX_STATIC_URL)");
  });

  test("keeps the country popup in the main map bundle instead of a challenged lazy chunk", () => {
    const source = readFileSync(fileURLToPath(new URL("./MapRoot.tsx", import.meta.url)), "utf8");

    expect(source).toContain('import ViewportCountryPopup from "./components/ViewportCountryPopup"');
    expect(source).not.toContain('dynamic(() => import("./components/ViewportCountryPopup")');
  });

  test("keeps the geo dock in the main map bundle instead of a challenged lazy chunk", () => {
    const source = readFileSync(fileURLToPath(new URL("./MapRoot.tsx", import.meta.url)), "utf8");

    expect(source).toContain('import MapGeoDock from "./MapGeoDock"');
    expect(source).not.toContain('dynamic(() => import("./MapGeoDock")');
  });

  test("keeps map interaction wiring out of challenged post-ready lazy chunks", () => {
    const source = readFileSync(fileURLToPath(new URL("./MapRoot.tsx", import.meta.url)), "utf8");

    expect(source).toContain('import { attachHoverController } from "./hoverController"');
    expect(source).toContain('import { bindAsciiMapTriggers } from "./ascii/ascii-triggers"');
    expect(source).not.toContain('await import("./hoverController")');
    expect(source).not.toContain('await import("./ascii/ascii-triggers")');
  });

  test("does not reset disabled production AI on every popup geo change", () => {
    const source = readFileSync(fileURLToPath(new URL("./components/AIBar.tsx", import.meta.url)), "utf8");
    const resetBlockStart = source.indexOf("const nextGeo = activeGeo?.iso2 || null;");
    const resetBlockEnd = source.indexOf("}, [activeGeo?.iso2, aiInputLocked]);", resetBlockStart);
    const resetBlock = source.slice(resetBlockStart, resetBlockEnd);

    expect(resetBlockStart).toBeGreaterThan(-1);
    expect(resetBlock).toContain("if (aiInputLocked) return;");
    expect(resetBlock.indexOf("if (aiInputLocked) return;")).toBeLessThan(resetBlock.indexOf("void resetServerDialog();"));
  });

  test("disables popup Link prefetch to avoid production RSC challenge noise", () => {
    const source = readFileSync(fileURLToPath(new URL("./components/ViewportCountryPopup.tsx", import.meta.url)), "utf8");

    expect(source).toContain("<Link href={item.href} prefetch={false}");
  });

  test("does not load optional deferred runtime chunks during QA map audits", () => {
    const source = readFileSync(fileURLToPath(new URL("../app/_components/NewMapDeferredRuntime.tsx", import.meta.url)), "utf8");

    expect(source).toContain("function isQaMapAuditRoute");
    expect(source).toContain('pathname?.startsWith("/new-map")');
    expect(source).toContain("window.location.search");
    expect(source).toContain('get("qa") === "1"');
    expect(source).toContain("if (qaMapAuditRoute || !ready || (isNewMapRoute && !newMapRuntimeReady)) return null;");
  });
});
