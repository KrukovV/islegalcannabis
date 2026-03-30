import fs from "node:fs";
import path from "node:path";
import type { SsotSnapshot } from "./ssotDiffTypes";

export const SSOT_SNAPSHOT_MAX_COUNT = 50;

export function findRepoRoot(start: string = process.cwd()): string {
  let current = start;
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(current, "data", "wiki", "wiki_claims_map.json"))) return current;
    const parent = path.dirname(current);
    if (!parent || parent === current) break;
    current = parent;
  }
  return start;
}

export function getSsotSnapshotDir(rootDir: string): string {
  return path.join(rootDir, "data", "ssot_snapshots");
}

export function getSsotLatestSnapshotPath(rootDir: string): string {
  return path.join(getSsotSnapshotDir(rootDir), "latest.json");
}

export function getSsotStableSnapshotPath(rootDir: string): string {
  return path.join(getSsotSnapshotDir(rootDir), "latest_stable.json");
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function readLatestStableSnapshot(rootDir: string): SsotSnapshot | null {
  const filePath = getSsotStableSnapshotPath(rootDir);
  return fs.existsSync(filePath) ? readJsonFile<SsotSnapshot | null>(filePath, null) : null;
}

export function readLatestSnapshot(rootDir: string): SsotSnapshot | null {
  const filePath = getSsotLatestSnapshotPath(rootDir);
  return fs.existsSync(filePath) ? readJsonFile<SsotSnapshot | null>(filePath, null) : null;
}

export function listTimestampedSnapshots(rootDir: string): string[] {
  const snapshotDir = getSsotSnapshotDir(rootDir);
  if (!fs.existsSync(snapshotDir)) return [];
  return fs
    .readdirSync(snapshotDir)
    .filter((entry) => /^snapshot_\d{4}_\d{2}_\d{2}_\d{2}\.json$/.test(entry))
    .map((entry) => path.join(snapshotDir, entry))
    .sort();
}

export function writeSnapshotFile(rootDir: string, snapshot: SsotSnapshot): { latestPath: string; timestampPath: string } {
  const snapshotDir = getSsotSnapshotDir(rootDir);
  fs.mkdirSync(snapshotDir, { recursive: true });
  const stamp = snapshot.generated_at.replace(/[-:TZ]/g, "").slice(0, 10);
  const timestampPath = path.join(snapshotDir, `snapshot_${stamp.slice(0, 4)}_${stamp.slice(4, 6)}_${stamp.slice(6, 8)}_${stamp.slice(8, 10)}.json`);
  const latestPath = getSsotLatestSnapshotPath(rootDir);
  fs.writeFileSync(timestampPath, JSON.stringify(snapshot, null, 2) + "\n");
  fs.writeFileSync(latestPath, JSON.stringify(snapshot, null, 2) + "\n");
  return { latestPath, timestampPath };
}

export function writeStableSnapshot(rootDir: string, snapshot: SsotSnapshot): string {
  const filePath = getSsotStableSnapshotPath(rootDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2) + "\n");
  return filePath;
}

export function pruneSnapshots(rootDir: string, keepLast: number = SSOT_SNAPSHOT_MAX_COUNT): { kept: number; removed: number } {
  const files = listTimestampedSnapshots(rootDir);
  const removable = files.slice(0, Math.max(0, files.length - keepLast));
  for (const filePath of removable) {
    fs.unlinkSync(filePath);
  }
  return {
    kept: files.length - removable.length,
    removed: removable.length
  };
}
