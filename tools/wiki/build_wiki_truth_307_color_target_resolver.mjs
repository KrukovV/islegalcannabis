#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const AUTHORIZATION_PACKET_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-authorization-packet.json",
);
const COUNTRY_DIR = path.join(ROOT, "data/countries");
const STATUS_V9_PATH = path.join(ROOT, "data/status-engine/status_ssot_v9.json");
const MANUAL_OVERRIDES_PATH = path.join(
  ROOT,
  "data/status-engine/manual_review_overrides.json",
);
const STATUS_SNAPSHOT_PATH = path.join(
  ROOT,
  "data/status-engine/status_snapshot_after.json",
);
const INDEX_PATH = path.join(ROOT, "data/index.json");
const DISPUTED_GEO_SOURCES_PATH = path.join(
  ROOT,
  "apps/web/src/lib/disputedGeoSources.ts",
);
const COUNTRY_SOURCE_PATH = path.join(ROOT, "apps/web/src/new-map/countrySource.ts");
const STATIC_COUNTRIES_PATH = path.join(ROOT, "apps/web/src/new-map/staticCountries.ts");
const OUT_JSON_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-target-resolver.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-target-resolver.md",
);

const MEDICAL_LIMITED_KEYWORDS = [
  "limited",
  "prescription",
  "special permit",
  "compassionate use",
  "pharmaceutical",
  "production",
  "cultivation",
  "export",
  "import",
  "research",
  "cbd",
  "sativex",
  "epidiolex",
  "cannabinoid drugs",
  "cannabinoid",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath, fallback) {
  return fs.existsSync(filePath) ? readJson(filePath) : fallback;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function relative(filePath) {
  return path.relative(ROOT, filePath);
}

function fileProof(filePath) {
  const exists = fs.existsSync(filePath);
  return {
    path: relative(filePath),
    exists,
    sha256: exists ? sha256File(filePath) : null,
  };
}

function normalizeGeo(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeSlug(value) {
  return String(value || "").trim().toLowerCase();
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row) || "UNKNOWN";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function mdCell(value, limit = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  const trimmed = text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
  return (trimmed || "-").replace(/\|/g, "\\|");
}

function truthColorToMapCategory(color) {
  if (color === "GREEN") return "LEGAL_OR_DECRIM";
  if (color === "YELLOW") return "LIMITED_OR_MEDICAL";
  if (color === "RED") return "ILLEGAL";
  return "UNKNOWN";
}

function colorToRuntimeStatus(color) {
  if (color === "GREEN") return "LEGAL";
  if (color === "YELLOW") return "DECRIM";
  if (color === "RED") return "ILLEGAL";
  return "UNKNOWN";
}

function sourceTextFromCountryPage(data) {
  return [
    data?.notes_normalized,
    data?.notes_raw,
    data?.facts?.possession_limit,
    data?.facts?.cultivation,
    data?.facts?.penalty,
    ...(data?.legal_model?.signals?.explain || []),
    ...(data?.legal_model?.distribution?.flags || []),
    ...(data?.legal_model?.enforcement_flags || []),
    ...(data?.legal_model?.signals?.sources || []).map((item) => item?.title),
    ...(data?.sources?.citations || []).map((item) => item?.title),
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeRecreationalStatus(value) {
  const normalized = normalizeGeo(value);
  if (normalized === "LEGAL") return "LEGAL";
  if (
    [
      "DECRIMINALIZED",
      "DECRIM",
      "DECRIMINAL",
      "TOLERATED",
      "MIXED",
      "RESTRICTED",
      "LIMITED",
      "UNENFORCED",
      "TOLERANCE",
    ].includes(normalized)
  ) {
    return "DECRIMINALIZED";
  }
  if (normalized === "ILLEGAL") return "ILLEGAL";
  return null;
}

function normalizeMedicalStatus(status, rawStatus, sourceText) {
  const normalizedStatus = normalizeGeo(status);
  const raw = normalizeGeo(rawStatus);
  const folded = String(sourceText || "").toLowerCase();

  if (normalizedStatus === "LEGAL") return "REGULATED";
  if (normalizedStatus === "LIMITED") return "LIMITED";
  if (normalizedStatus === "ILLEGAL") return "NONE";
  if (raw === "REGULATED") return "REGULATED";
  if (raw === "LIMITED") return "LIMITED";
  if (raw === "NONE") return "NONE";
  if (MEDICAL_LIMITED_KEYWORDS.some((signal) => folded.includes(signal))) {
    return "LIMITED";
  }
  return null;
}

function evaluateRuntimeColor(input) {
  const recreational = input.recreational || null;
  const medical = input.medical || null;
  if (recreational === "LEGAL" || medical === "REGULATED") {
    return {
      color: "GREEN",
      mapCategory: truthColorToMapCategory("GREEN"),
      resultStatus: colorToRuntimeStatus("GREEN"),
      rule: medical === "REGULATED"
        ? "GREEN_OPERATIONAL_PATIENT_ACCESS"
        : "GREEN_ADULT_USE",
    };
  }
  if (recreational === "DECRIMINALIZED" || medical === "LIMITED") {
    return {
      color: "YELLOW",
      mapCategory: truthColorToMapCategory("YELLOW"),
      resultStatus: colorToRuntimeStatus("YELLOW"),
      rule: recreational === "DECRIMINALIZED"
        ? "YELLOW_DECRIM"
        : "YELLOW_MEDICAL_LIMITED",
    };
  }
  if (!recreational && !medical) {
    return {
      color: "UNKNOWN",
      mapCategory: "UNKNOWN",
      resultStatus: "UNKNOWN",
      rule: "UNKNOWN_MISSING_SIGNALS",
    };
  }
  if (recreational === "ILLEGAL" && medical === "NONE") {
    return {
      color: "RED",
      mapCategory: truthColorToMapCategory("RED"),
      resultStatus: colorToRuntimeStatus("RED"),
      rule: "RED_NO_LEGAL_PATIENT_ACCESS",
    };
  }
  return {
    color: "UNKNOWN",
    mapCategory: "UNKNOWN",
    resultStatus: "UNKNOWN",
    rule: "UNKNOWN_MISSING_SIGNALS",
  };
}

function mapOverrideToCountryLikeStatus(override) {
  if (!override) return null;
  return {
    recreational: override.recreational === "LEGAL" ? "LEGAL" : "ILLEGAL",
    medical:
      override.medical === "REGULATED"
        ? "REGULATED"
        : override.medical === "LIMITED"
          ? "LIMITED"
          : "NONE",
  };
}

function deriveCountryRuntime(data, override) {
  const overrideStatus = mapOverrideToCountryLikeStatus(override);
  const sourceText = override?.notes || sourceTextFromCountryPage(data);
  const recreational = overrideStatus
    ? overrideStatus.recreational
    : normalizeRecreationalStatus(data?.legal_model?.recreational?.status);
  const medical = overrideStatus
    ? overrideStatus.medical
    : normalizeMedicalStatus(
        data?.legal_model?.medical?.status,
        data?.legal_model?.medical?.raw_status,
        sourceText,
      );
  return {
    ...evaluateRuntimeColor({ recreational, medical }),
    input: {
      recreational,
      medical,
      source: override ? "manual_review_override_over_country_json" : "country_json",
    },
  };
}

function deriveStatusV9Runtime(entry, override) {
  const overrideStatus = mapOverrideToCountryLikeStatus(override);
  if (overrideStatus) {
    return {
      ...evaluateRuntimeColor(overrideStatus),
      input: {
        recreational: overrideStatus.recreational,
        medical: overrideStatus.medical,
        source: "manual_review_override_fallback",
      },
    };
  }
  if (!entry) return null;
  const color = normalizeGeo(entry.color);
  const normalizedColor = ["GREEN", "YELLOW", "RED"].includes(color) ? color : "UNKNOWN";
  return {
    color: normalizedColor,
    mapCategory: truthColorToMapCategory(normalizedColor),
    resultStatus: colorToRuntimeStatus(normalizedColor),
    rule: `STATUS_SSOT_V9_${normalizedColor}`,
    input: {
      recreational: entry.recreational || null,
      medical: entry.medical || null,
      source: "status_ssot_v9",
    },
  };
}

function loadCountryTargets() {
  const files = fs.readdirSync(COUNTRY_DIR).filter((file) => file.endsWith(".json"));
  const byGeo = new Map();
  const byIso2 = new Map();
  const byCode = new Map();
  for (const file of files) {
    const filePath = path.join(COUNTRY_DIR, file);
    const data = readJson(filePath);
    const target = {
      file,
      path: relative(filePath),
      data,
    };
    const keys = [
      data?.geo_code,
      data?.iso2,
      data?.code,
      file.replace(/\.json$/i, ""),
    ];
    for (const key of keys) {
      const normalizedGeo = normalizeGeo(key);
      const normalizedSlug = normalizeSlug(key);
      if (normalizedGeo) byGeo.set(normalizedGeo, target);
      if (normalizedGeo) byIso2.set(normalizedGeo, target);
      if (normalizedSlug) byCode.set(normalizedSlug, target);
    }
  }
  return {
    filesTotal: files.length,
    byGeo,
    byIso2,
    byCode,
  };
}

function loadStatusV9Targets() {
  const payload = readJsonIfExists(STATUS_V9_PATH, { entries: {} });
  const rows = Array.isArray(payload.entries)
    ? payload.entries
    : Object.values(payload.entries || {});
  const byGeo = new Map();
  for (const row of rows) {
    const geo = normalizeGeo(row?.id || row?.geo);
    if (!geo) continue;
    byGeo.set(geo, row);
  }
  return {
    rowsTotal: rows.length,
    byGeo,
  };
}

function loadManualOverrides() {
  const payload = readJsonIfExists(MANUAL_OVERRIDES_PATH, { entries: {} });
  return payload.entries || {};
}

function loadDisputedGeoCodes() {
  if (!fs.existsSync(DISPUTED_GEO_SOURCES_PATH)) return new Set();
  const source = fs.readFileSync(DISPUTED_GEO_SOURCES_PATH, "utf8");
  const codes = [...source.matchAll(/^\s*([A-Z0-9-]{2,8}):\s*\{/gm)]
    .map((match) => normalizeGeo(match[1]))
    .filter(Boolean);
  return new Set(codes);
}

function resolveCountryTarget(geo, countryTargets) {
  return (
    countryTargets.byGeo.get(geo) ||
    countryTargets.byIso2.get(geo) ||
    countryTargets.byCode.get(geo.toLowerCase()) ||
    null
  );
}

function targetSummaryForRow(packetRow, countryTargets, statusV9Targets, manualOverrides, disputedGeoCodes) {
  const geo = normalizeGeo(packetRow.geo);
  const countryTarget = resolveCountryTarget(geo, countryTargets);
  const manualOverride = manualOverrides[geo] || null;
  const statusV9Target = statusV9Targets.byGeo.get(geo) || null;
  const targetFamily = countryTarget
    ? "COUNTRY_PAGE_JSON_RUNTIME_SOURCE"
    : statusV9Target || manualOverride
      ? "STATUS_ENGINE_V9_FALLBACK_SOURCE"
      : disputedGeoCodes.has(geo)
        ? "DISPUTED_GEO_NO_DIRECT_STATUS_TARGET"
        : "UNRESOLVED_TARGET";
  const runtime = countryTarget
    ? deriveCountryRuntime(countryTarget.data, manualOverride)
    : deriveStatusV9Runtime(statusV9Target, manualOverride);
  const targetPath = countryTarget
    ? countryTarget.path
    : statusV9Target
      ? `${relative(STATUS_V9_PATH)} entries[id=${geo}]`
      : manualOverride
        ? `${relative(MANUAL_OVERRIDES_PATH)} entries.${geo}`
        : null;
  const manualOverridePath = manualOverride
    ? `${relative(MANUAL_OVERRIDES_PATH)} entries.${geo}`
    : null;
  const targetResolved = targetFamily !== "UNRESOLVED_TARGET" &&
    targetFamily !== "DISPUTED_GEO_NO_DIRECT_STATUS_TARGET";
  const desiredColor = normalizeGeo(packetRow.proposedTruthColor) || "UNKNOWN";
  return {
    geo,
    territory: packetRow.territory,
    targetFamily,
    targetResolved,
    targetPath,
    manualOverridePath,
    statusV9TargetPath: statusV9Target
      ? `${relative(STATUS_V9_PATH)} entries[id=${geo}]`
      : null,
    countryPageCode: countryTarget?.data?.code || null,
    countryPageIso2: countryTarget?.data?.iso2 || null,
    currentRuntimeColor: runtime?.color || "UNKNOWN",
    currentRuntimeMapCategory: runtime?.mapCategory || "UNKNOWN",
    currentRuntimeRule: runtime?.rule || null,
    currentRuntimeInput: runtime?.input || null,
    packetCurrentColor: packetRow.currentColor,
    packetCurrentMatchesRuntime: (runtime?.color || "UNKNOWN") === packetRow.currentColor,
    proposedTruthColor: desiredColor,
    proposedRuntimeMapCategory: truthColorToMapCategory(desiredColor),
    proposedRuntimeStatus: colorToRuntimeStatus(desiredColor),
    truthRule: packetRow.truthRule,
    reviewDecision: packetRow.reviewDecision,
    targetMutationAllowedNow: false,
    targetMutationRequires: [
      "EXPLICIT_AUTHORIZATION",
      "SSOT_WRITE=1",
      "LEGAL_AXIS_PATCH_REVIEW",
      "COUNTRY_HASH_RECOMPUTE_WHEN_COUNTRY_JSON_CHANGES",
      "STATIC_COUNTRIES_HASH_REGEN_WHEN_RUNTIME_COUNTRIES_JSON_CHANGES",
    ],
    blockingReasons: [
      ...(targetResolved ? [] : ["TARGET_NOT_RESOLVED"]),
      ...((runtime?.color || "UNKNOWN") === packetRow.currentColor
        ? []
        : ["PACKET_CURRENT_COLOR_DIFFERS_FROM_LOCAL_RUNTIME"]),
      "AUTHORIZATION_MISSING",
      "SSOT_WRITE_NOT_ENABLED",
    ],
  };
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Color Target Resolver");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Resolver status: ${output.resolverStatus}`);
  lines.push(`Non-mutating: ${output.nonMutating ? "TRUE" : "FALSE"}`);
  lines.push(`Local only: ${output.localOnly ? "TRUE" : "FALSE"}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push(`Packet rows: ${output.rowsTotal}`);
  lines.push("");
  lines.push("## Runtime data flow");
  lines.push("");
  for (const step of output.runtimeDataFlow) {
    lines.push(`- ${step}`);
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- country JSON targets: ${output.summary.countryJsonTargets}`);
  lines.push(`- status v9 fallback targets: ${output.summary.statusV9FallbackTargets}`);
  lines.push(`- unresolved targets: ${output.summary.unresolvedTargets}`);
  lines.push(`- packet/current runtime mismatches: ${output.summary.packetCurrentRuntimeMismatches}`);
  lines.push(`- direct mutation allowed now: ${output.summary.directMutationAllowedNow ? "TRUE" : "FALSE"}`);
  lines.push("");
  lines.push("## Blocking reasons");
  lines.push("");
  for (const reason of output.blockingReasons) {
    lines.push(`- \`${reason}\``);
  }
  lines.push("");
  lines.push("## Hash proof");
  lines.push("");
  lines.push("| File | Exists | SHA-256 |");
  lines.push("| --- | --- | --- |");
  for (const item of output.hashProof) {
    lines.push(`| ${mdCell(item.path)} | ${item.exists ? "TRUE" : "FALSE"} | ${mdCell(item.sha256)} |`);
  }
  lines.push("");
  lines.push("## Target rows");
  lines.push("");
  lines.push("| GEO | Territory | Target family | Target path | Runtime current | Packet current | Truth target | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.rows) {
    const status = row.targetResolved
      ? row.packetCurrentMatchesRuntime
        ? "TARGET_RESOLVED_CURRENT_MATCHES"
        : "TARGET_RESOLVED_CURRENT_MISMATCH"
      : "TARGET_UNRESOLVED";
    lines.push(
      `| ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${mdCell(row.targetFamily)} | ${mdCell(row.targetPath)} | ${mdCell(row.currentRuntimeColor)} | ${mdCell(row.packetCurrentColor)} | ${mdCell(row.proposedTruthColor)} | ${mdCell(status)} |`,
    );
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- This resolver is a local dry-run artifact only; it does not update country JSON, status snapshots, SSOT, static map assets, or production.");
  lines.push("- `data/countries/*.json` is the direct runtime source when a country page exists; some territory/disputed rows are currently served through fallback status layers instead.");
  lines.push("- A future authorized apply step must patch the legal axes, recompute country hashes where needed, and regenerate the static countries hash instead of editing colors directly.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const packet = readJson(AUTHORIZATION_PACKET_PATH);
  const packetRows = Array.isArray(packet.rows) ? packet.rows : [];
  const countryTargets = loadCountryTargets();
  const statusV9Targets = loadStatusV9Targets();
  const manualOverrides = loadManualOverrides();
  const disputedGeoCodes = loadDisputedGeoCodes();
  const rows = packetRows.map((packetRow) =>
    targetSummaryForRow(packetRow, countryTargets, statusV9Targets, manualOverrides, disputedGeoCodes),
  );
  const unresolvedRows = rows.filter((row) => !row.targetResolved);
  const runtimeMismatches = rows.filter((row) => !row.packetCurrentMatchesRuntime);
  const blockingReasons = [];
  if (unresolvedRows.length) blockingReasons.push("TARGET_ROWS_UNRESOLVED");
  if (runtimeMismatches.length) blockingReasons.push("PACKET_CURRENT_COLOR_DIFFERS_FROM_LOCAL_RUNTIME");
  blockingReasons.push("AUTHORIZATION_MISSING");
  blockingReasons.push("SSOT_WRITE_NOT_ENABLED");
  blockingReasons.push("LEGAL_AXIS_PATCH_REVIEW_REQUIRED");
  blockingReasons.push("STATIC_COUNTRIES_HASH_REGEN_REQUIRED_FOR_RUNTIME_CHANGE");

  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    nonMutating: true,
    localOnly: true,
    resolverStatus: unresolvedRows.length
      ? "TARGET_RESOLVER_INCOMPLETE_NO_MUTATION"
      : "TARGET_RESOLVER_READY_NO_MUTATION",
    mutationPolicy:
      "This resolver writes only data/reviews artifacts. It does not update SSOT, map colors, country JSON, status snapshots, static countries assets, or production.",
    inputAuthorizationPacket: relative(AUTHORIZATION_PACKET_PATH),
    rowsTotal: packetRows.length,
    appliedRows: 0,
    runtimeDataFlow: [
      "`/api/new-map/countries?inline=1` calls `getStaticCountriesAsset()`.",
      "`getStaticCountriesAsset()` builds slim GeoJSON from `buildStaticCountrySourceSnapshot()`.",
      "`buildStaticCountrySourceSnapshot()` calls `buildCountrySourceSnapshot()`.",
      "`buildCountrySourceSnapshot()` overlays `data/countries/*.json` through `getCountryPageIndexByGeoCode()` when a country page exists.",
      "Rows without country page data can remain on fallback map/status layers such as `data/status-engine/status_ssot_v9.json`, `manual_review_overrides.json`, disputed GEO fallbacks, or geometry-derived map properties.",
    ],
    sourceInventories: {
      countryJsonFiles: countryTargets.filesTotal,
      statusV9Rows: statusV9Targets.rowsTotal,
      manualReviewOverrideRows: Object.keys(manualOverrides).length,
    },
    summary: {
      countryJsonTargets: rows.filter((row) => row.targetFamily === "COUNTRY_PAGE_JSON_RUNTIME_SOURCE").length,
      statusV9FallbackTargets: rows.filter((row) => row.targetFamily === "STATUS_ENGINE_V9_FALLBACK_SOURCE").length,
      unresolvedTargets: unresolvedRows.length,
      packetCurrentRuntimeMatches: rows.length - runtimeMismatches.length,
      packetCurrentRuntimeMismatches: runtimeMismatches.length,
      directMutationAllowedNow: false,
      targetFamilyCounts: countBy(rows, (row) => row.targetFamily),
      proposedTruthColorCounts: countBy(rows, (row) => row.proposedTruthColor),
      currentRuntimeColorCounts: countBy(rows, (row) => row.currentRuntimeColor),
    },
    blockingReasons,
    unresolvedGeos: unresolvedRows.map((row) => row.geo),
    packetCurrentRuntimeMismatches: runtimeMismatches.map((row) => ({
      geo: row.geo,
      territory: row.territory,
      targetFamily: row.targetFamily,
      targetPath: row.targetPath,
      packetCurrentColor: row.packetCurrentColor,
      currentRuntimeColor: row.currentRuntimeColor,
      proposedTruthColor: row.proposedTruthColor,
    })),
    hashProof: [
      fileProof(AUTHORIZATION_PACKET_PATH),
      fileProof(COUNTRY_SOURCE_PATH),
      fileProof(STATIC_COUNTRIES_PATH),
      fileProof(DISPUTED_GEO_SOURCES_PATH),
      fileProof(STATUS_V9_PATH),
      fileProof(MANUAL_OVERRIDES_PATH),
      fileProof(STATUS_SNAPSHOT_PATH),
      fileProof(INDEX_PATH),
    ],
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`COLOR_TARGET_RESOLVER_STATUS=${output.resolverStatus}`);
  console.log(`COLOR_TARGET_RESOLVER_ROWS=${output.rowsTotal}`);
  console.log(`COLOR_TARGET_RESOLVER_COUNTRY_JSON_TARGETS=${output.summary.countryJsonTargets}`);
  console.log(`COLOR_TARGET_RESOLVER_STATUS_V9_FALLBACK_TARGETS=${output.summary.statusV9FallbackTargets}`);
  console.log(`COLOR_TARGET_RESOLVER_UNRESOLVED=${output.summary.unresolvedTargets}`);
  console.log(`COLOR_TARGET_RESOLVER_RUNTIME_MISMATCHES=${output.summary.packetCurrentRuntimeMismatches}`);
  console.log(`COLOR_TARGET_RESOLVER_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`COLOR_TARGET_RESOLVER_OUTPUT=${relative(OUT_JSON_PATH)}`);
  console.log(`COLOR_TARGET_RESOLVER_MARKDOWN=${relative(OUT_MD_PATH)}`);
}

main();
