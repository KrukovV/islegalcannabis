import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
let root = process.cwd();
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--root") {
    root = args[i + 1] ? String(args[i + 1]) : root;
    i += 1;
  }
}

const ledgerPath = path.join(root, "CONTINUITY.md");
const resultPath = path.join(root, ".checkpoints", "ci-result.txt");
const finalPath = path.join(root, ".checkpoints", "ci-final.txt");
const latestPath = path.join(root, ".checkpoints", "LATEST");

if (!fs.existsSync(ledgerPath)) {
  console.error(`Missing ${ledgerPath}`);
  process.exit(1);
}
if (!fs.existsSync(resultPath)) {
  console.error(`Missing ${resultPath}`);
  process.exit(1);
}
if (!fs.existsSync(finalPath)) {
  console.error(`Missing ${finalPath}`);
  process.exit(1);
}
if (!fs.existsSync(latestPath)) {
  console.error(`Missing ${latestPath}`);
  process.exit(1);
}

const resultText = fs.readFileSync(resultPath, "utf8");
const ciMatch = resultText.match(/CI_RESULT=([^;]+)/);
const smokeMatch = resultText.match(/SMOKE=([^\s]+)/);
const ciResult = ciMatch ? ciMatch[1] : "UNCONFIRMED";
let smokeResult = smokeMatch ? smokeMatch[1] : "UNCONFIRMED";

if (ciResult !== "PASS") {
  process.exit(0);
}

const latestCheckpoint = fs.readFileSync(latestPath, "utf8").trim();
const finalLines = fs
  .readFileSync(finalPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const nextLine =
  finalLines.find((line) => line.startsWith("Next:")) || "Next: UNCONFIRMED";
const nowText = finalLines[0] ?? `CI PASS (Smoke ${smokeResult})`;
const stateText = `checkpoint=${latestCheckpoint}; CI=${ciResult}; Smoke=${smokeResult}`;

const lines = fs.readFileSync(ledgerPath, "utf8").split(/\r?\n/);

function isHeader(line) {
  return /^[A-Za-z].*:\s*$/.test(line.trim());
}

function replaceInline(prefix, newLine, fallbackInsertAfter) {
  const idx = lines.findIndex((line) => line.startsWith(prefix));
  if (idx === -1) {
    if (fallbackInsertAfter) {
      const insertAt = lines.findIndex((line) => line.startsWith(fallbackInsertAfter));
      if (insertAt !== -1) {
        lines.splice(insertAt + 1, 0, newLine);
        return;
      }
    }
    lines.push(newLine);
    return;
  }
  if (lines[idx].trim() === prefix) {
    let end = idx + 1;
    while (end < lines.length && !isHeader(lines[end])) {
      end += 1;
    }
    lines.splice(idx + 1, end - idx - 1, `- ${newLine.slice(prefix.length).trim()}`);
  } else {
    lines[idx] = newLine;
  }
}

replaceInline("State:", `State: ${stateText}`, "Goal:");
replaceInline("Now:", `Now: ${nowText}`, "State:");
replaceInline("Next:", nextLine, "Now:");

const nextText = lines.join("\n").trimEnd() + "\n";
const tempPath = `${ledgerPath}.tmp`;
fs.writeFileSync(tempPath, nextText);
fs.renameSync(tempPath, ledgerPath);
