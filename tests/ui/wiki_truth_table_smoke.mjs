import { chromium } from "@playwright/test";
import { acquireProjectProcessSlot } from "../../tools/runtime/processSlots.mjs";
import { assertNodeRuntimeSettled } from "../../tools/runtime/nodeRuntimeGuard.mjs";

const BASE = globalThis.process?.env?.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

const requiredHeaders = [
  "Country",
  "Rec (Wiki)",
  "Med (Wiki)",
  "Rec (Our)",
  "Med (Our)",
  "Official",
  "Official link",
  "Notes",
  "MismatchFlags",
  "Ownership quality",
  "Ownership basis",
  "Source scope"
];

const slot = await acquireProjectProcessSlot("playwright:chromium:wiki-truth-table-smoke");
const browser = await chromium.launch();
const page = await browser.newPage();

try {
  const res = await page.goto(`${BASE}/wiki-truth`, { waitUntil: "domcontentloaded" });
  if (!res || res.status() !== 200) {
    throw new Error(`WIKI_TRUTH_HTTP_FAIL status=${res ? res.status() : "NO_RESPONSE"}`);
  }
  await page.waitForSelector("[data-testid=\"wiki-truth-table\"]", { timeout: 10000 });
  await page.waitForSelector("[data-testid=\"official-ownership-raw-table\"]", { timeout: 10000 });
  await page.waitForSelector("text=Countries with strong official links", { timeout: 10000 });
  for (const header of requiredHeaders) {
    await page.waitForSelector(`text=${header}`, { timeout: 10000 });
  }
  await page.waitForTimeout(250);
  const proof = await page.evaluate(() => {
    const tableWrap = globalThis.document.querySelector("[data-testid='wiki-truth-table']")?.closest(".tableWrap");
    const table = globalThis.document.querySelector("[data-testid='wiki-truth-table']");
    const headers = Array.from(table?.querySelectorAll("thead th") || []).map((node) => node.textContent?.trim() || "");
    const officialIndex = headers.indexOf("Official link");
    const firstRows = Array.from(table?.querySelectorAll("tbody tr") || []).slice(0, 25);
    const pollutedOfficialCells = firstRows
      .map((row) => row.querySelectorAll("td")[officialIndex]?.textContent || "")
      .filter((text) => /(wikipedia\.org|books\.google\.|archive\.org|web\.archive\.org)/i.test(text));
    const rawOwnershipRows = globalThis.document.querySelectorAll("[data-testid='official-ownership-raw-table'] tbody tr").length;
    const officialSignals = Array.from(table?.querySelectorAll("tbody tr td:nth-child(8)") || [])
      .slice(0, 25)
      .map((node) => node.textContent?.trim() || "");
    return {
      hasHorizontalScroll: Boolean(
        tableWrap &&
          table &&
          ((tableWrap.scrollWidth > tableWrap.clientWidth) || (table.scrollWidth > tableWrap.clientWidth))
      ),
      pollutedOfficialCells,
      rawOwnershipRows,
      officialSignals
    };
  });
  if (!proof.hasHorizontalScroll) {
    throw new Error("WIKI_TRUTH_TABLE_NO_HORIZONTAL_SCROLL");
  }
  if (proof.pollutedOfficialCells.length) {
    throw new Error(`WIKI_TRUTH_TABLE_OFFICIAL_POLLUTION count=${proof.pollutedOfficialCells.length}`);
  }
  if (proof.rawOwnershipRows < 418) {
    throw new Error(`OFFICIAL_OWNERSHIP_VIEW_SHRANK rows=${proof.rawOwnershipRows}`);
  }
  if (!proof.officialSignals.some((value) => /yes \((strong|weak)\)|no/i.test(value))) {
    throw new Error("OFFICIAL_SIGNAL_RENDER_MISSING");
  }
  globalThis.console.log(`WIKI_TRUTH_UI_SMOKE=PASS headers=${requiredHeaders.length}`);
} finally {
  try {
    await browser.close();
  } finally {
    slot.release();
  }
  assertNodeRuntimeSettled("wiki-truth-table-smoke");
}
