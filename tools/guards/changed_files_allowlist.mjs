import { execSync } from "node:child_process";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

const allowlistRaw = process.env.ALLOWLIST;
if (!allowlistRaw || !allowlistRaw.trim()) {
  process.exit(0);
}

const allowlist = allowlistRaw
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
if (allowlist.length === 0) {
  process.exit(0);
}

let changed = [];
try {
  const output = execSync("git diff --name-only", {
    stdio: ["ignore", "pipe", "ignore"]
  })
    .toString()
    .trim();
  changed = output ? output.split("\n").map((line) => line.trim()).filter(Boolean) : [];
} catch {
  fail("failed to read git diff for allowlist guard");
}

const violations = changed.filter((file) => !allowlist.includes(file));
if (violations.length > 0) {
  fail(`allowlist violation: ${violations.join(", ")}`);
}
