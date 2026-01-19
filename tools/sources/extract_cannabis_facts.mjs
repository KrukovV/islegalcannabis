import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function readArg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx !== -1) return process.argv[idx + 1] ?? fallback;
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return fallback;
}

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, " ");
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function detectStatuses(text) {
  const lower = text.toLowerCase();
  let recreational = "unknown";
  let medical = "unknown";

  if (/(illegal|prohibited)/.test(lower)) recreational = "illegal";
  if (lower.includes("decriminali")) recreational = "restricted";
  if (/\blegal\b/.test(lower)) recreational = "allowed";

  if (lower.includes("medical cannabis") || lower.includes("medicinal cannabis")) {
    medical = "allowed";
  } else if (lower.includes("prescription") || lower.includes("authorized")) {
    medical = "restricted";
  }

  return { recreational, medical };
}

function findAnchor(html) {
  const headingMatch = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (headingMatch) {
    const headingText = normalizeWhitespace(stripHtml(headingMatch[1] || ""));
    if (headingText) return { kind: "html_anchor", ref: headingText };
  }
  const idMatch = html.match(/\sid=["']([^"']+)["']/i);
  if (idMatch && idMatch[1]) return { kind: "html_anchor", ref: idMatch[1] };
  return null;
}

function readSnapshot(snapshotPath) {
  if (!fs.existsSync(snapshotPath)) return { text: "", isHtml: false };
  const content = fs.readFileSync(snapshotPath, "utf8");
  const isHtml = snapshotPath.endsWith(".html") || content.includes("<html");
  return { text: content, isHtml };
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function main() {
  const iso2 = readArg("--iso2");
  const url = readArg("--url");
  const snapshotPath = readArg("--snapshot");
  const sha256 = readArg("--sha256");
  const retrievedAt = readArg("--retrieved-at");
  const outPath = readArg("--out");
  const reportPath = readArg("--report");

  if (!iso2 || !snapshotPath || !outPath) {
    console.error("ERROR: missing required args");
    process.exit(1);
  }

  const { text, isHtml } = readSnapshot(snapshotPath);
  const anchor = isHtml ? findAnchor(text) : null;
  const reasons = [];
  let factsDelta = 0;
  let evidenceCount = 0;
  let evidence = [];
  let statuses = { recreational: "unknown", medical: "unknown" };

  if (!anchor) {
    reasons.push("NO_ANCHOR");
  } else {
    const plainText = normalizeWhitespace(stripHtml(text));
    statuses = detectStatuses(plainText);
    const snippet = normalizeWhitespace(plainText).slice(0, 200);
    const fields = [];
    if (statuses.recreational !== "unknown") fields.push("status_recreational");
    if (statuses.medical !== "unknown") fields.push("status_medical");
    evidence = fields.map((field) => ({
      field,
      kind: anchor.kind,
      ref: anchor.ref,
      snippet_hash: sha256(snippet || "empty")
    }));
    evidenceCount = evidence.length;
    if (evidenceCount > 0) {
      factsDelta = 1;
    } else {
      reasons.push("NO_SIGNAL");
    }
  }

  const payload = {
    iso2,
    status_recreational: statuses.recreational,
    status_medical: statuses.medical,
    evidence,
    confidence:
      evidence.length > 0 &&
      evidence.some((item) => item.field === "status_recreational") &&
      evidence.some((item) => item.field === "status_medical")
        ? "high"
        : "low",
    generated_at: new Date().toISOString()
  };

  if (factsDelta > 0) {
    writeJson(outPath, payload);
  }

  if (reportPath) {
    const report = {
      run_at: new Date().toISOString(),
      iso2,
      url,
      snapshot_path: snapshotPath,
      snapshot_sha256: sha256,
      retrieved_at: retrievedAt,
      anchor,
      facts_delta: factsDelta,
      evidence_count: evidenceCount,
      reason: evidenceCount === 0 ? "NO_EVIDENCE" : reasons.length ? reasons.join("|") : "OK",
      out: factsDelta > 0 ? outPath : ""
    };
    writeJson(reportPath, report);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
