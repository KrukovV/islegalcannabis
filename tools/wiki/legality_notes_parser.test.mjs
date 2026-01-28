import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  isMainOnlyRaw,
  extractNotesFromWikitextSections,
  notesTextFromRaw,
  stripWikiMarkup
} from "./legality_wikitext_parser.mjs";

const FIXTURE_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "__fixtures__",
  "legality_notes_rows.ru_ro.html"
);

function stripHtmlNotes(value) {
  let text = String(value || "");
  text = text.replace(/\{\{\s*cvt\|([^}|]+)\|([^}|]+)[^}]*\}\}/gi, "$1 $2");
  text = text.replace(/\{\{\s*convert\|([^}|]+)\|([^}|]+)[^}]*\}\}/gi, "$1 $2");
  text = text.replace(/<sup[\s\S]*?<\/sup>/gi, " ");
  text = text.replace(/<ref[\s\S]*?<\/ref>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;|&#160;/gi, " ");
  text = text.replace(/&#91;|\[|\]/g, " ");
  text = text.replace(/\{\{[\s\S]*?\}\}/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function parseNotesFromHtmlRow(rowHtml) {
  const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(
    (match) => match[1]
  );
  const notesCell = cells[cells.length - 1] || "";
  const notesText = stripHtmlNotes(
    notesCell.replace(/Main article:\s*<a[^>]*>[\s\S]*?<\/a>/gi, " ")
  );
  return notesText;
}

function extractRowByTitle(html, title) {
  const match = html.match(
    new RegExp(`<td[^>]*>[^<]*<a[^>]*title=\"${title}\"[\\s\\S]*?<\\/tr>`, "i")
  );
  return match ? match[0] : "";
}

test("html notes parser: RO includes 2-7 years and 2013", () => {
  const html = fs.readFileSync(FIXTURE_PATH, "utf8");
  const row = extractRowByTitle(html, "Romania");
  assert.ok(row, "missing Romania row");
  const notes = parseNotesFromHtmlRow(row);
  assert.ok(notes.includes("2-7 years"), "missing 2-7 years");
  assert.ok(notes.includes("approved in 2013"), "missing approved in 2013");
  assert.ok(!/Main article/i.test(notes), "RO notes still main-only");
  assert.ok(!notes.includes("[219]"), "reference markers not stripped");
  assert.ok(notes.length >= 120, "RO notes too short");
});

test("html notes parser: RU keeps 6 g and 2 g", () => {
  const html = fs.readFileSync(FIXTURE_PATH, "utf8");
  const row = extractRowByTitle(html, "Russia");
  assert.ok(row, "missing Russia row");
  const notes = parseNotesFromHtmlRow(row);
  assert.ok(notes.includes("6 g"), "missing 6 g");
  assert.ok(notes.includes("2 g"), "missing 2 g");
  assert.ok(!/Main article/i.test(notes), "RU notes still main-only");
  assert.ok(notes.length >= 120, "RU notes too short");
});

test("html notes parser: AU includes ACT, date, and 50 g", () => {
  const html = fs.readFileSync(FIXTURE_PATH, "utf8");
  const row = extractRowByTitle(html, "Australia");
  assert.ok(row, "missing Australia row");
  const notes = parseNotesFromHtmlRow(row);
  assert.ok(notes.includes("Australian Capital Territory"), "missing ACT");
  assert.ok(notes.includes("31 January 2020"), "missing date");
  assert.ok(notes.includes("50 g"), "missing 50 g");
  assert.ok(!/Main article/i.test(notes), "AU notes still main-only");
  assert.ok(notes.length >= 120, "AU notes too short");
});

test("wikitext notes: cvt renders 6 g and 2 g", () => {
  const raw = `{{cvt|6|g|frac=5}} and {{cvt|2|g|frac=20|disp=comma}}`;
  const text = stripWikiMarkup(raw);
  assert.ok(text.includes("6 g"), "missing 6 g");
  assert.ok(text.includes("2 g"), "missing 2 g");
});

test("wikitext notes: main-only keeps main article label", () => {
  const raw = "{{main|Cannabis in Kosovo}}";
  assert.ok(isMainOnlyRaw(raw), "expected main-only raw");
  const text = notesTextFromRaw(raw);
  assert.ok(text.startsWith("Main article:"), "missing main article label");
  assert.ok(/Cannabis in Kosovo/.test(text), "missing main article title");
});

test("wikitext sections: penalties extracted", () => {
  const wikitext = `
== History ==
Some background.
== Penalties ==
{{main|Cannabis in Russia}}
Possession of up to 6 g of cannabis is an administrative offence.
== See also ==
Other pages.
`;
  const notes = extractNotesFromWikitextSections(wikitext);
  assert.ok(notes.includes("Possession of up to 6 g"), "missing penalties text");
  assert.ok(!/Main article/i.test(notes), "unexpected main article placeholder");
});

test("wiki_db_gate: RU/RO/AU strict passes", () => {
  const result = spawnSync(
    "node",
    ["tools/wiki/wiki_db_gate.mjs", "--geos", "RU,RO,AU"],
    {
      env: {
        ...process.env,
        NOTES_STRICT: "1",
        NOTES_MIN_LEN_BY_GEO: "RU:80,RO:80,AU:80"
      },
      encoding: "utf8"
    }
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(result.stdout.includes("WIKI_DB_GATE_OK=1"), "gate not ok");
});
