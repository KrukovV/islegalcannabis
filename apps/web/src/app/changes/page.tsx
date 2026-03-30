import fs from "node:fs";
import path from "node:path";
import { getDisplayName } from "@/lib/countryNames";
import { readSsotDiffCache } from "@/lib/ssotDiff/ssotDiffRegistry";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import type { SsotDiffEntry } from "@/lib/ssotDiff/ssotDiffTypes";

const ROOT = findRepoRoot(process.cwd());

function formatDiffType(entry: SsotDiffEntry) {
  switch (entry.type) {
    case "STATUS_CHANGE":
      return `Recreational: ${entry.old_value || "-"} -> ${entry.new_value || "-"}`;
    case "MED_STATUS_CHANGE":
      return `Medical: ${entry.old_value || "-"} -> ${entry.new_value || "-"}`;
    case "NOTES_UPDATE":
      return "Notes updated";
    case "OFFICIAL_SOURCE_ADDED":
      return `Official source added: ${entry.new_value || "-"}`;
    case "OFFICIAL_SOURCE_REMOVED":
      return `Official source removed: ${entry.old_value || "-"}`;
    case "WIKI_PAGE_CHANGED":
      return "Wiki page updated";
    default:
      return entry.type;
  }
}

function renderChanges(title: string, items: SsotDiffEntry[], testId: string) {
  return (
    <section
      data-testid={testId}
      style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 16 }}
    >
      <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>{title}</h2>
      {items.length ? (
        <ul style={{ display: "grid", gap: 10, padding: 0, margin: 0, listStyle: "none" }}>
          {items.map((entry) => (
            <li
              key={`${entry.change_key}-${entry.ts}`}
              style={{ display: "grid", gap: 4, borderTop: "1px solid #eef2f7", paddingTop: 10 }}
            >
              <strong style={{ color: "#111827" }}>{getDisplayName(entry.geo, "en") || entry.geo}</strong>
              <span style={{ color: "#4b5563", fontSize: 14 }}>{formatDiffType(entry)}</span>
              <time style={{ color: "#4b5563", fontSize: 14 }}>{entry.ts}</time>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: "#4b5563", fontSize: 14, margin: 0 }}>No confirmed SSOT changes in this window.</p>
      )}
    </section>
  );
}

export default function ChangesPage() {
  const cache = readSsotDiffCache(ROOT);
  const logPath = path.join(ROOT, "logs", "ssot_diff.log");
  const hasLog = fs.existsSync(logPath);

  return (
    <main className="container" style={{ paddingBlock: 24 }}>
      <section style={{ display: "grid", gap: 8, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>SSOT Changes</h1>
        <p style={{ margin: 0, color: "#4b5563", maxWidth: 880 }}>
          Legal intelligence dashboard for confirmed SSOT changes. Changes are promoted only after they persist across
          two consecutive refresh cycles, so this view stays low-noise.
        </p>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Generated at: {cache.generated_at} · Pending confirmations: {cache.pending.length} · Log:{" "}
          {hasLog ? "logs/ssot_diff.log" : "not created yet"}
        </div>
      </section>

      <div style={{ display: "grid", gap: 16 }}>
        {renderChanges("Changes last 24 hours", cache.last_24h, "ssot-changes-24h")}
        {renderChanges("Changes last 7 days", cache.last_7d, "ssot-changes-7d")}
      </div>
    </main>
  );
}
