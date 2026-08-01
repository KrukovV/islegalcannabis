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
const STATUS_SNAPSHOT_PATH = path.join(
  ROOT,
  "data/status-engine/status_snapshot_after.json",
);
const INDEX_PATH = path.join(ROOT, "data/index.json");
const OUT_JSON_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-apply-preview.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-color-apply-preview.md",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row) || "UNKNOWN";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function mdCell(value, limit = 260) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const trimmed = text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
  return trimmed.replace(/\|/g, "\\|");
}

function statusSnapshotRows(statusSnapshot, packetRows) {
  const entries = Array.isArray(statusSnapshot.entries) ? statusSnapshot.entries : [];
  const byGeo = new Map(
    entries.map((entry, index) => [String(entry.id || ""), { entry, index }]),
  );
  return packetRows.map((packetRow) => {
    const target = byGeo.get(packetRow.geo);
    const currentTargetColor = target?.entry?.newColor || null;
    const targetPresent = Boolean(target);
    const currentColorMatches =
      targetPresent && currentTargetColor === packetRow.currentColor;
    return {
      geo: packetRow.geo,
      territory: packetRow.territory,
      targetPath: targetPresent
        ? `data/status-engine/status_snapshot_after.json entries[${target.index}]`
        : null,
      targetPresent,
      currentTargetColor,
      packetCurrentColor: packetRow.currentColor,
      proposedTruthColor: packetRow.proposedTruthColor,
      currentColorMatches,
      previewMutation: targetPresent
        ? {
            newColor: {
              from: currentTargetColor,
              to: packetRow.proposedTruthColor,
            },
            proposedColor: {
              from: target.entry.proposedColor || null,
              to: packetRow.proposedTruthColor,
            },
            reviewRequired: {
              from: target.entry.reviewRequired ?? null,
              to: false,
            },
            triggeredRule: {
              from: target.entry.triggeredRule || null,
              to: `TRUTH_FIRST_${packetRow.truthRule}`,
            },
          }
        : null,
      status: !targetPresent
        ? "TARGET_ROW_MISSING"
        : currentColorMatches
          ? "TARGET_ROW_MATCHES_PACKET_CURRENT"
          : "TARGET_CURRENT_COLOR_MISMATCH",
    };
  });
}

function indexSchemaSummary(indexJson) {
  const isStringList = Array.isArray(indexJson) && indexJson.every((item) => typeof item === "string");
  return {
    path: relative(INDEX_PATH),
    topType: Array.isArray(indexJson) ? "array" : typeof indexJson,
    rowsTotal: Array.isArray(indexJson) ? indexJson.length : 0,
    schema: isStringList ? "STRING_SLUG_LIST" : "UNKNOWN",
    directColorTarget: false,
    reason: isStringList
      ? "data/index.json is a slug list in this repository state and has no per-GEO color fields to update."
      : "data/index.json is not recognized as a direct color target by this preview.",
  };
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Color Apply Preview");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Preview status: ${output.previewStatus}`);
  lines.push(`Non-mutating: ${output.nonMutating ? "TRUE" : "FALSE"}`);
  lines.push(`Applied rows: ${output.appliedRows}`);
  lines.push(`Packet rows: ${output.rowsTotal}`);
  lines.push("");
  lines.push("## Target mapping summary");
  lines.push("");
  lines.push(`- status snapshot matches: ${output.statusSnapshotSummary.currentColorMatches}`);
  lines.push(`- status snapshot current-color mismatches: ${output.statusSnapshotSummary.currentColorMismatches}`);
  lines.push(`- status snapshot missing rows: ${output.statusSnapshotSummary.missingRows}`);
  lines.push(`- data/index direct color target: ${output.indexSummary.directColorTarget ? "TRUE" : "FALSE"}`);
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
    lines.push(`| ${mdCell(item.path)} | ${item.exists ? "TRUE" : "FALSE"} | ${mdCell(item.sha256 || "-")} |`);
  }
  lines.push("");
  lines.push("## Status snapshot preview rows");
  lines.push("");
  lines.push("| GEO | Territory | Target present | Current target | Packet current | Truth target | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of output.statusSnapshotRows) {
    lines.push(
      `| ${mdCell(row.geo)} | ${mdCell(row.territory)} | ${row.targetPresent ? "TRUE" : "FALSE"} | ${mdCell(row.currentTargetColor || "-")} | ${mdCell(row.packetCurrentColor)} | ${mdCell(row.proposedTruthColor)} | ${mdCell(row.status)} |`,
    );
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- This is a dry preview only; it does not apply colors.");
  lines.push("- The preview deliberately refuses to call the protected target mapping ready while target rows are missing or current target colors differ from the authorization packet.");
  lines.push("- A future apply step must first select the authoritative local color target and reconcile mismatched current colors, then still require explicit authorization and `SSOT_WRITE=1`.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const packet = readJson(AUTHORIZATION_PACKET_PATH);
  const statusSnapshot = readJson(STATUS_SNAPSHOT_PATH);
  const indexJson = readJson(INDEX_PATH);
  const packetRows = Array.isArray(packet.rows) ? packet.rows : [];
  const snapshotRows = statusSnapshotRows(statusSnapshot, packetRows);
  const missingRows = snapshotRows.filter((row) => !row.targetPresent);
  const mismatchedRows = snapshotRows.filter((row) =>
    row.targetPresent && !row.currentColorMatches,
  );
  const matchedRows = snapshotRows.filter((row) => row.currentColorMatches);
  const indexSummary = indexSchemaSummary(indexJson);
  const blockingReasons = [];
  if (missingRows.length) blockingReasons.push("STATUS_SNAPSHOT_TARGET_ROWS_MISSING");
  if (mismatchedRows.length) blockingReasons.push("STATUS_SNAPSHOT_CURRENT_COLOR_MISMATCH");
  if (!indexSummary.directColorTarget) blockingReasons.push("DATA_INDEX_NOT_DIRECT_COLOR_TARGET");
  blockingReasons.push("AUTHORIZATION_MISSING");
  blockingReasons.push("SSOT_WRITE_NOT_ENABLED");

  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    nonMutating: true,
    localOnly: true,
    previewStatus: blockingReasons.length
      ? "TARGET_MAPPING_REVIEW_INCOMPLETE_NO_MUTATION"
      : "TARGET_MAPPING_READY_NO_MUTATION",
    mutationPolicy:
      "This preview writes only data/reviews artifacts. It does not update SSOT, map, production, status, color, source, or cache files.",
    inputAuthorizationPacket: relative(AUTHORIZATION_PACKET_PATH),
    rowsTotal: packetRows.length,
    appliedRows: 0,
    blockingReasons,
    statusSnapshotSummary: {
      path: relative(STATUS_SNAPSHOT_PATH),
      entriesTotal: Array.isArray(statusSnapshot.entries)
        ? statusSnapshot.entries.length
        : 0,
      packetRows: packetRows.length,
      targetRowsPresent: snapshotRows.filter((row) => row.targetPresent).length,
      missingRows: missingRows.length,
      currentColorMatches: matchedRows.length,
      currentColorMismatches: mismatchedRows.length,
      statusCounts: countBy(snapshotRows, (row) => row.status),
    },
    indexSummary,
    hashProof: [
      fileProof(AUTHORIZATION_PACKET_PATH),
      fileProof(STATUS_SNAPSHOT_PATH),
      fileProof(INDEX_PATH),
    ],
    missingTargetRows: missingRows.map((row) => row.geo),
    currentColorMismatches: mismatchedRows.map((row) => ({
      geo: row.geo,
      territory: row.territory,
      packetCurrentColor: row.packetCurrentColor,
      currentTargetColor: row.currentTargetColor,
      proposedTruthColor: row.proposedTruthColor,
    })),
    statusSnapshotRows: snapshotRows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`COLOR_APPLY_PREVIEW_STATUS=${output.previewStatus}`);
  console.log(`COLOR_APPLY_PREVIEW_ROWS=${output.rowsTotal}`);
  console.log(`COLOR_APPLY_PREVIEW_STATUS_SNAPSHOT_MATCHES=${output.statusSnapshotSummary.currentColorMatches}`);
  console.log(`COLOR_APPLY_PREVIEW_STATUS_SNAPSHOT_MISSING=${output.statusSnapshotSummary.missingRows}`);
  console.log(`COLOR_APPLY_PREVIEW_STATUS_SNAPSHOT_MISMATCHES=${output.statusSnapshotSummary.currentColorMismatches}`);
  console.log(`COLOR_APPLY_PREVIEW_APPLIED_ROWS=${output.appliedRows}`);
  console.log(`COLOR_APPLY_PREVIEW_OUTPUT=${relative(OUT_JSON_PATH)}`);
  console.log(`COLOR_APPLY_PREVIEW_MARKDOWN=${relative(OUT_MD_PATH)}`);
}

main();
