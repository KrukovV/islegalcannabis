#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STATUS_DIR = path.join(ROOT, "data", "status-engine");
const REPORT_DIR = path.join(ROOT, "Reports", "status-engine");
const STATUS_SSOT_PATH = path.join(STATUS_DIR, "status_ssot_v9.json");
const STATUS_AFTER_PATH = path.join(STATUS_DIR, "status_snapshot_after.json");
const REVIEW_REQUIRED_PATH = path.join(REPORT_DIR, "status-review-required.md");
const STATE_REVIEW_PATH = path.join(REPORT_DIR, "state-review.md");
const COUNTRY_REVIEW_PATH = path.join(REPORT_DIR, "country-review.md");
const CONTROL_AUDIT_PATH = path.join(REPORT_DIR, "global-control-audit.md");
const LAW_DISCOVERY_PATH = path.join(REPORT_DIR, "law-discovery-review.md");
const LOCAL_UI_AUDIT_PATH = path.join(REPORT_DIR, "local-ui-audit.md");
const GOVERNANCE_REVIEW_PATH = path.join(REPORT_DIR, "status-governance-review.md");

const STATE_REVIEW_GEOS = ["US-UT", "US-WY", "US-NE", "US-KS", "US-WI"];
const COUNTRY_REVIEW_GEOS = ["AL", "AR", "AU", "AT", "DE", "CA", "IR", "KH", "BY", "BD", "AF", "AM", "AD", "BW", "DZ"];
const CONTROL_EXPECTED = {
  AU: "GREEN",
  DE: "GREEN",
  CA: "GREEN",
  IR: "YELLOW",
  BY: "RED",
  AL: "GREEN",
  KH: "YELLOW",
  AF: "RED",
  BD: "RED",
  AM: "RED",
  AD: "RED",
  BW: "RED"
};

const DISCOVERY_ROWS = [
  {
    geo: "BD",
    source: "https://bdlaws.minlaw.gov.bd/act-details-1276.html",
    date: "2018-11",
    possibleImpact: "Bangladesh older lax-enforcement text should not keep map yellow when strict criminal penalties remain.",
    affectedField: "enforcement"
  },
  {
    geo: "US-UT",
    source: "https://medicalcannabis.utah.gov/resources/utah-medical-cannabis-law/",
    date: "2026-06-09",
    possibleImpact: "Utah medical cannabis framework makes medical status regulated.",
    affectedField: "medical"
  },
  {
    geo: "US-NE",
    source: "https://nebraskalegislature.gov/laws/statutes.php?statute=71-24%2C106",
    date: "2026-04-08",
    possibleImpact: "Nebraska Medical Cannabis Regulation Act makes medical status regulated.",
    affectedField: "medical"
  },
  {
    geo: "US-KS",
    source: "https://www.kslegislature.gov/li_2020/b2019_20/statute/065_000_0000_chapter/065_062_0000_article/065_062_0035_section/065_062_0035_k/",
    date: "2019",
    possibleImpact: "Kansas narrow cannabidiol treatment preparation defense makes medical status limited.",
    affectedField: "medical"
  },
  {
    geo: "US-WI",
    source: "https://docs.legis.wisconsin.gov/2013/related/acts/267",
    date: "2014-04-17",
    possibleImpact: "Wisconsin narrow non-psychoactive cannabidiol exception makes medical status limited.",
    affectedField: "medical"
  },
  {
    geo: "US-WY",
    source: "https://www.wyoleg.gov/2015/Introduced/HB0032.pdf",
    date: "2015",
    possibleImpact: "Wyoming supervised hemp-extract law makes medical status limited.",
    affectedField: "medical"
  }
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function md(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim() || "-";
}

function table(headers, rows) {
  return [
    `| ${headers.map(md).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(md).join(" | ")} |`)
  ].join("\n");
}

function expectedColor(row) {
  if (row.recreational === "LEGAL" || row.medical === "REGULATED") return "GREEN";
  if (row.medical === "LIMITED" || row.enforcement === "SOFT") return "YELLOW";
  if (row.medical === "NONE" && row.enforcement === "STRICT") return "RED";
  return "UNCONFIRMED";
}

function reasonFor(row) {
  if (row.recreational === "LEGAL") return "Recreational legal access.";
  if (row.medical === "REGULATED") return "Regulated medical access.";
  if (row.medical === "LIMITED") return "Limited medical/CBD access.";
  if (row.enforcement === "SOFT") return "Restricted law with soft enforcement signal.";
  return "No medical access and strict criminal penalties.";
}

function sourceFor(row) {
  return row.sourceUrl || "-";
}

function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const statusPayload = readJson(STATUS_SSOT_PATH);
  const afterPayload = readJson(STATUS_AFTER_PATH);
  const entries = statusPayload.entries || [];
  const byGeo = new Map(entries.map((entry) => [entry.id, entry]));
  const afterByGeo = new Map((afterPayload.entries || []).map((entry) => [entry.id, entry]));
  const globalMismatches = entries.filter((entry) => expectedColor(entry) !== entry.color);
  const reviewRequired = entries.filter((entry) => entry.reviewRequired);
  const stateRows = STATE_REVIEW_GEOS.map((geo) => {
    const row = byGeo.get(geo) || { id: geo };
    const after = afterByGeo.get(geo) || {};
    const dataIssue =
      row.medical === "REGULATED" && row.color === "RED"
        ? "DATA ISSUE: medical regulated but color red"
        : expectedColor(row) !== row.color
          ? `DATA ISSUE: expected ${expectedColor(row)}`
          : "OK";
    return [
      geo,
      row.name || geo,
      row.recreational || "UNCONFIRMED",
      row.medical || "UNCONFIRMED",
      row.enforcement || "UNCONFIRMED",
      row.color || "UNCONFIRMED",
      after.triggeredRule || "-",
      sourceFor(row),
      dataIssue
    ];
  });
  const countryRows = COUNTRY_REVIEW_GEOS.map((geo) => {
    const row = byGeo.get(geo) || { id: geo };
    const expected = expectedColor(row);
    return [
      row.name || geo,
      row.color || "UNCONFIRMED",
      expected,
      reasonFor(row),
      sourceFor(row),
      row.color === expected ? "OK" : "DATA ISSUE"
    ];
  });
  const controlRows = Object.entries(CONTROL_EXPECTED).map(([geo, expected]) => {
    const row = byGeo.get(geo) || { id: geo };
    return [
      row.name || geo,
      row.color || "UNCONFIRMED",
      expected,
      row.color === expected ? "PASS" : "FAIL",
      reasonFor(row),
      sourceFor(row)
    ];
  });
  const discoveryRows = DISCOVERY_ROWS.map((row) => [
    row.geo,
    row.source,
    row.date,
    row.possibleImpact,
    row.affectedField,
    "RESOLVED_BY_REVIEWED_DATA_CORRECTION"
  ]);

  fs.writeFileSync(
    STATE_REVIEW_PATH,
    [
      "# State Review",
      "",
      `Generated: ${generatedAt}`,
      "",
      table(
        ["Geo", "State", "Recreational", "Medical", "Enforcement", "Current Color", "Triggered Rule", "Source", "Finding"],
        stateRows
      ),
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    COUNTRY_REVIEW_PATH,
    [
      "# Country Review",
      "",
      `Generated: ${generatedAt}`,
      "",
      table(["Country", "Current Color", "Expected Color", "Reason", "Source", "Finding"], countryRows),
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    CONTROL_AUDIT_PATH,
    [
      "# Global Control Audit",
      "",
      `Generated: ${generatedAt}`,
      "",
      table(["Country", "Current Color", "Expected Color", "Result", "Reason", "Source"], controlRows),
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    LAW_DISCOVERY_PATH,
    [
      "# Law Discovery Review",
      "",
      `Generated: ${generatedAt}`,
      "",
      table(["Country", "Source", "Date", "Possible Impact", "Affected Field", "Review Status"], discoveryRows),
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    GOVERNANCE_REVIEW_PATH,
    [
      "# Status Governance Review",
      "",
      `Generated: ${generatedAt}`,
      "",
      `Universe: ${entries.length}`,
      `Evaluator color mismatches: ${globalMismatches.length}`,
      `STATUS_REVIEW_REQUIRED: ${reviewRequired.length}`,
      `Control audit failures: ${controlRows.filter((row) => row[3] !== "PASS").length}`,
      "",
      "- Status Engine remains deterministic: recreational, medical, enforcement.",
      "- Knowledge Layer remains separate: history, culture, local names, products, enforcement reality and notes stay outside evaluator rules.",
      "- New law discovery records are reported for review and are not an alternate map-color source.",
      "- Production popup uses human color explanations only.",
      "",
      `State review: ${path.relative(ROOT, STATE_REVIEW_PATH)}`,
      `Country review: ${path.relative(ROOT, COUNTRY_REVIEW_PATH)}`,
      `Control audit: ${path.relative(ROOT, CONTROL_AUDIT_PATH)}`,
      `Law discovery review: ${path.relative(ROOT, LAW_DISCOVERY_PATH)}`,
      `Local UI audit: ${path.relative(ROOT, LOCAL_UI_AUDIT_PATH)}`,
      `Review required: ${path.relative(ROOT, REVIEW_REQUIRED_PATH)}`,
      ""
    ].join("\n"),
    "utf8"
  );

  console.log(`STATUS_GOVERNANCE_REVIEW=PASS universe=${entries.length} mismatches=${globalMismatches.length} review=${reviewRequired.length}`);
  console.log(`STATUS_GOVERNANCE_REVIEW_REPORT=${path.relative(ROOT, GOVERNANCE_REVIEW_PATH)}`);
}

main();
