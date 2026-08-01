"use client";

import type { WikiTruthColorApplyPlanView } from "@/lib/wikiTruthColorApplyPlan";

function formatCounts(counts: Record<string, number>) {
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
}

function colorLabel(value: string) {
  if (value === "GREEN") return "Зелёный";
  if (value === "YELLOW") return "Жёлтый";
  if (value === "RED") return "Красный";
  if (value === "UNKNOWN") return "Без цвета";
  return value || "UNKNOWN";
}

export default function CannabisLawColorApplyPlan({
  plan,
}: {
  plan: WikiTruthColorApplyPlanView;
}) {
  return (
    <section
      className="sectionCard colorApplyPlan"
      data-testid="wiki-truth-color-apply-plan"
      data-plan-rows={plan.rowsTotal}
      data-apply-status={plan.applyStatus}
      data-non-mutating={plan.nonMutating ? "1" : "0"}
      data-requires-authorization={
        plan.requiresExplicitAuthorization ? "1" : "0"
      }
      data-applied-rows={String(plan.validation.appliedRows || 0)}
    >
      <h2>Truth-first color apply plan: pending authorization</h2>
      <p className="sectionHint">
        Это deterministic transaction plan для {plan.rowsTotal} color proposals. Он не
        применяет изменения сам: SSOT, карта, production и source evidence
        остаются неизменными до явного review/apply решения.
      </p>
      <div className="hardRule">
        Apply status: {plan.applyStatus}. Non-mutating:{" "}
        {plan.nonMutating ? "YES" : "NO"}. Explicit authorization required:{" "}
        {plan.requiresExplicitAuthorization ? "YES" : "NO"}.
      </div>
      <div className="boundaryGrid applyCounters">
        <div>
          <strong>Rows in plan</strong>
          <div>{plan.rowsTotal}</div>
        </div>
        <div>
          <strong>Safe to auto-apply</strong>
          <div>{plan.safeToAutoApply ? "YES" : "NO"}</div>
        </div>
        <div>
          <strong>Applied rows</strong>
          <div>{String(plan.validation.appliedRows || 0)}</div>
        </div>
        <div>
          <strong>Version</strong>
          <div>{plan.reportVersion}</div>
        </div>
      </div>
      <details className="applyCounts" open>
        <summary>Apply dispositions and transitions</summary>
        <div className="countColumns">
          <div>
            <h3>Dispositions</h3>
            {formatCounts(plan.counts.applyDisposition).map(([key, value]) => (
              <span key={key} className="countPill">
                {key}: {value}
              </span>
            ))}
          </div>
          <div>
            <h3>Color transitions</h3>
            {formatCounts(plan.counts.colorTransition).map(([key, value]) => (
              <span key={key} className="countPill">
                {key}: {value}
              </span>
            ))}
          </div>
        </div>
      </details>
      <div className="tableWrap applyTableWrap">
        <table className="truthTable" data-testid="wiki-truth-color-apply-plan-table">
          <thead>
            <tr>
              <th>#</th>
              <th>GEO</th>
              <th>Территория</th>
              <th>Transition</th>
              <th>Action</th>
              <th>Disposition</th>
              <th>Truth rule</th>
              <th>Safety notes</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((row) => (
              <tr
                key={row.geo}
                data-geo={row.geo}
                data-apply-disposition={row.applyDisposition}
                data-current-color={row.currentColor}
                data-truth-color={row.proposedTruthColor}
                data-blocked-primary-law={row.blockedByPrimaryLaw ? "1" : "0"}
              >
                <td className="colMeta">{row.planIndex}</td>
                <td className="colGeo">{row.geo}</td>
                <td className="colCountry">{row.territory}</td>
                <td className="colStatus">
                  {colorLabel(row.currentColor)} →{" "}
                  {colorLabel(row.proposedTruthColor)}
                </td>
                <td className="colMeta">{row.proposalAction}</td>
                <td className="colMeta">{row.applyDisposition}</td>
                <td className="colMeta">{row.truthRule}</td>
                <td className="colNotes">
                  {row.safetyNotes.map((note) => (
                    <span key={note}>{note}</span>
                  ))}
                </td>
              </tr>
            ))}
            {!plan.rows.length ? (
              <tr>
                <td colSpan={8}>Apply plan rows отсутствуют.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <style jsx>{`
        .colorApplyPlan {
          margin-top: 28px;
          border-color: #bae6fd;
          background: #f0f9ff;
        }
        .hardRule {
          border: 1px solid #0369a1;
          background: #e0f2fe;
          color: #0c4a6e;
          border-radius: 8px;
          padding: 12px;
          margin: 10px 0;
        }
        .applyCounters {
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
        .applyCounts {
          margin: 14px 0;
          border: 1px solid #7dd3fc;
          border-radius: 10px;
          padding: 12px;
          background: #f8fafc;
        }
        .countColumns {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 14px;
          margin-top: 10px;
        }
        .countColumns h3 {
          margin: 0 0 8px;
          font-size: 13px;
        }
        .countPill {
          display: inline-block;
          margin: 0 6px 6px 0;
          border-radius: 999px;
          background: #e2e8f0;
          color: #0f172a;
          padding: 5px 8px;
          font-size: 12px;
        }
        .applyTableWrap {
          overflow: auto;
          width: min(100%, calc(100vw - 64px));
          max-width: 100%;
          max-height: 72vh;
          margin-top: 14px;
        }
        .applyTableWrap table {
          width: max-content;
          min-width: 1800px;
        }
        .applyTableWrap span {
          display: block;
        }
      `}</style>
    </section>
  );
}
