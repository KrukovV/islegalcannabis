import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSsotDiffEngine } from "./ssotDiffEngine";
import { readSsotDiffCache, readSsotDiffRegistry } from "./ssotDiffRegistry";
import { getSsotLatestSnapshotPath, readLatestStableSnapshot } from "./ssotSnapshotStore";

const tmpDirs: string[] = [];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ssot-diff-"));
  tmpDirs.push(root);
  fs.mkdirSync(path.join(root, "data", "wiki"), { recursive: true });
  return root;
}

function writeWikiPayloads(
  root: string,
  claimsItems: Record<string, unknown>,
  enrichedItems: Record<string, unknown> = {},
  badgeItems: Record<string, unknown> = {}
) {
  fs.writeFileSync(
    path.join(root, "data", "wiki", "wiki_claims_map.json"),
    JSON.stringify({ items: claimsItems }, null, 2)
  );
  fs.writeFileSync(
    path.join(root, "data", "wiki", "wiki_claims_enriched.json"),
    JSON.stringify({ items: enrichedItems }, null, 2)
  );
  fs.writeFileSync(
    path.join(root, "data", "wiki", "wiki_official_badges.json"),
    JSON.stringify({ items: badgeItems }, null, 2)
  );
}

afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("ssotDiffEngine", () => {
  it("creates baseline snapshot and stable snapshot", () => {
    const root = makeRoot();
    writeWikiPayloads(root, {
      DE: {
        geo_key: "DE",
        recreational_status: "Illegal",
        medical_status: "Legal",
        notes_text: "baseline",
        wiki_row_url: "https://en.wikipedia.org/wiki/Germany"
      }
    });

    const result = runSsotDiffEngine(root);
    expect(result.status).toBe("baseline");
    const latest = JSON.parse(fs.readFileSync(getSsotLatestSnapshotPath(root), "utf8"));
    expect(latest.row_count).toBe(300);
    expect(readLatestStableSnapshot(root)?.row_count).toBe(300);
    expect(readSsotDiffRegistry(root).changes).toHaveLength(0);
  });

  it("confirms changes only after two consecutive refreshes", () => {
    const root = makeRoot();
    writeWikiPayloads(root, {
      DE: {
        geo_key: "DE",
        recreational_status: "Illegal",
        medical_status: "Legal",
        notes_text: "baseline",
        wiki_row_url: "https://en.wikipedia.org/wiki/Germany"
      }
    });
    expect(runSsotDiffEngine(root).status).toBe("baseline");

    writeWikiPayloads(
      root,
      {
        DE: {
          geo_key: "DE",
          recreational_status: "Legal",
          medical_status: "Legal",
          notes_text: "changed",
          wiki_row_url: "https://en.wikipedia.org/wiki/Cannabis_in_Germany"
        }
      },
      { DE: [{ url: "https://gov.example/de", official: true }] }
    );

    expect(runSsotDiffEngine(root).status).toBe("pending");
    expect(readSsotDiffRegistry(root).changes).toHaveLength(0);
    expect(readSsotDiffCache(root).pending.length).toBeGreaterThan(0);

    expect(runSsotDiffEngine(root).status).toBe("changed");
    const registry = readSsotDiffRegistry(root);
    expect(registry.changes.map((entry) => entry.type)).toEqual([
      "NOTES_UPDATE",
      "OFFICIAL_SOURCE_ADDED",
      "STATUS_CHANGE",
      "WIKI_PAGE_CHANGED"
    ]);
    expect(readSsotDiffCache(root).pending).toHaveLength(0);
  });
});
