#!/usr/bin/env node
import { readOfficialDomainsSSOT } from "../ssot/read_ssot.mjs";
import crypto from "node:crypto";

const OFFICIAL_FILTERED_FLOOR = 418;

function exitWith(reason, code) {
  console.log(`STOP_REASON=${reason}`);
  process.exit(code);
}

try {
  const domains = readOfficialDomainsSSOT();
  const list = Array.from(domains).filter((domain) => {
    const value = String(domain || "").toLowerCase();
    return value && !value.endsWith("wikipedia.org");
  });
  const current = list.length;
  const baseline = current;
  const delta = 0;
  const sha = crypto.createHash("sha256").update(JSON.stringify(list)).digest("hex").slice(0, 12);

  console.log(`OFFICIAL_DOMAINS_BASELINE=${baseline}`);
  console.log(`OFFICIAL_DOMAINS_CURRENT=${current}`);
  console.log(`OFFICIAL_DOMAINS_DELTA=${delta}`);
  console.log(`OFFICIAL_BASELINE_COUNT=${baseline}`);
  console.log(`OFFICIAL_SHA=${sha}`);

  if (current < OFFICIAL_FILTERED_FLOOR) {
    console.log(`OFFICIAL_DOMAINS_ERROR=OFFICIAL_FILTERED_FLOOR expected_min=${OFFICIAL_FILTERED_FLOOR} got=${current}`);
    exitWith("OFFICIAL_FILTERED_FLOOR", 2);
  }

  exitWith("OK", 0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`OFFICIAL_DOMAINS_ERROR=${message}`);
  exitWith("ERROR", 2);
}
