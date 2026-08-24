import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

const enabled = process.env.TRUTH_MAP_VISUAL_AUDIT === "1";
const requestedGeos = String(process.env.TRUTH_MAP_VISUAL_AUDIT_GEOS || "")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
const canonicalGeoAuditCount = 307;
const repoRoot = path.resolve(__dirname, "..", "..", "..");

test("truth-map visual audit captures only the isolated audit route when explicitly enabled", async ({ page }) => {
  test.skip(!enabled, "TRUTH_MAP_VISUAL_AUDIT=1 is required for capture");
  expect(fs.existsSync(path.join(repoRoot, "data", "reviews", "geo-list-307.json"))).toBe(true);
  expect(requestedGeos.length).toBeGreaterThan(0);
  if (requestedGeos.length === canonicalGeoAuditCount) {
    test.setTimeout(900_000);
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const archiveRoot = process.env.TRUTH_MAP_VISUAL_AUDIT_ARCHIVE_DIR
    || path.join(os.homedir(), "islegalcannabis_archive", "truth-map-visual-audit", runId);
  const popupDir = path.join(archiveRoot, "popup");
  const canonicalManifestPath = path.join(repoRoot, "Artifacts", "truth-map-visual-audit", "manifest.json");
  const partialManifestPath = path.resolve(
    repoRoot,
    "Artifacts",
    "truth-map-visual-audit",
    "partial",
    `${runId}.json`,
  );
  const manifestPath = process.env.TRUTH_MAP_VISUAL_AUDIT_MANIFEST
    ? path.resolve(process.env.TRUTH_MAP_VISUAL_AUDIT_MANIFEST)
    : requestedGeos.length === canonicalGeoAuditCount
      ? canonicalManifestPath
      : partialManifestPath;
  fs.mkdirSync(popupDir, { recursive: true });
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });

  await page.goto("/truth-map?qa=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__TRUTH_MAP_QA__), { timeout: 20_000 });

  const rows: Array<{
    geo: string;
    popupScreenshot: string | null;
    status: "CAPTURED" | "MISSING";
    legalTruthColor?: string;
    mapDisplayText?: string;
    legalEvidenceIcon?: string;
  }> = [];
  for (const geo of requestedGeos) {
    const opened = await page.evaluate(async (target) => window.__TRUTH_MAP_QA__?.openGeo(target) ?? false, geo);
    if (!opened) {
      rows.push({ geo, popupScreenshot: null, status: "MISSING" });
      continue;
    }
    const popup = page.locator('[data-popup-variant="truth-map"]');
    await expect(popup).toBeVisible({ timeout: 10_000 });
    await expect(popup).toContainText(`ISO2: ${geo}`, { timeout: 10_000 });
    const popupText = await popup.textContent();
    const legalTruthColor = popupText?.match(/Current legal conclusion: (GREEN|YELLOW|RED|UNKNOWN)/)?.[1];
    expect(legalTruthColor).toBeTruthy();
    await expect(popup.getByText("Status", { exact: true })).toBeVisible();
    await expect(popup.getByTestId("viewport-country-popup-header")).toBeVisible();
    await expect(popup.getByTestId("viewport-country-popup-close")).toBeVisible();
    const legalEvidence = popup.getByTestId("truth-map-legal-evidence");
    await expect(legalEvidence).toBeVisible();
    await expect(legalEvidence).toContainText(/✅|⚠️|❌/);
    const supplementaryContextItems = popup.locator('[data-context-kind="supplementary-map-context"]');
    const supplementaryCount = await supplementaryContextItems.count();
    if (supplementaryCount > 0) {
      expect(await popup.getByText(/Supplementary (action-specific context|scope notes) — not the current legal conclusion/, { exact: true }).count()).toBeGreaterThan(0);
    }
    for (let index = 0; index < supplementaryCount; index += 1) {
      const item = supplementaryContextItems.nth(index);
      await expect(item).toContainText(/^Action: /);
      await expect(item.getByText("Supplementary source", { exact: true })).toHaveAttribute("target", "_blank");
    }
    await expect(popup).not.toContainText("Criminal penalties can include prison.");
    await expect(popup).not.toContainText("Sale and distribution stay banned.");
    const legalEvidenceText = await legalEvidence.textContent();
    const legalEvidenceIcon = legalEvidenceText?.match(/✅|⚠️|❌/)?.[0];
    if (legalTruthColor === "GREEN") {
      await expect(popup).toContainText("Map display: legal verdict GREEN.");
      await expect(legalEvidence).toContainText("✅");
    } else if (legalTruthColor === "YELLOW") {
      await expect(popup).toContainText("Map display: legal verdict YELLOW.");
      await expect(legalEvidence).toContainText("⚠️");
    } else if (legalTruthColor === "RED") {
      await expect(popup).toContainText("Map display: legal verdict RED.");
      await expect(legalEvidence).toContainText("❌");
      await expect(legalEvidence).toContainText("Prohibition evidenced in applicable law");
    } else {
      await expect(popup).toContainText("not a final legal conclusion");
      if (legalEvidenceText?.includes("❌")) {
        await expect(legalEvidence).toContainText("not a confirmed prohibition finding");
      }
    }
    await expect(legalEvidence.getByText("Current reconciliation rationale", { exact: true })).toBeVisible();
    if (geo === "AF") {
      await expect(popup.getByTestId("truth-map-research-direction")).toContainText("not a final legal conclusion");
      await expect(popup.getByTestId("truth-map-legal-evidence")).toContainText("❌");
      await expect(popup.getByTestId("truth-map-legal-evidence")).toContainText("not a confirmed prohibition finding");
    }
    if (geo === "AQ") {
      await expect(popup.getByTestId("truth-map-research-direction")).toContainText("GRAY — polar scope exception");
      await expect(popup).toContainText("This map display is not a final legal conclusion.");
    }
    if (geo === "ES") {
      await expect(popup).toContainText("Supplementary enforcement context — not the current legal conclusion");
      await expect(popup).not.toContainText("Enforcement Reality", { exact: true });
    }
    if (geo === "US-CA") {
      await expect(popup).toContainText("Map display: legal verdict GREEN.");
      await expect(popup.getByTestId("truth-map-legal-evidence")).toContainText("✅");
      await expect(popup.getByTestId("truth-map-legal-evidence").locator("a").first()).toHaveAttribute("target", "_blank");
    }
    if (geo === "AX") {
      await expect(popup).toContainText("Current legal conclusion: YELLOW");
      await expect(popup).toContainText("Map display: legal verdict YELLOW.");
      await expect(popup.getByTestId("truth-map-legal-evidence")).toContainText("⚠️");
      await expect(popup.getByTestId("truth-map-legal-evidence")).toContainText("Limited or qualified legal status");
    }
    if (geo === "BY") {
      await expect(popup).toContainText("Current legal conclusion: RED");
      await expect(popup.getByTestId("truth-map-legal-evidence")).toContainText("❌");
      await expect(popup.getByTestId("truth-map-legal-evidence")).toContainText("Prohibition evidenced in applicable law");
      await expect(popup.getByTestId("truth-map-legal-evidence")).not.toContainText("not a confirmed prohibition finding");
    }
    if (geo === "ST") {
      await expect(popup.getByTestId("truth-map-legal-evidence")).toContainText("❌");
      await expect(popup.getByTestId("truth-map-legal-evidence")).toContainText("not a confirmed prohibition finding");
    }
    const popupScreenshot = path.join(popupDir, `${geo}.png`);
    await popup.screenshot({ path: popupScreenshot });
    if (geo === "FR") {
      await popup.evaluate((node) => { node.scrollTop = Math.min(480, node.scrollHeight); });
      const popupBox = await popup.boundingBox();
      const closeButton = popup.getByTestId("viewport-country-popup-close");
      const closeBox = await closeButton.boundingBox();
      expect(popupBox).toBeTruthy();
      expect(closeBox).toBeTruthy();
      expect(closeBox!.y).toBeGreaterThanOrEqual(popupBox!.y);
      expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(popupBox!.y + popupBox!.height);
      await closeButton.click();
      await expect(popup).toBeHidden();
    }
    rows.push({
      geo,
      popupScreenshot,
      status: "CAPTURED",
      legalTruthColor,
      mapDisplayText: legalTruthColor && legalTruthColor !== "UNKNOWN"
        ? `legal verdict ${legalTruthColor}`
        : popupText?.match(/Map display: (research direction (?:GREEN|YELLOW|RED)|GRAY — polar scope exception)/)?.[1] || "UNKNOWN_DISPLAY",
      legalEvidenceIcon,
    });
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    route: "/truth-map",
    generatedAt: new Date().toISOString(),
    requestedGeos,
    captured: rows.filter((row) => row.status === "CAPTURED").length,
    missing: rows.filter((row) => row.status === "MISSING").map((row) => row.geo),
    rows,
  }, null, 2)}\n`);

  expect(rows.every((row) => row.status === "CAPTURED" && row.popupScreenshot && fs.existsSync(row.popupScreenshot))).toBe(true);
});
