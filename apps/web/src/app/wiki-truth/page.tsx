import type { Metadata } from "next";
import WikiTruthTable from "./WikiTruthTable";
import { getDisplayName } from "@/lib/countryNames";
import type { SsotDiffEntry } from "@/lib/ssotDiff/ssotDiffTypes";
import { buildWikiTruthPageModel } from "@/lib/wikiTruthPageModel";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

function formatRecentChange(entry: SsotDiffEntry) {
  switch (entry.type) {
    case "STATUS_CHANGE":
      return `Recreational ${entry.old_value || "-"} -> ${entry.new_value || "-"}`;
    case "MED_STATUS_CHANGE":
      return `Medical ${entry.old_value || "-"} -> ${entry.new_value || "-"}`;
    case "NOTES_UPDATE":
      return "Notes updated";
    case "OFFICIAL_SOURCE_ADDED":
      return "Official source added";
    case "OFFICIAL_SOURCE_REMOVED":
      return "Official source removed";
    case "WIKI_PAGE_CHANGED":
      return "Wiki page updated";
    default:
      return entry.type;
  }
}

export default function WikiTruthPage() {
  const pageModel = buildWikiTruthPageModel();
  const { audit, diffCache, generatedAt, snapshot } = pageModel;

  return (
    <main className="container" style={{ paddingBlock: 24 }}>
      <section style={{ display: "grid", gap: 8, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Wiki Truth Audit</h1>
        <p style={{ margin: 0, color: "#4b5563", maxWidth: 880 }}>
          Clean audit view with explicit universe boundaries. Wiki rows, ISO countries, SSOT references, territories and
          US states are counted separately, so totals like 202, 249 and 300 are expected to differ.
        </p>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Generated from SSOT payload: {generatedAt} · snapshot {snapshot.finalSnapshotId} · built {snapshot.builtAt}
        </div>
      </section>
      <section
        data-testid="wiki-truth-recent-changes"
        style={{
          marginBottom: 20,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
          padding: 16,
          display: "grid",
          gap: 10
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Recent SSOT changes</h2>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Diff cache generated: {diffCache.generated_at}</div>
        </div>
        <div style={{ display: "grid", gap: 6, color: "#374151", fontSize: 14 }}>
          <div>Last 24 hours: {diffCache.last_24h.length}</div>
          <div>Last 7 days: {diffCache.last_7d.length}</div>
          <div>Pending confirmation: {diffCache.pending.length}</div>
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, color: "#374151", fontSize: 14 }}>
          {diffCache.last_24h.slice(0, 5).map((entry) => (
            <li key={`${entry.change_key}-${entry.ts}`}>
              {getDisplayName(entry.geo, "en") || entry.geo}: {formatRecentChange(entry)}
            </li>
          ))}
          {!diffCache.last_24h.length ? <li>No confirmed changes in the last 24 hours.</li> : null}
        </ul>
      </section>
      <WikiTruthTable audit={audit} />
    </main>
  );
}
