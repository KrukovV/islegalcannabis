import { describe, expect, it } from "vitest";
import { GET as getPassport } from "./evidence-passport/[geo]/route";
import { GET as getEmbed } from "./embed/[geo]/route";
import { GET as getPrint } from "./print/[geo]/route";
import { GET as getMonitor } from "./change-monitor/route";
import { GET as getManifest } from "./manifest/route";
import { GET as getWhyNoLeaf } from "./why-no-leaf/[geo]/route";
import { GET as getSnapshotLedger } from "./snapshot-ledger/route";
import { GET as getLocalisations } from "./localisations/route";

const localRequest = (path: string) => new Request(`http://127.0.0.1:3000${path}`, { headers: { host: "127.0.0.1:3000" } });
const productionRequest = (path: string) => new Request(`https://www.islegal.info${path}`, { headers: { host: "www.islegal.info" } });

describe("local Evidence Passport delivery APIs", () => {
  it("returns only the local current Passport JSON and rejects production hosts before loading it", async () => {
    const local = await getPassport(localRequest("/api/truth-map/b2b/evidence-passport/mn"), { params: Promise.resolve({ geo: "mn" }) });
    expect(local.status).toBe(200);
    expect(local.headers.get("cache-control")).toBe("no-store");
    const payload = await local.json();
    expect(payload.geo).toBe("MN");
    expect(payload.localOnly).toBe(true);
    expect(payload.boundaries.paidPlacementAllowed).toBe(false);

    const production = await getPassport(productionRequest("/api/truth-map/b2b/evidence-passport/mn"), { params: Promise.resolve({ geo: "mn" }) });
    expect(production.status).toBe(404);
  });

  it("returns a script-free local embed card and an exact read-only watchlist monitor", async () => {
    const embed = await getEmbed(localRequest("/api/truth-map/b2b/embed/mn"), { params: Promise.resolve({ geo: "mn" }) });
    expect(embed.status).toBe(200);
    expect(embed.headers.get("content-type")).toContain("text/html");
    expect(await embed.text()).not.toContain("<script");

    const monitor = await getMonitor(localRequest("/api/truth-map/b2b/change-monitor?geo=mn&geo=us-ca"));
    expect(monitor.status).toBe(200);
    const payload = await monitor.json();
    expect(payload.summary.geosWatched).toBe(2);
    expect(payload.watchlist).toEqual({ mode: "EXPLICIT_GEOS", geos: ["MN", "US-CA"] });
    expect(payload.canonicalComparison.status).toBe("BASELINE_ONLY_NO_PRIOR_CANONICAL_COMPARISON");

    const invalidWatchlist = await getMonitor(localRequest("/api/truth-map/b2b/change-monitor?watch=mn,not-a-geo"));
    expect(invalidWatchlist.status).toBe(400);
    expect((await invalidWatchlist.json()).error).toBe("CHANGE_MONITOR_UNKNOWN_WATCHLIST_GEOS=NOT-A-GEO");

    const productionEmbed = await getEmbed(productionRequest("/api/truth-map/b2b/embed/mn"), { params: Promise.resolve({ geo: "mn" }) });
    const productionMonitor = await getMonitor(productionRequest("/api/truth-map/b2b/change-monitor"));
    expect(productionEmbed.status).toBe(404);
    expect(productionMonitor.status).toBe(404);
  });

  it("delivers all-307 deterministic manifest entries and a script-free print/PDF document only on localhost", async () => {
    const printDocument = await getPrint(localRequest("/api/truth-map/b2b/print/mn"), { params: Promise.resolve({ geo: "mn" }) });
    expect(printDocument.status).toBe(200);
    expect(printDocument.headers.get("content-type")).toContain("text/html");
    expect(printDocument.headers.get("content-disposition")).toContain("islegal-evidence-passport-mn.html");
    expect(printDocument.headers.get("x-evidence-passport-sha256")).toMatch(/^[a-f0-9]{64}$/);
    const printHtml = await printDocument.text();
    expect(printHtml).toContain('data-islegal-print-passport="MN"');
    expect(printHtml).toContain("Source Freshness Passport");
    expect(printHtml).not.toContain("<script");

    const manifest = await getManifest(localRequest("/api/truth-map/b2b/manifest"));
    expect(manifest.status).toBe(200);
    const payload = await manifest.json();
    expect(payload.geoCount).toBe(307);
    expect(payload.entries).toHaveLength(307);
    expect(payload.entries.find((entry: { geo: string }) => entry.geo === "MN").artifacts.printPdf.delivery).toBe("PRINT_HTML_SAVE_AS_PDF");

    expect((await getPrint(productionRequest("/api/truth-map/b2b/print/mn"), { params: Promise.resolve({ geo: "mn" }) })).status).toBe(404);
    expect((await getManifest(productionRequest("/api/truth-map/b2b/manifest"))).status).toBe(404);
  });

  it("returns only aggregate Store Truth gate reasons and keeps production closed", async () => {
    const response = await getWhyNoLeaf(localRequest("/api/truth-map/b2b/why-no-leaf/ca"), { params: Promise.resolve({ geo: "ca" }) });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.geo).toBe("CA");
    expect(payload.savedRecords).toBe(payload.visibleLeaves + payload.blockedRecords);
    expect(payload.interpretation).toContain("does not mean");
    expect(JSON.stringify(payload)).not.toContain("latitude");
    expect((await getWhyNoLeaf(productionRequest("/api/truth-map/b2b/why-no-leaf/ca"), { params: Promise.resolve({ geo: "ca" }) })).status).toBe(404);
  });

  it("exposes the immutable canonical baseline ledger only on localhost", async () => {
    const response = await getSnapshotLedger(localRequest("/api/truth-map/b2b/snapshot-ledger"));
    expect(response.status).toBe(200);
    const ledger = await response.json();
    expect(ledger).toEqual(expect.objectContaining({ schemaVersion: 1, localOnly: true, appendOnly: true }));
    expect(ledger.snapshots).toHaveLength(1);
    expect(ledger.snapshots[0].entries).toHaveLength(307);
    expect((await getSnapshotLedger(productionRequest("/api/truth-map/b2b/snapshot-ledger"))).status).toBe(404);
  });

  it("exposes only editor-approved legal localisations and keeps production closed", async () => {
    const response = await getLocalisations(localRequest("/api/truth-map/b2b/localisations?geo=MN"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      localOnly: true,
      publicationGate: "EDITOR_APPROVED_OR_NOT_PUBLISHED",
      geo: "MN",
      approvedRecords: 0,
      records: []
    }));
    expect((await getLocalisations(productionRequest("/api/truth-map/b2b/localisations?geo=MN"))).status).toBe(404);
  });
});
