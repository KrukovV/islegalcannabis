"use client";

import type { WikiTruthStoreAuditView } from "@/lib/wikiTruthStoreAudit";

function count(view: WikiTruthStoreAuditView, key: string) {
  const value = view.counts[key];
  return typeof value === "number" ? value : 0;
}

function inventoryShapeLabel(shape: string) {
  if (shape === "REGISTRY_DIRECTORY_CANDIDATE") return "Каталог / реестр";
  if (shape === "SINGLE_LICENSE_RECORD_CANDIDATE") return "Одна лицензия";
  return "НЕ ПОДТВЕРЖДЕНО";
}

export default function CannabisStoreAudit({ audit }: { audit: WikiTruthStoreAuditView }) {
  const sourceCandidates = audit.rows.flatMap((row) => row.source_candidates.map((candidate) => ({ geoId: row.geo_id, territory: row.territory, candidate })));
  return (
    <section
      className="sectionCard storeTruthAudit"
      data-testid="wiki-truth-store-audit"
      data-store-geo-checked={count(audit, "STORE_GEO_CHECKED")}
      data-stores-visible={count(audit, "STORES_VISIBLE")}
      data-store-source-candidates={count(audit, "STORE_SOURCE_CANDIDATES")}
      data-visual-map-audit={audit.acceptance.visualMapAuditPass ? "1" : "0"}
      data-circular-truth-dependency={count(audit, "CIRCULAR_TRUTH_DEPENDENCY")}
    >
      <h2>Лицензированные точки продажи каннабиса</h2>
      <p className="sectionHint">
        Магазины — отдельный домен доказательств. Legal evidence может открыть поиск реестра, но найденная точка никогда не меняет legal truth. На карту допускаются только независимо проверенные активные геокодированные записи.
      </p>
      <div className={audit.acceptance.storeDiscoveryComplete ? "finalGate ok" : "finalGate pending"}>
        {audit.acceptance.storeDiscoveryComplete ? "STORE_DISCOVERY_COMPLETE" : "STORE_DISCOVERY_FAIL_CLOSED"}
      </div>
      <div className="boundaryGrid storeCounters">
        <div><strong>Проверено GEO</strong><div>{count(audit, "STORE_GEO_CHECKED")}</div></div>
        <div><strong>GEO с допустимой моделью</strong><div>{count(audit, "STORE_GEO_ELIGIBLE")}</div></div>
        <div><strong>Подтверждённые официальные реестры</strong><div>{count(audit, "OFFICIAL_REGISTRY_FOUND")}</div></div>
        <div><strong>Локальные leads для проверки</strong><div>{count(audit, "STORE_SOURCE_CANDIDATES")}</div></div>
        <div><strong>Ожидают извлечения</strong><div>{count(audit, "SOURCE_NEEDS_EXTRACTION")}</div></div>
        <div><strong>Проверены / видимы</strong><div>{count(audit, "STORES_VALIDATED")} / {count(audit, "STORES_VISIBLE")}</div></div>
        <div><strong>Заблокированы</strong><div>{count(audit, "STORES_BLOCKED")}</div></div>
        <div><strong>Старые демо изолированы</strong><div>{count(audit, "LEGACY_UNVERIFIED_RETAILERS_QUARANTINED")}</div></div>
      </div>
      <details>
        <summary>Технические safeguards карты точек</summary>
        <ul>
          <li>Индивидуальные маркеры на мировом масштабе: {audit.acceptance.lowZoomMarkerCount}</li>
          <li>Текущая локальная проекция: {audit.acceptance.localZoomMarkerCount}</li>
          <li>Проверка viewport: {audit.acceptance.viewportQueryPass ? "ПРОШЛА" : "ЗАБЛОКИРОВАНА"}</li>
          <li>Проверка кластеров: {audit.acceptance.clusteringPass ? "ПРОШЛА" : "ЗАБЛОКИРОВАНА"}</li>
          <li>Устаревших viewport-ответов: {audit.acceptance.staleViewportResponseCount}</li>
          <li>Циклических legal/store-зависимостей: {count(audit, "CIRCULAR_TRUTH_DEPENDENCY")}</li>
        </ul>
      </details>
      <details>
        <summary>Открытые blockers</summary>
        <ul>{audit.acceptance.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
      </details>
      <details>
        <summary>Локальные source leads, требующие official review: {sourceCandidates.length}</summary>
        <p className="sectionHint">
          Это source-only очередь. Она не доказывает реестр, лицензию, активную точку или видимость на карте.
        </p>
        <div className="tableWrap storeTableWrap">
          <table className="truthTable">
            <thead>
              <tr>
                <th>GEO</th><th>Территория</th><th>Тип точки-кандидата</th><th>Форма lead</th><th>Орган</th><th>URL источника</th><th>Тип источника</th><th>Уверенность</th><th>C3 visual</th><th>Состояние review</th>
              </tr>
            </thead>
            <tbody>
              {sourceCandidates.map(({ geoId, territory, candidate }) => (
                <tr key={candidate.candidateId} data-geo={geoId} data-source-candidate={candidate.candidateId}>
                  <td className="colGeo">{geoId}</td><td>{territory}</td><td>{candidate.storeTypeCandidates.join(", ")}</td><td>{inventoryShapeLabel(candidate.inventoryShape)}</td><td>{candidate.authority}</td><td>{candidate.sourceUrl ? <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Открыть источник</a> : "НЕ ПОДТВЕРЖДЕНО"}</td><td>{candidate.sourceTypeCandidate}</td><td>{candidate.sourceConfidence}</td><td>{candidate.c3VisualReview}</td><td>{candidate.status} / {candidate.sourceClassification}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary>Технический inventory store discovery: {audit.rows.length} GEO</summary>
        <div className="tableWrap storeTableWrap">
          <table className="truthTable">
            <thead>
              <tr>
                <th>GEO</th><th>Территория</th><th>Legal truth</th><th>Законность типа точки</th><th>Store state</th><th>Локальные leads</th><th>Официальный реестр</th><th>Извлечено</th><th>Видимо</th><th>Причина</th>
              </tr>
            </thead>
            <tbody>
              {audit.rows.map((row) => (
                <tr key={row.geo_id} data-geo={row.geo_id} data-store-state={row.store_discovery_state}>
                  <td className="colGeo">{row.geo_id}</td><td>{row.territory}</td><td>{row.canonical_truth_color}</td><td title={[row.store_eligibility.retailLegality.reason, row.store_eligibility.medicalDispensaryLegality.reason, row.store_eligibility.pharmacyDispensingLegality.reason, row.store_eligibility.clubLegality.reason].filter(Boolean).join(" · ")}>Retail: {row.store_eligibility.retailLegality.state}<br />Medical: {row.store_eligibility.medicalDispensaryLegality.state}<br />Pharmacy: {row.store_eligibility.pharmacyDispensingLegality.state}<br />Club: {row.store_eligibility.clubLegality.state}</td><td>{row.store_discovery_state}</td><td>{row.source_candidate_count}</td><td>{row.official_registry_available ? "YES" : "NO"}</td><td>{row.total_extracted}</td><td>{row.total_visible}</td><td className="colNotes">{row.state_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <style jsx>{`
        .storeTruthAudit { margin-top: 28px; border-color: #1d4ed8; background: radial-gradient(circle at top right, #dbeafe 0, transparent 34%), #eff6ff; }
        .finalGate { border: 1px solid #b45309; border-radius: 10px; padding: 12px; margin: 12px 0; font-weight: 800; }
        .finalGate.ok { border-color: #15803d; background: #dcfce7; color: #14532d; }
        .finalGate.pending { background: #fffbeb; color: #78350f; }
        .storeCounters { grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); }
        .storeTableWrap { max-height: 70vh; overflow: auto; margin-top: 10px; }
        .storeTableWrap table { width: max-content; min-width: 1650px; }
      `}</style>
    </section>
  );
}
