#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const args = new Map(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.split("=");
  return [key, rest.join("=") || true];
}));
const manifestPath = path.resolve(String(args.get("--manifest") || ""));
if (!manifestPath || !fs.existsSync(manifestPath)) {
  throw new Error("Pass --manifest=/absolute/path/to/manifest.json");
}
const outputDir = path.resolve(String(args.get("--output") || path.join(path.dirname(manifestPath), "contact-sheets")));
const columns = 3;
const rowsPerSheet = 3;
const thumbWidth = 480;
const thumbHeight = 320;
const labelHeight = 54;
const gutter = 12;
const itemsPerSheet = columns * rowsPerSheet;

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const items = (manifest.results || [])
  .filter((row) => row.screenshot_path && fs.existsSync(row.screenshot_path))
  .sort((a, b) => a.geo.localeCompare(b.geo) || a.source_index - b.source_index);
fs.mkdirSync(outputDir, { recursive: true });

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function tile(row) {
  const image = await sharp(row.screenshot_path)
    .resize(thumbWidth, thumbHeight, { fit: "contain", background: "#f8fafc", position: "top" })
    .png()
    .toBuffer();
  const verdict = row.capture_error
    ? "CAPTURE_ERROR"
    : row.error_like
      ? "ERROR_SCREEN"
      : row.cannabis_term_hits > 0
        ? `VISIBLE_MARKERS=${row.cannabis_term_hits}`
        : "NO_VISIBLE_MARKER";
  const label = Buffer.from(`<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#111827"/>
    <text x="12" y="22" fill="#ffffff" font-family="Arial,sans-serif" font-size="17" font-weight="700">${escapeXml(row.geo)} source ${row.source_index}</text>
    <text x="12" y="43" fill="#d1d5db" font-family="Arial,sans-serif" font-size="14">${escapeXml(verdict)} · ${escapeXml(row.title).slice(0, 65)}</text>
  </svg>`);
  return sharp({
    create: {
      width: thumbWidth,
      height: thumbHeight + labelHeight,
      channels: 4,
      background: "#ffffff"
    }
  }).composite([
    { input: image, top: 0, left: 0 },
    { input: label, top: thumbHeight, left: 0 }
  ]).png().toBuffer();
}

const sheets = [];
for (let offset = 0; offset < items.length; offset += itemsPerSheet) {
  const group = items.slice(offset, offset + itemsPerSheet);
  const tiles = await Promise.all(group.map(tile));
  const sheetWidth = columns * thumbWidth + (columns + 1) * gutter;
  const sheetHeight = rowsPerSheet * (thumbHeight + labelHeight) + (rowsPerSheet + 1) * gutter;
  const composite = tiles.map((input, index) => ({
    input,
    left: gutter + (index % columns) * (thumbWidth + gutter),
    top: gutter + Math.floor(index / columns) * (thumbHeight + labelHeight + gutter)
  }));
  const sheetNumber = Math.floor(offset / itemsPerSheet) + 1;
  const outputPath = path.join(outputDir, `sheet-${String(sheetNumber).padStart(2, "0")}.png`);
  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: "#e5e7eb"
    }
  }).composite(composite).png().toFile(outputPath);
  sheets.push({
    sheet: outputPath,
    rows: group.map((row) => ({ geo: row.geo, source_index: row.source_index, screenshot_path: row.screenshot_path }))
  });
}

const indexPath = path.join(outputDir, "index.json");
fs.writeFileSync(indexPath, `${JSON.stringify({ generated_at: new Date().toISOString(), manifest: manifestPath, sheets }, null, 2)}\n`);
console.log(`CANNABIS_LAW_CONTACT_SHEETS items=${items.length} sheets=${sheets.length}`);
console.log(`CANNABIS_LAW_CONTACT_SHEETS_INDEX=${indexPath}`);
