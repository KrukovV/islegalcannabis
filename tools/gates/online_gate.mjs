#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync("node", ["tools/net/net_truth_gate.mjs"], {
  encoding: "utf8",
  env: { ...process.env }
});

const stdout = String(result.stdout || "");
const stderr = String(result.stderr || "");

if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);

const onlineReason = stdout
  .split("\n")
  .find((line) => line.startsWith("ONLINE_REASON="));

if (!onlineReason) {
  console.log("ONLINE_GATE_OK=0 reason=MISSING_ONLINE_REASON");
  process.exit(2);
}

console.log("ONLINE_GATE_OK=1");
process.exit(result.status ?? 1);
