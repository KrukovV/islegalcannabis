#!/usr/bin/env node
import { getProjectProcessSlotStats, MAX_PARALLEL_PROCESSES } from "../runtime/processSlots.mjs";

const stats = getProjectProcessSlotStats();
const activeSlots = Number(stats.activeSlots || 0);
const peakActiveSlots = Number(stats.peakActiveSlots || 0);
const failures = [];

if (activeSlots !== 0) {
  failures.push(`ACTIVE_SLOTS=${activeSlots}`);
}
if (peakActiveSlots > MAX_PARALLEL_PROCESSES) {
  failures.push(`PEAK_ACTIVE_SLOTS=${peakActiveSlots}`);
}

console.log(
  `PROCESS_SLOT_RUNTIME_GUARD active_slots=${activeSlots} peak_active_slots=${peakActiveSlots} max_parallel_processes=${MAX_PARALLEL_PROCESSES} slot_root=${stats.projectSlotRoot || "-"}`
);
if (failures.length > 0) {
  console.log(`PROCESS_SLOT_RUNTIME_GUARD_FAILURES=${failures.join(",")}`);
  console.log("PROCESS_SLOT_RUNTIME_GUARD=FAIL");
  process.exit(1);
}

console.log("PROCESS_SLOT_RUNTIME_GUARD=PASS");
