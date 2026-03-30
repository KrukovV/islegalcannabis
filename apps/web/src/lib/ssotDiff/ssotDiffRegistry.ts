import fs from "node:fs";
import path from "node:path";
import { filterChangesSince } from "./ssotDiffBuilder";
import type { SsotDiffCache, SsotDiffEntry, SsotDiffRegistry, SsotPendingChange } from "./ssotDiffTypes";

export function getSsotDiffRegistryPath(rootDir: string): string {
  return path.join(rootDir, "data", "ssot_diffs.json");
}

export function getSsotDiffPendingPath(rootDir: string): string {
  return path.join(rootDir, "cache", "ssot_diff_pending.json");
}

export function getSsotDiffCachePath(rootDir: string): string {
  return path.join(rootDir, "cache", "ssot_diff_cache.json");
}

export function getSsotDiffLogPath(rootDir: string): string {
  return path.join(rootDir, "logs", "ssot_diff.log");
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n");
}

export function readSsotDiffRegistry(rootDir: string): SsotDiffRegistry {
  const filePath = getSsotDiffRegistryPath(rootDir);
  return readJsonFile<SsotDiffRegistry>(filePath, { generated_at: new Date(0).toISOString(), changes: [] });
}

export function writeSsotDiffRegistry(rootDir: string, registry: SsotDiffRegistry) {
  writeJsonFile(getSsotDiffRegistryPath(rootDir), registry);
}

export function readPendingChanges(rootDir: string): SsotPendingChange[] {
  return readJsonFile<SsotPendingChange[]>(getSsotDiffPendingPath(rootDir), []);
}

export function writePendingChanges(rootDir: string, pending: SsotPendingChange[]) {
  writeJsonFile(getSsotDiffPendingPath(rootDir), pending);
}

export function writeSsotDiffCache(rootDir: string, nowIso: string, registry: SsotDiffRegistry, pending: SsotPendingChange[]) {
  const payload: SsotDiffCache = {
    generated_at: nowIso,
    last_24h: filterChangesSince(registry.changes, nowIso, 24),
    last_7d: filterChangesSince(registry.changes, nowIso, 24 * 7),
    pending
  };
  writeJsonFile(getSsotDiffCachePath(rootDir), payload);
}

export function readSsotDiffCache(rootDir: string): SsotDiffCache {
  return readJsonFile<SsotDiffCache>(getSsotDiffCachePath(rootDir), {
    generated_at: new Date(0).toISOString(),
    last_24h: [],
    last_7d: [],
    pending: []
  });
}

export function summarizeSsotDiffCache(cache: SsotDiffCache) {
  return {
    generatedAt: cache.generated_at,
    last24hCount: cache.last_24h.length,
    last7dCount: cache.last_7d.length,
    pendingCount: cache.pending.length
  };
}

export function appendLogLines(rootDir: string, lines: string[]) {
  if (!lines.length) return;
  const filePath = getSsotDiffLogPath(rootDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${lines.join("\n")}\n`);
}

export function mergeRegistryChanges(registry: SsotDiffRegistry, confirmed: SsotDiffEntry[], nowIso: string): SsotDiffRegistry {
  if (!confirmed.length) return registry;
  const existingKeys = new Set(registry.changes.map((entry) => `${entry.change_key}|${entry.ts}`));
  const merged = registry.changes.slice();
  for (const entry of confirmed) {
    const compoundKey = `${entry.change_key}|${entry.ts}`;
    if (existingKeys.has(compoundKey)) continue;
    merged.push(entry);
  }
  return {
    generated_at: nowIso,
    changes: merged.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
  };
}
