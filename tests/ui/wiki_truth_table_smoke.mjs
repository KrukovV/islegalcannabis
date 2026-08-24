import { chromium } from "../../tools/playwright_runtime.mjs";
import { acquireProjectProcessSlot } from "../../tools/runtime/processSlots.mjs";
import { assertNodeRuntimeSettled } from "../../tools/runtime/nodeRuntimeGuard.mjs";

const BASE = globalThis.process?.env?.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

const requiredHeaders = [
  "Страна",
  "Рекр. (Wiki)",
  "Мед. (Wiki)",
  "Рекр. (итог)",
  "Мед. (итог)",
  "Официальный",
  "Официальная ссылка",
  "Примечания Wiki",
  "Флаги расхождений"
];

const slot = await acquireProjectProcessSlot("playwright:chromium:wiki-truth-table-smoke");
const browser = await chromium.launch();
const page = await browser.newPage();

try {
  const res = await page.goto(`${BASE}/wiki-truth`, { waitUntil: "domcontentloaded" });
  if (!res || res.status() !== 200) {
    throw new Error(`WIKI_TRUTH_HTTP_FAIL status=${res ? res.status() : "NO_RESPONSE"}`);
  }
  await page.waitForSelector("[data-testid=\"wiki-truth-table\"]", {
    timeout: 10000,
    state: "attached"
  });
  await page.evaluate(() => {
    for (const details of globalThis.document.querySelectorAll("details")) {
      details.open = true;
    }
  });
  await page.waitForSelector("[data-testid=\"wiki-truth-table\"]", { timeout: 10000 });
  await page.waitForSelector("[data-testid=\"official-ownership-registry-table\"]", { timeout: 10000 });
  await page.waitForSelector("[data-testid=\"wiki-truth-final-reconciliation\"]", { timeout: 10000 });
  await page.waitForSelector("[data-testid=\"cannabis-law-color-table\"]", { timeout: 10000 });
  for (const header of requiredHeaders) {
    await page.waitForSelector(`text=${header}`, { timeout: 10000 });
  }
  await page.waitForTimeout(250);
  const proof = await page.evaluate(() => {
    const tableWrap = globalThis.document.querySelector("[data-testid='wiki-truth-table']")?.closest(".tableWrap");
    const table = globalThis.document.querySelector("[data-testid='wiki-truth-table']");
    const headers = Array.from(table?.querySelectorAll("thead th") || []).map((node) => node.textContent?.trim() || "");
    const officialIndex = headers.indexOf("Официальная ссылка");
    const officialSignalIndex = headers.indexOf("Официальный");
    const firstRows = Array.from(table?.querySelectorAll("tbody tr") || []).slice(0, 25);
    const pollutedOfficialCells = firstRows
      .map((row) => row.querySelectorAll("td")[officialIndex]?.textContent || "")
      .filter((text) => /(wikipedia\.org|books\.google\.|archive\.org|web\.archive\.org)/i.test(text));
    const registryRows = globalThis.document.querySelectorAll("[data-testid='official-ownership-registry-table'] tbody tr").length;
    const officialSignals = firstRows
      .map((row) => row.querySelectorAll("td")[officialSignalIndex]?.textContent?.trim() || "")
      .slice(0, 25)
      .filter(Boolean);
    const final = globalThis.document.querySelector("[data-testid='wiki-truth-final-reconciliation']");
    const colorRows = globalThis.document.querySelectorAll("[data-testid='cannabis-law-color-table'] tbody tr").length;
    const bodyText = globalThis.document.body.textContent || "";
    return {
      hasHorizontalScroll: Boolean(
        tableWrap &&
          table &&
          ((tableWrap.scrollWidth > tableWrap.clientWidth) || (table.scrollWidth > tableWrap.clientWidth))
      ),
      pollutedOfficialCells,
      registryRows,
      officialSignals,
      colorRows,
      final: final
        ? {
            rowsTotal: final.getAttribute("data-rows-total"),
            rowsExpected: final.getAttribute("data-rows-expected"),
            complete: final.getAttribute("data-complete"),
            conflicts: final.getAttribute("data-cross-layer-conflicts"),
            unprovenGreen: final.getAttribute("data-unproven-green"),
            noMutation: final.getAttribute("data-no-mutation")
          }
        : null,
      hasLegacyReauditCounters:
        bodyText.includes("Честно осталось серыми") ||
        bodyText.includes("Цвет закрыт повторной проверкой") ||
        bodyText.includes("Повторно проверено серых строк")
    };
  });
  if (!proof.hasHorizontalScroll) {
    throw new Error("WIKI_TRUTH_TABLE_NO_HORIZONTAL_SCROLL");
  }
  if (proof.pollutedOfficialCells.length) {
    throw new Error(`WIKI_TRUTH_TABLE_OFFICIAL_POLLUTION count=${proof.pollutedOfficialCells.length}`);
  }
  if (proof.registryRows < 418) {
    throw new Error(`OFFICIAL_OWNERSHIP_VIEW_SHRANK rows=${proof.registryRows}`);
  }
  if (!proof.officialSignals.some((value) => /yes|no|да|нет/i.test(value))) {
    throw new Error("OFFICIAL_SIGNAL_RENDER_MISSING");
  }
  if (
    !proof.final ||
    proof.final.rowsTotal !== "307" ||
    proof.final.rowsExpected !== "307" ||
    proof.final.complete !== "1" ||
    proof.final.conflicts !== "0" ||
    proof.final.unprovenGreen !== "0" ||
    proof.final.noMutation !== "1"
  ) {
    throw new Error(`WIKI_TRUTH_FINAL_RECONCILIATION_INVALID ${JSON.stringify(proof.final)}`);
  }
  if (proof.colorRows !== 307) {
    throw new Error(`WIKI_TRUTH_COLOR_ROWS_INVALID rows=${proof.colorRows}`);
  }
  if (proof.hasLegacyReauditCounters) {
    throw new Error("WIKI_TRUTH_LEGACY_REAUDIT_COUNTERS_RENDERED");
  }
  globalThis.console.log(
    `WIKI_TRUTH_UI_SMOKE=PASS headers=${requiredHeaders.length} colors=${proof.colorRows} final=307/307`
  );
} finally {
  try {
    await browser.close();
  } finally {
    slot.release();
  }
  assertNodeRuntimeSettled("wiki-truth-table-smoke");
}
