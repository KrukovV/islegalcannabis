import fs from "node:fs";
import path from "node:path";

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

function detectStatuses(text) {
  const lower = text.toLowerCase();
  const hasCannabis = lower.includes("cannabis") || lower.includes("marijuana");
  const hasDrugLaw =
    lower.includes("controlled substance") ||
    lower.includes("controlled drug") ||
    lower.includes("narcotic") ||
    lower.includes("drug law");
  let recreational = "unknown";
  let medical = "unknown";

  if (
    lower.includes("medical cannabis") ||
    lower.includes("medicinal cannabis") ||
    lower.includes("cannabis-based medicine") ||
    (lower.includes("prescription") && hasCannabis) ||
    (lower.includes("authorized") && (lower.includes("medical") || lower.includes("medicinal")))
  ) {
    medical = lower.includes("prescription") ? "restricted" : "allowed";
  }
  if (lower.includes("adult use") || lower.includes("recreational cannabis")) {
    recreational = "allowed";
  }
  if (hasCannabis && (lower.includes("decriminal") || lower.includes("decriminali"))) {
    recreational = recreational === "unknown" ? "restricted" : recreational;
  }
  if (hasCannabis && (lower.includes("illegal") || lower.includes("prohibited"))) {
    recreational = recreational === "unknown" ? "illegal" : recreational;
  }
  if (hasCannabis && lower.includes("legal")) {
    recreational = recreational === "unknown" ? "allowed" : recreational;
  }
  if (medical === "unknown" && hasCannabis) {
    medical = "restricted";
  }
  if (medical === "unknown" && hasDrugLaw) {
    medical = "restricted";
  }
  if (medical === "unknown" && recreational === "unknown") {
    medical = "restricted";
  }
  return { recreational, medical };
}

function readSnapshot(snapshotPath) {
  if (!fs.existsSync(snapshotPath)) return { text: "", isHtml: false };
  const content = fs.readFileSync(snapshotPath, "utf8");
  const isHtml = snapshotPath.endsWith(".html") || content.includes("<html");
  return { text: isHtml ? stripHtml(content) : "", isHtml };
}

function main() {
  const iso2 = readArg("--iso2");
  const url = readArg("--url");
  const snapshotPath = readArg("--snapshot");
  const sha256 = readArg("--sha256");
  const retrievedAt = readArg("--retrieved-at");
  const outPath = readArg("--out");

  if (!iso2 || !snapshotPath || !outPath) {
    console.error("ERROR: missing required args");
    process.exit(1);
  }

  const { text, isHtml } = readSnapshot(snapshotPath);
  const statuses = isHtml
    ? detectStatuses(text)
    : { recreational: "unknown", medical: "restricted" };

  const payload = {
    iso2,
    status_recreational: statuses.recreational,
    status_medical: statuses.medical,
    evidence: [
      {
        type: "snapshot",
        url,
        snapshot_path: snapshotPath,
        sha256,
        retrieved_at: retrievedAt,
        hint: isHtml ? "html_text" : "binary_snapshot"
      }
    ],
    confidence: "low",
    method: "auto_learn_candidate",
    generated_at: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
