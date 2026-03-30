import fs from "node:fs";
import path from "node:path";
import { buildCurrentSsotSnapshot, diffSnapshots } from "./ssotDiffBuilder";
import {
  appendLogLines,
  mergeRegistryChanges,
  readPendingChanges,
  readSsotDiffRegistry,
  writePendingChanges,
  writeSsotDiffCache,
  writeSsotDiffRegistry
} from "./ssotDiffRegistry";
import {
  findRepoRoot,
  pruneSnapshots,
  readLatestStableSnapshot,
  writeSnapshotFile,
  writeStableSnapshot
} from "./ssotSnapshotStore";
import type { SsotDiffEntry, SsotDiffRunResult, SsotPendingChange } from "./ssotDiffTypes";

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function buildPending(rawChanges: SsotDiffEntry[], previousPending: SsotPendingChange[], nowIso: string): SsotPendingChange[] {
  const previous = new Map(previousPending.map((entry) => [entry.change_key, entry]));
  return rawChanges.map((entry) => {
    const existing = previous.get(entry.change_key);
    return {
      change_key: entry.change_key,
      count: existing ? existing.count + 1 : 1,
      first_seen_at: existing?.first_seen_at || nowIso,
      last_seen_at: nowIso,
      entry: {
        geo: entry.geo,
        type: entry.type,
        old_value: entry.old_value,
        new_value: entry.new_value,
        change_key: entry.change_key
      }
    };
  });
}

export function runSsotDiffEngine(rootDir: string = findRepoRoot()): SsotDiffRunResult {
  const nowIso = new Date().toISOString();
  const claimsPayload = readJson<{ items?: Record<string, unknown> }>(path.join(rootDir, "data", "wiki", "wiki_claims_map.json"), {});
  const enrichedPayload = readJson<{ items?: Record<string, unknown> }>(
    path.join(rootDir, "data", "wiki", "wiki_claims_enriched.json"),
    {}
  );
  const badgesPayload = readJson<{ items?: Record<string, unknown> }>(
    path.join(rootDir, "data", "wiki", "wiki_official_badges.json"),
    {}
  );

  const currentSnapshot = buildCurrentSsotSnapshot({
    generatedAt: nowIso,
    claimsItems: readRecord(claimsPayload.items) as Parameters<typeof buildCurrentSsotSnapshot>[0]["claimsItems"],
    enrichedItems: readRecord(enrichedPayload.items) as Parameters<typeof buildCurrentSsotSnapshot>[0]["enrichedItems"],
    officialBadgeItems: readRecord(badgesPayload.items) as Parameters<typeof buildCurrentSsotSnapshot>[0]["officialBadgeItems"]
  });

  writeSnapshotFile(rootDir, currentSnapshot);
  const stableSnapshot = readLatestStableSnapshot(rootDir);
  const prune = pruneSnapshots(rootDir);
  const registry = readSsotDiffRegistry(rootDir);
  const previousPending = readPendingChanges(rootDir);

  if (!stableSnapshot) {
    writeStableSnapshot(rootDir, currentSnapshot);
    writePendingChanges(rootDir, []);
    writeSsotDiffCache(rootDir, nowIso, registry, []);
    return {
      status: "baseline",
      snapshotCount: prune.kept,
      registryCount: registry.changes.length,
      pendingCount: 0,
      confirmedCount: 0
    };
  }

  const rawChanges = diffSnapshots(stableSnapshot, currentSnapshot);
  if (!rawChanges.length) {
    writeStableSnapshot(rootDir, currentSnapshot);
    writePendingChanges(rootDir, []);
    writeSsotDiffCache(rootDir, nowIso, registry, []);
    return {
      status: "stable",
      snapshotCount: prune.kept,
      registryCount: registry.changes.length,
      pendingCount: 0,
      confirmedCount: 0
    };
  }

  const nextPending = buildPending(rawChanges, previousPending, nowIso);
  const confirmed = nextPending.every((entry) => entry.count >= 2)
    ? rawChanges.map((entry) => ({ ...entry, ts: nowIso }))
    : [];

  if (confirmed.length) {
    const nextRegistry = mergeRegistryChanges(registry, confirmed, nowIso);
    writeSsotDiffRegistry(rootDir, nextRegistry);
    writeStableSnapshot(rootDir, currentSnapshot);
    writePendingChanges(rootDir, []);
    writeSsotDiffCache(rootDir, nowIso, nextRegistry, []);
    appendLogLines(
      rootDir,
      confirmed.map((entry) => `${entry.ts} ${entry.type} ${entry.geo} ${entry.old_value || "-"} -> ${entry.new_value || "-"}`)
    );
    return {
      status: "changed",
      snapshotCount: prune.kept,
      registryCount: nextRegistry.changes.length,
      pendingCount: 0,
      confirmedCount: confirmed.length
    };
  }

  writePendingChanges(rootDir, nextPending);
  writeSsotDiffCache(rootDir, nowIso, registry, nextPending);
  return {
    status: "pending",
    snapshotCount: prune.kept,
    registryCount: registry.changes.length,
    pendingCount: nextPending.length,
    confirmedCount: 0
  };
}
