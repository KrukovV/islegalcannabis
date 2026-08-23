"use client";

import type { WikiTruthGoalAcceptanceView } from "@/lib/wikiTruthGoalAcceptance";

function value(record: Record<string, number | string | boolean>, key: string) {
  return record[key] ?? "MISSING";
}

export default function GoalAcceptanceAudit({ acceptance }: { acceptance: WikiTruthGoalAcceptanceView }) {
  const status = acceptance.goalAchieved
    ? "GOAL_ACCEPTANCE_COMPLETE"
    : "GOAL_ACCEPTANCE_FAIL_CLOSED";
  return (
    <section
      className="sectionCard goalAcceptanceAudit"
      data-testid="wiki-truth-goal-acceptance"
      data-goal-achieved={acceptance.goalAchieved ? "1" : "0"}
      data-truth-reconciled={value(acceptance.legal, "TRUTH_RECONCILED")}
      data-store-geo-checked={value(acceptance.store, "STORE_GEO_CHECKED")}
      data-store-visible={value(acceptance.store, "STORES_VISIBLE")}
      data-human-summary-placeholders={value(acceptance.legal, "HUMAN_SUMMARY_MACHINE_PLACEHOLDER_ROWS")}
      data-visual-map-audit={value(acceptance.map, "VISUAL_MAP_AUDIT_PASS") ? "1" : "0"}
    >
      <h2>Итоговая приёмка 307 GEO</h2>
      <p className="sectionHint">
        Этот локальный итог объединяет legal reconciliation и store truth, не позволяя одному домену подтверждать другой.
      </p>
      <div className={acceptance.goalAchieved ? "finalGate ok" : "finalGate pending"}>{status}</div>
      <p className="sectionHint">
        {acceptance.goalAchieved
          ? "Все обязательные условия приёмки выполнены."
          : "Итог заблокирован до закрытия перечисленных ниже доказательных условий."}
      </p>
      <div className="boundaryGrid goalAcceptanceGrid">
        <div><strong>Сверено legal truth</strong><div>{value(acceptance.legal, "TRUTH_RECONCILED")} / 307</div></div>
        <div><strong>Доказательность: proven / strong</strong><div>{value(acceptance.legal, "TRUTH_PROVEN")} / {value(acceptance.legal, "TRUTH_STRONG")}</div></div>
        <div><strong>Доказательность: partial / conflicting / unknown</strong><div>{value(acceptance.legal, "TRUTH_PARTIAL")} / {value(acceptance.legal, "TRUTH_CONFLICTING")} / {value(acceptance.legal, "TRUTH_UNKNOWN")}</div></div>
        <div><strong>Технические заглушки в объяснениях</strong><div>{value(acceptance.legal, "HUMAN_SUMMARY_MACHINE_PLACEHOLDER_ROWS")}</div></div>
        <div><strong>Proposal-only расхождения</strong><div>{value(acceptance.legal, "CROSS_LAYER_TRUTH_CONFLICTS")}</div></div>
        <div><strong>Расхождения применённых слоёв</strong><div>{value(acceptance.legal, "APPLIED_CROSS_LAYER_TRUTH_CONFLICTS")}</div></div>
        <div><strong>Проверено GEO для store layer</strong><div>{value(acceptance.store, "STORE_GEO_CHECKED")} / 307</div></div>
        <div><strong>Проверены источники / видимые точки</strong><div>{value(acceptance.store, "STORE_SOURCES_VALIDATED")} / {value(acceptance.store, "STORES_VISIBLE")}</div></div>
        <div><strong>Маркеры на мировом масштабе</strong><div>{value(acceptance.map, "LOW_ZOOM_MARKER_COUNT")}</div></div>
        <div><strong>Визуальная проверка карты</strong><div>{String(value(acceptance.map, "VISUAL_MAP_AUDIT_PASS"))}</div></div>
      </div>
      <details>
        <summary>Блокеры завершения: {acceptance.completionBlockers.length}</summary>
        <ul>
          {acceptance.completionBlockers.map((blocker) => (
            <li key={blocker.id}><strong>{blocker.id}</strong>: {blocker.reason}</li>
          ))}
        </ul>
      </details>
      <style jsx>{`
        .goalAcceptanceAudit { border-color: #b45309; background: #fffbeb; }
        .goalAcceptanceGrid { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
      `}</style>
    </section>
  );
}
