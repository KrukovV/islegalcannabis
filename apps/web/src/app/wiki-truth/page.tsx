import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import WikiTruthTable from "./WikiTruthTable";
import { getDisplayName } from "@/lib/countryNames";
import type { SsotDiffEntry } from "@/lib/ssotDiff/ssotDiffTypes";
import { buildWikiTruthPageModel } from "@/lib/wikiTruthPageModel";
import { isLocalAuditHost } from "@/lib/privateAuditHost";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

function formatRecentChange(entry: SsotDiffEntry) {
  switch (entry.type) {
    case "STATUS_CHANGE":
      return `Рекреационный статус: ${entry.old_value || "—"} → ${entry.new_value || "—"}`;
    case "MED_STATUS_CHANGE":
      return `Медицинский статус: ${entry.old_value || "—"} → ${entry.new_value || "—"}`;
    case "NOTES_UPDATE":
      return "Примечания обновлены";
    case "OFFICIAL_SOURCE_ADDED":
      return "Добавлен официальный источник";
    case "OFFICIAL_SOURCE_REMOVED":
      return "Удалён официальный источник";
    case "WIKI_PAGE_CHANGED":
      return "Страница Wikipedia обновлена";
    default:
      return entry.type;
  }
}

export function WikiTruthPageContent() {
  const pageModel = buildWikiTruthPageModel();
  const { audit, diffCache, generatedAt, snapshot } = pageModel;

  return (
    <main className="container" style={{ paddingBlock: 24 }}>
      <section style={{ display: "grid", gap: 8, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Аудит Wiki Truth</h1>
        <p style={{ margin: 0, color: "#4b5563", maxWidth: 880 }}>
          Проверка с явным разделением вселенных данных. Строки Wikipedia,
          страны ISO, справочник SSOT, территории и штаты США считаются
          отдельно, поэтому значения 202, 249 и 300 закономерно различаются.
        </p>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Сформировано из SSOT: {generatedAt} · снимок{" "}
          {snapshot.finalSnapshotId} · сборка {snapshot.builtAt}
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
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>Последние изменения SSOT</h2>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Кэш изменений сформирован: {diffCache.generated_at}
          </div>
        </div>
        <div
          style={{ display: "grid", gap: 6, color: "#374151", fontSize: 14 }}
        >
          <div>За последние 24 часа: {diffCache.last_24h.length}</div>
          <div>За последние 7 дней: {diffCache.last_7d.length}</div>
          <div>Ожидают подтверждения: {diffCache.pending.length}</div>
        </div>
        <ul
          style={{ margin: 0, paddingLeft: 18, color: "#374151", fontSize: 14 }}
        >
          {diffCache.last_24h.slice(0, 5).map((entry) => (
            <li key={`${entry.change_key}-${entry.ts}`}>
              {getDisplayName(entry.geo, "en") || entry.geo}:{" "}
              {formatRecentChange(entry)}
            </li>
          ))}
          {!diffCache.last_24h.length ? (
            <li>За последние 24 часа подтверждённых изменений нет.</li>
          ) : null}
        </ul>
      </section>
      <WikiTruthTable
        audit={audit}
        colorComparison={pageModel.cannabisLawColorComparison}
      />
    </main>
  );
}

export default async function WikiTruthPage() {
  const requestHeaders = await headers();
  if (!isLocalAuditHost(requestHeaders.get("host"))) {
    notFound();
  }
  return <WikiTruthPageContent />;
}
