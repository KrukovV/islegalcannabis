function writeLine(key, value) {
  process.stdout.write(`${key}=${value}\n`);
}

const mapEnabled = process.env.MAP_ENABLED === "1";
const premium = process.env.PREMIUM === "1" || process.env.NEXT_PUBLIC_PREMIUM === "1";
if (!mapEnabled || !premium) {
  writeLine("MAP_RENDERED", "NO");
  writeLine("MAP_SMOKE_OK", "0");
  writeLine("MAP_SMOKE_REASON", "MAP_DISABLED");
  process.exit(1);
}

const playwrightPkg = process.env.PLAYWRIGHT_PKG || "@playwright/test";
let chromium;
try {
  const require = (await import("node:module")).createRequire(import.meta.url);
  const playwright = require(playwrightPkg);
  chromium = playwright.chromium;
} catch (err) {
  writeLine("MAP_RENDERED", "NO");
  writeLine("MAP_SMOKE_OK", "0");
  writeLine("MAP_SMOKE_REASON", "PLAYWRIGHT_MISSING");
  process.exit(1);
}

const url = process.env.MAP_SMOKE_URL || "http://127.0.0.1:3000/";
const browser = await chromium.launch();
const page = await browser.newPage();
let rendered = false;
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForSelector('[data-testid="leaflet-map"]', { timeout: 15000 });
  const hasLeaflet = await page.evaluate(
    () => Boolean(document.querySelector(".leaflet-pane"))
  );
  rendered = hasLeaflet;
} catch {
  rendered = false;
} finally {
  await browser.close();
}

writeLine("MAP_RENDERED", rendered ? "YES" : "NO");
writeLine("MAP_SMOKE_OK", rendered ? "1" : "0");
if (!rendered) {
  writeLine("MAP_SMOKE_REASON", "LEAFLET_NOT_RENDERED");
  process.exit(1);
}
