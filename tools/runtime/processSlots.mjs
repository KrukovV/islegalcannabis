#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const MAX_PARALLEL_PROCESSES = 3;

const SLOT_ROOT = path.join(os.tmpdir(), "islegalcannabis-process-slots");
const PROJECT_KEY = process.cwd().replace(/[^\w.-]+/g, "_");
const PROJECT_SLOT_ROOT = path.join(SLOT_ROOT, PROJECT_KEY);
const SLOT_PREFIX = "slot-";
const DEFAULT_POLL_MS = 120;
const STATS_PATH = path.join(PROJECT_SLOT_ROOT, "stats.json");

function ensureSlotRoot() {
  fs.mkdirSync(PROJECT_SLOT_ROOT, { recursive: true });
}

function getSlotPath(index) {
  return path.join(PROJECT_SLOT_ROOT, `${SLOT_PREFIX}${index}`);
}

function cleanStaleSlot(index) {
  const slotPath = getSlotPath(index);
  const ownerPath = path.join(slotPath, "owner.json");
  let owner = null;
  try {
    owner = JSON.parse(fs.readFileSync(ownerPath, "utf8"));
  } catch {
    return false;
  }
  const pid = Number(owner?.pid);
  if (Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      // owner pid is gone; fall through and remove stale slot
    }
  }
  fs.rmSync(slotPath, { recursive: true, force: true });
  return true;
}

function tryAcquireSlot(index, owner) {
  const slotPath = getSlotPath(index);
  try {
    fs.mkdirSync(slotPath);
    fs.writeFileSync(path.join(slotPath, "owner.json"), `${JSON.stringify(owner, null, 2)}\n`, "utf8");
    return slotPath;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      cleanStaleSlot(index);
      try {
        fs.mkdirSync(slotPath);
        fs.writeFileSync(path.join(slotPath, "owner.json"), `${JSON.stringify(owner, null, 2)}\n`, "utf8");
        return slotPath;
      } catch (retryError) {
        if (retryError && typeof retryError === "object" && "code" in retryError && retryError.code === "EEXIST") {
          return null;
        }
        throw retryError;
      }
    }
    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function listProjectSlotIndexes() {
  ensureSlotRoot();
  const indexes = [];
  for (const entry of fs.readdirSync(PROJECT_SLOT_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith(SLOT_PREFIX)) continue;
    const index = Number(entry.name.slice(SLOT_PREFIX.length));
    if (Number.isFinite(index) && index >= 1 && index <= MAX_PARALLEL_PROCESSES) {
      indexes.push(index);
    }
  }
  return indexes.sort((left, right) => left - right);
}

function countActiveProjectSlots() {
  let activeSlots = 0;
  for (const index of listProjectSlotIndexes()) {
    if (!cleanStaleSlot(index)) {
      activeSlots += 1;
    }
  }
  return activeSlots;
}

function buildSlotStats(next = {}) {
  const current = safeReadJson(STATS_PATH) || {};
  const activeSlots = countActiveProjectSlots();
  return {
    projectKey: PROJECT_KEY,
    projectSlotRoot: PROJECT_SLOT_ROOT,
    maxParallelProcesses: MAX_PARALLEL_PROCESSES,
    activeSlots,
    peakActiveSlots: Math.max(Number(current.peakActiveSlots || 0), activeSlots),
    ...current,
    ...next,
    activeSlots,
    peakActiveSlots: Math.max(Number(current.peakActiveSlots || 0), activeSlots, Number(next.peakActiveSlots || 0)),
    maxParallelProcesses: MAX_PARALLEL_PROCESSES,
    projectKey: PROJECT_KEY,
    projectSlotRoot: PROJECT_SLOT_ROOT,
    updatedAt: new Date().toISOString()
  };
}

function recordSlotStats(next = {}) {
  ensureSlotRoot();
  const stats = buildSlotStats(next);
  writeJsonAtomic(STATS_PATH, stats);
  return stats;
}

export function resetProjectProcessSlotStats() {
  ensureSlotRoot();
  const stats = {
    runStartedAt: new Date().toISOString(),
    peakActiveSlots: 0,
    lastAcquiredAt: null,
    lastAcquiredLabel: null,
    lastAcquiredPid: null,
    lastReleasedAt: null,
    lastReleasedLabel: null,
    lastReleasedPid: null
  };
  return recordSlotStats(stats);
}

export function getProjectProcessSlotStats() {
  ensureSlotRoot();
  return buildSlotStats();
}

export async function acquireProjectProcessSlot(label, options = {}) {
  ensureSlotRoot();
  const owner = {
    pid: process.pid,
    label: String(label || "unnamed"),
    acquired_at: new Date().toISOString()
  };
  const pollMs = Math.max(25, Number(options.pollMs || DEFAULT_POLL_MS));
  for (;;) {
    for (let index = 1; index <= MAX_PARALLEL_PROCESSES; index += 1) {
      const slotPath = tryAcquireSlot(index, owner);
      if (slotPath) {
        recordSlotStats({
          lastAcquiredAt: owner.acquired_at,
          lastAcquiredLabel: owner.label,
          lastAcquiredPid: owner.pid
        });
        return {
          index,
          label: owner.label,
          path: slotPath,
          release() {
            fs.rmSync(slotPath, { recursive: true, force: true });
            recordSlotStats({
              lastReleasedAt: new Date().toISOString(),
              lastReleasedLabel: owner.label,
              lastReleasedPid: owner.pid
            });
          }
        };
      }
    }
    await sleep(pollMs);
  }
}

export async function withProjectProcessSlot(label, fn, options = {}) {
  const slot = await acquireProjectProcessSlot(label, options);
  try {
    return await fn(slot);
  } finally {
    slot.release();
  }
}
