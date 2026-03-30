#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const args = [
  "-w",
  "apps/web",
  "run",
  "test",
  "--",
  "src/lib/wikiTruthAudit.test.ts",
  "-t",
  "renders official sources only from owner-matched official ownership"
];

try {
  const output = execFileSync("npm", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  process.stdout.write(output);
  console.log("OFFICIAL_LINK_COUNTRY_PURITY_GUARD=PASS");
} catch (error) {
  if (error.stdout) process.stdout.write(String(error.stdout));
  if (error.stderr) process.stderr.write(String(error.stderr));
  console.log("OFFICIAL_LINK_COUNTRY_PURITY_GUARD=FAIL");
  process.exit(1);
}
