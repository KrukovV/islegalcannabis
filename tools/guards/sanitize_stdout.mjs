import fs from "node:fs";
import path from "node:path";
import { sanitizeText } from "./stdout_sanitize.mjs";

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const input = readArg("--input");
const output = readArg("--output");

if (!input || !output) {
  console.error("ERROR: sanitize_stdout requires --input and --output.");
  process.exit(1);
}

if (!fs.existsSync(input)) {
  console.error(`ERROR: sanitize_stdout missing input: ${input}`);
  process.exit(1);
}

const raw = fs.readFileSync(input, "utf8");
const sanitized = sanitizeText(raw).trimEnd() + "\n";
const dir = path.dirname(output);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(output, sanitized);
