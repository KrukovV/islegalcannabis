#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readArgs(name) {
  const values = [];
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === name && process.argv[i + 1]) {
      values.push(process.argv[i + 1]);
      i += 1;
    } else if (arg.startsWith(`${name}=`)) {
      values.push(arg.slice(name.length + 1));
    }
  }
  return values;
}

function readArg(name, fallback = "") {
  return readArgs(name).at(-1) || fallback;
}

function normalizeReason(value) {
  return String(value || "MANDATORY_TAIL_FAIL").replace(/\s+/g, "_");
}

export function normalizeFinalCiStatus(text, options = {}) {
  const status = String(options.status || "").toUpperCase();
  if (status !== "FAIL") {
    return text.endsWith("\n") ? text : `${text}\n`;
  }

  const reason = normalizeReason(options.reason);
  const hadTrailingNewline = text.endsWith("\n");
  const lines = text.replace(/\n+$/u, "").split(/\r?\n/u);
  if (lines.length === 1 && lines[0] === "") lines.length = 0;

  const firstLine = lines[0] || "";
  const checkedMatch = firstLine.match(/\(Checked ([^)]+)\)/u);
  const hadLocalPassHeadline = /\bCI PASS(?:_DEGRADED)?\b/u.test(firstLine);
  if (hadLocalPassHeadline) {
    lines[0] = "\u274c CI FAIL";
    const localStatus = checkedMatch
      ? `LOCAL_CI_STATUS=PASS checked=${checkedMatch[1]}`
      : "LOCAL_CI_STATUS=PASS";
    if (!lines.some((line) => line.startsWith("LOCAL_CI_STATUS="))) {
      lines.splice(1, 0, localStatus);
    }
  } else if (!firstLine.startsWith("\u274c CI FAIL")) {
    lines.unshift("\u274c CI FAIL");
  }

  const rewritten = lines.map((line) => {
    if (/^CI_STATUS=PASS\b/u.test(line)) {
      return line.replace(/^CI_STATUS=PASS/u, "LOCAL_CI_STATUS=PASS");
    }
    if (/^CI_QUALITY=OK\b/u.test(line)) {
      return line.replace(/^CI_QUALITY=OK/u, "LOCAL_CI_QUALITY=OK");
    }
    if (/^PIPELINE_RC=0\b/u.test(line)) {
      return line.replace(/^PIPELINE_RC=0/u, "LOCAL_PIPELINE_RC=0");
    }
    if (/^CI_RESULT=PASS\b/u.test(line)) {
      return line.replace(/^CI_RESULT=PASS/u, "LOCAL_CI_RESULT=PASS");
    }
    if (/^CI_RESULT\b.*\bstatus=PASS\b/u.test(line)) {
      return line.replace(/^CI_RESULT/u, "LOCAL_CI_RESULT");
    }
    if (/^FAIL_REASON=NONE\b/u.test(line)) {
      return line.replace(/^FAIL_REASON=NONE/u, "LOCAL_FAIL_REASON=NONE");
    }
    return line;
  });

  const deduped = [];
  let sawLocalCiStatus = false;
  for (const line of rewritten) {
    if (line.startsWith("LOCAL_CI_STATUS=PASS")) {
      if (sawLocalCiStatus) continue;
      sawLocalCiStatus = true;
    }
    deduped.push(line);
  }

  const hasFinalReason = deduped.some((line) => line.startsWith("FINAL_FAIL_REASON="));
  if (!hasFinalReason) {
    const insertAt = Math.min(deduped.length, 2);
    deduped.splice(insertAt, 0, `FINAL_FAIL_REASON=${reason}`);
  }

  return `${deduped.join("\n")}${hadTrailingNewline ? "\n" : "\n"}`;
}

function main() {
  const files = readArgs("--file");
  const status = readArg("--status", "");
  const reason = readArg("--reason", "MANDATORY_TAIL_FAIL");
  if (!files.length) {
    console.error("ERROR: final_ci_status requires --file");
    process.exit(2);
  }
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const next = normalizeFinalCiStatus(fs.readFileSync(file, "utf8"), { status, reason });
    fs.writeFileSync(file, next);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
