import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const argMap = new Map();
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (!arg.startsWith("--")) continue;
  const stripped = arg.replace(/^--/, "");
  if (stripped.includes("=")) {
    const [key, value] = stripped.split("=");
    argMap.set(key, value ?? true);
    continue;
  }
  const next = args[i + 1];
  if (next && !next.startsWith("--")) {
    argMap.set(stripped, next);
    i += 1;
  } else {
    argMap.set(stripped, true);
  }
}

const root = String(argMap.get("root") || process.cwd());
const dryRun = Boolean(argMap.get("dry-run"));
const minimal = Boolean(argMap.get("minimal") || process.env.LEDGER_MINIMAL === "1");
const overrideDate = argMap.get("date") ? String(argMap.get("date")) : null;
const overrideCheckpoint = argMap.get("checkpoint")
  ? String(argMap.get("checkpoint"))
  : null;

const ledgerPath = path.join(root, "CONTINUITY.md");
const archivePath = path.join(root, "ARCHIVE.md");

const headers = [
  "Goal (incl. success criteria):",
  "Constraints/Assumptions:",
  "Key decisions:",
  "State:",
  "Changed paths (latest):",
  "Done:",
  "Now:",
  "Next:",
  "Open questions (UNCONFIRMED if needed):",
  "Working set (files/ids/commands):"
];

function isHeader(line) {
  return headers.includes(line.trim());
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/\\\\n/g, ""));
}

function getLatestCheckpoint(rootDir) {
  const cpDir = path.join(rootDir, ".checkpoints");
  if (!fs.existsSync(cpDir)) return "checkpoint=none";
  const patches = fs
    .readdirSync(cpDir)
    .filter((name) => name.endsWith(".patch"))
    .sort();
  if (patches.length === 0) return "checkpoint=none";
  const latest = patches[patches.length - 1];
  return `checkpoint=.checkpoints/${latest}`;
}

function formatDate(value) {
  if (value) return value;
  return new Date().toISOString().slice(0, 10);
}

function parseSections(lines) {
  const map = new Map();
  let current = null;
  for (const line of lines) {
    if (isHeader(line)) {
      current = line.trim();
      if (!map.has(current)) map.set(current, []);
      continue;
    }
    if (!current) continue;
    map.get(current).push(line);
  }
  return map;
}

function collectBullets(lines) {
  return lines.filter((line) => line.trim().startsWith("- "));
}

function keepBullets(lines, limit) {
  const bullets = collectBullets(lines);
  return bullets.slice(0, limit);
}

function rewriteSection(lines, kept) {
  if (kept.length === 0) return [];
  return kept;
}

function normalizeSectionLines(lines) {
  const normalized = [];
  for (const line of lines) {
    const cleaned = line.replace(/\\\\n/g, "");
    if (cleaned.trim() === "") continue;
    normalized.push(cleaned);
  }
  return normalized;
}

function ensureArchiveHeader(archiveLines, date) {
  const header = `## ${date}`;
  if (archiveLines.some((line) => line.trim() === header)) {
    return archiveLines;
  }
  return archiveLines.length === 0
    ? [header]
    : [...archiveLines, "", header];
}

function appendArchiveEntries(archiveLines, date, entries) {
  const header = `## ${date}`;
  const existing = new Set(archiveLines.filter((line) => line.trim().startsWith("- ")));
  const next = [...archiveLines];
  let insertIndex = next.findIndex((line) => line.trim() === header);
  if (insertIndex === -1) {
    next.push("", header);
    insertIndex = next.length - 1;
  }
  let cursor = insertIndex + 1;
  while (cursor < next.length && !next[cursor].startsWith("## ")) {
    cursor += 1;
  }
  const toInsert = entries.filter((entry) => !existing.has(entry));
  if (toInsert.length === 0) return next;
  next.splice(cursor, 0, ...toInsert);
  return next;
}

if (!fs.existsSync(ledgerPath)) {
  console.error(`Missing ${ledgerPath}`);
  process.exit(1);
}

const lines = readLines(ledgerPath);
const sections = parseSections(lines);
const wipLineRaw = lines.find((line) => line.trim().startsWith("WIP:")) || "";
const wipLine = wipLineRaw.trim();

const doneLines = sections.get("Done:") ?? [];
const doneBullets = collectBullets(doneLines);
const doneKept = doneBullets.slice(0, 10);
const doneOverflow = doneBullets.slice(10);

const stateKept = keepBullets(sections.get("State:") ?? [], 1);
const nowKept = keepBullets(sections.get("Now:") ?? [], 15);
const nextKept = keepBullets(sections.get("Next:") ?? [], 3);

const date = formatDate(overrideDate);
const checkpoint = overrideCheckpoint || getLatestCheckpoint(root);
const archiveEntries = doneOverflow.map((line) => `${line} (${checkpoint})`);

function normalizeCheckpoint(value) {
  if (!value) return "checkpoint=none";
  return value.startsWith("checkpoint=") ? value : `checkpoint=${value}`;
}

function readCiSmoke(rootDir) {
  const ciPath = path.join(rootDir, ".checkpoints", "ci-result.txt");
  if (!fs.existsSync(ciPath)) return { ci: "UNCONFIRMED", smoke: "UNCONFIRMED" };
  const text = fs.readFileSync(ciPath, "utf8");
  const ciMatch = text.match(/CI_RESULT=([^;]+)/);
  const smokeMatch = text.match(/SMOKE=([^\s]+)/);
  return {
    ci: ciMatch ? ciMatch[1] : "UNCONFIRMED",
    smoke: smokeMatch ? smokeMatch[1] : "UNCONFIRMED"
  };
}

function readChangedPaths(rootDir) {
  const filePath = path.join(rootDir, ".checkpoints", "changed-paths.txt");
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- ${line}`);
}

const changedPaths = readChangedPaths(root);
const nowFromChanged = changedPaths.map((line) => line.replace(/^- /, "- WIP: "));

const stateOverride = overrideCheckpoint
  ? (() => {
      const { ci, smoke } = readCiSmoke(root);
      const checkpointLabel = normalizeCheckpoint(overrideCheckpoint);
      return `- ${checkpointLabel}; CI=${ci}; Smoke=${smoke}`;
    })()
  : null;

let archiveLines = readLines(archivePath);
archiveLines = ensureArchiveHeader(archiveLines, date);
archiveLines = appendArchiveEntries(archiveLines, date, archiveEntries);

const output = [];
if (minimal) {
  function parseMinimalLine(prefix, lines) {
    const line = lines.find((entry) => entry.startsWith(prefix));
    if (!line) return "";
    return line.slice(prefix.length).trim();
  }

  const minimalGoal = parseMinimalLine("Goal:", lines);
  const minimalState = parseMinimalLine("State:", lines);
  const minimalDone = parseMinimalLine("Done:", lines);
  const minimalNow = parseMinimalLine("Now:", lines);
  const minimalNext = parseMinimalLine("Next:", lines);
  const minimalOpen = parseMinimalLine("Open questions:", lines);
  const minimalWip = parseMinimalLine("WIP:", lines);
  const wipText = minimalWip || (wipLine ? wipLine.replace(/^WIP:\\s*/, "") : "");

  const goalLines = sections.get("Goal (incl. success criteria):") ?? [];
  const doneLinesText = sections.get("Done:") ?? [];
  const nowLinesText = sections.get("Now:") ?? [];
  const nextLinesText = sections.get("Next:") ?? [];
  const openLinesText = sections.get("Open questions (UNCONFIRMED if needed):") ?? [];

  const goalText = minimalGoal || (collectBullets(goalLines)[0] ?? "- UNCONFIRMED").replace(/^- /, "");
  const doneText = minimalDone || (collectBullets(doneLinesText)[0] ?? "- UNCONFIRMED").replace(/^- /, "");
  const nowText = minimalNow || (collectBullets(nowLinesText)[0] ?? "- UNCONFIRMED").replace(/^- /, "");
  const nextText = minimalNext || (collectBullets(nextLinesText)[0] ?? "- UNCONFIRMED").replace(/^- /, "");
  const openRaw = minimalOpen || (collectBullets(openLinesText)[0] ?? "- UNCONFIRMED").replace(/^- /, "");
  const openText = /UNCONFIRMED/.test(openRaw) ? openRaw : `UNCONFIRMED ${openRaw}`.trim();
  const stateValue = (stateOverride || minimalState || stateKept[0] || "- checkpoint=none; CI=UNCONFIRMED; Smoke=UNCONFIRMED")
    .replace(/^- /, "");

  output.push(`Goal: ${goalText}`);
  output.push(`State: ${stateValue}`);
  output.push(`Done: ${doneText}`);
  output.push(`Now: ${nowText}`);
  output.push(`Next: ${nextText}`);
  if (wipText) {
    output.push(`WIP: ${wipText}`);
  }
  output.push(`Open questions: ${openText}`);
} else {
for (const header of headers) {
  output.push(header);
  if (header === "Done:") {
    output.push(...rewriteSection(doneLines, doneKept));
  } else if (header === "State:") {
    const nextState = stateOverride ? [stateOverride] : stateKept;
    output.push(...rewriteSection(sections.get("State:") ?? [], nextState));
  } else if (header === "Changed paths (latest):") {
    const nextChanged = changedPaths.length
      ? changedPaths
      : normalizeSectionLines(sections.get(header) ?? []);
    output.push(...rewriteSection(sections.get(header) ?? [], nextChanged));
  } else if (header === "Now:") {
    const nextNow = nowFromChanged.length ? nowFromChanged : nowKept;
    const nextNowWithWip = wipLine && !nextNow.includes(wipLine)
      ? [...nextNow, wipLine]
      : nextNow;
    output.push(...rewriteSection(sections.get("Now:") ?? [], nextNowWithWip));
  } else if (header === "Next:") {
    output.push(...rewriteSection(sections.get("Next:") ?? [], nextKept));
  } else {
    const sectionLines = normalizeSectionLines(sections.get(header) ?? []);
    output.push(...sectionLines);
  }
  output.push("");
}
}

const ledgerNext = output.join("\n").trimEnd() + "\n";
const archiveNext = archiveLines.join("\n").trimEnd() + "\n";
const tempLedgerPath = `${ledgerPath}.tmp`;
const tempArchivePath = `${archivePath}.tmp`;

if (dryRun) {
  console.log(`dry-run: done=${doneBullets.length} kept=${doneKept.length} archived=${doneOverflow.length}`);
  process.exit(0);
}

fs.writeFileSync(tempLedgerPath, ledgerNext);
fs.renameSync(tempLedgerPath, ledgerPath);
if (archiveEntries.length > 0 || fs.existsSync(archivePath)) {
  fs.writeFileSync(tempArchivePath, archiveNext);
  fs.renameSync(tempArchivePath, archivePath);
}
