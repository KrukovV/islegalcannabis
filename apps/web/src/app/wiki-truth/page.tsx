import type { Metadata } from "next";
import { headers } from "next/headers";
import { getBuildStamp } from "@/lib/buildStamp";
import { notFound } from "next/navigation";
import WikiTruthPrintExpansion from "./WikiTruthPrintExpansion";
import { isCi } from "@/lib/env";
import { resolveRequestOrigin } from "@/lib/requestOrigin";
import WikiTruthTable from "./WikiTruthTable";
import { getDisplayName } from "@/lib/countryNames";
import type { SsotDiffEntry } from "@/lib/ssotDiff/ssotDiffTypes";
import { buildWikiTruthPageModel } from "@/lib/wikiTruthPageModel";
import { isLocalAuditHost } from "@/lib/privateAuditHost";
import { buildRuntimeIdentity, formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { getStatusSnapshotMeta } from "@/lib/mapData";
import { checkNearLegalEnabled, checkPremium } from "@/middleware/featureGate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export function WikiTruthPageContent({
  runtimeIdentity,
  visibleRuntimeStamp,
}: {
  runtimeIdentity?: ReturnType<typeof buildRuntimeIdentity>;
  visibleRuntimeStamp?: string;
}) {
  const pageModel = buildWikiTruthPageModel();
  const { audit, diffCache, generatedAt, snapshot } = pageModel;
  const resolvedRuntimeIdentity =
    runtimeIdentity ??
    buildRuntimeIdentity({
      buildStamp: getBuildStamp(),
      snapshot: getStatusSnapshotMeta(),
      runtimeMode: process.env.NODE_ENV === "production" ? "production" : "development",
      expectedOrigin: process.env.RUNTIME_EXPECTED_ORIGIN,
      devMode: !isCi() && process.env.NODE_ENV !== "production",
      mapEnabled: false,
      premiumMode: checkPremium() ? "PAID" : "FREE",
      nearbyMode: checkNearLegalEnabled() ? "RUN" : "SKIP",
      mapTiles: "OFFLINE",
      dataSource: "SSOT",
      mapRenderer: "none",
      mapRuntime: "removed",
    });
  const resolvedVisibleRuntimeStamp = visibleRuntimeStamp || formatVisibleRuntimeStamp(resolvedRuntimeIdentity);

  return (
    <main className="container" style={{ paddingBlock: 24 }}>
      <WikiTruthPrintExpansion />
      <section style={{ display: "grid", gap: 8, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Аудит Wiki Truth</h1>
        <p style={{ margin: 0, color: "#4b5563", maxWidth: 880 }}>
          Проверка с явным разделением вселенных данных. Строки Wikipedia,
          страны ISO, справочник SSOT, территории и штаты США считаются
          отдельно, поэтому их totals не обязаны совпадать.
        </p>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Сформировано из SSOT: {generatedAt} · снимок{" "}
          {snapshot.finalSnapshotId} · сборка {snapshot.builtAt}
        </div>
        <div
          data-testid="wiki-truth-runtime-identity"
          style={{
            marginTop: 6,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#f8fafc",
            padding: 12,
            color: "#334155",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Проверка актуальности страницы:
          </div>
          <div
            data-testid="runtime-stamp"
            data-build-id={resolvedRuntimeIdentity.buildId}
            data-commit={resolvedRuntimeIdentity.commit}
            data-built-at={resolvedRuntimeIdentity.builtAt}
            data-dataset-hash={resolvedRuntimeIdentity.datasetHash}
            data-final-snapshot-id={resolvedRuntimeIdentity.finalSnapshotId}
            data-snapshot-built-at={resolvedRuntimeIdentity.snapshotBuiltAt}
            data-runtime-mode={resolvedRuntimeIdentity.runtimeMode}
            data-map-runtime={resolvedRuntimeIdentity.mapRuntime}
            data-expected-origin={resolvedRuntimeIdentity.expectedOrigin}
            style={{ display: "none" }}
          />
          <div data-testid="visible-runtime-stamp">{resolvedVisibleRuntimeStamp}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            Актуальность версии подтверждается кнопкой &laquo;Обновить&raquo;
            на этой же странице. Если версия не совпадает с вашей, нажмите
            обновить для полной навигационной перезагрузки.
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            Доступные данные в этой сборке: карта выключена, источник
            проверок — SSOT.
          </div>
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
        acceptanceAudit={pageModel.cannabisLawAcceptanceAudit}
        colorComparison={pageModel.cannabisLawColorComparison}
        colorApplyGate={pageModel.cannabisLawColorApplyGate}
        colorApplyPlan={pageModel.cannabisLawColorApplyPlan}
        colorProposals={pageModel.cannabisLawColorProposals}
        colorReviewDossier={pageModel.cannabisLawColorReviewDossier}
        legalKnowledgeAxisMatrix={pageModel.cannabisLawLegalKnowledgeAxisMatrix}
        primaryLawBlockers={pageModel.cannabisLawPrimaryLawBlockers}
        runtimeApplyPipeline={pageModel.cannabisLawRuntimeApplyPipeline}
        finalReconciliation={pageModel.cannabisLawFinalReconciliation}
      />
    </main>
  );
}

export default async function WikiTruthPage() {
  const requestHeaders = await headers();
  if (!isLocalAuditHost(requestHeaders.get("host"))) {
    notFound();
  }
  const requestOrigin = resolveRequestOrigin(requestHeaders);
  const buildStamp = getBuildStamp();
  const runtimeIdentity = buildRuntimeIdentity({
    buildStamp,
    snapshot: getStatusSnapshotMeta(),
    runtimeMode:
      process.env.NODE_ENV === "production" ? "production" : "development",
    expectedOrigin: requestOrigin,
    devMode: !isCi() && process.env.NODE_ENV !== "production",
    mapEnabled: false,
    premiumMode: checkPremium() ? "PAID" : "FREE",
    nearbyMode: checkNearLegalEnabled() ? "RUN" : "SKIP",
    mapTiles: "OFFLINE",
    dataSource: "SSOT",
    mapRenderer: "none",
    mapRuntime: "removed",
  });
  const visibleRuntimeStamp = formatVisibleRuntimeStamp(runtimeIdentity);
  return (
    <WikiTruthPageContent
      runtimeIdentity={runtimeIdentity}
      visibleRuntimeStamp={visibleRuntimeStamp}
    />
  );
}
