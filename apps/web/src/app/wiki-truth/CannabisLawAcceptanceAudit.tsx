"use client";

import type { WikiTruthAcceptanceAuditView } from "@/lib/wikiTruthAcceptanceAudit";

function formatEvidence(evidence: Record<string, unknown>) {
  const text = JSON.stringify(evidence);
  if (!text || text === "{}") return "-";
  return text.length > 360 ? `${text.slice(0, 360)}...` : text;
}

export default function CannabisLawAcceptanceAudit({
  acceptance,
}: {
  acceptance: WikiTruthAcceptanceAuditView;
}) {
  const requirementStatusByKey = Object.fromEntries(
    acceptance.globalRequirements.map((requirement) => [
      requirement.key,
      requirement.status,
    ]),
  );
  return (
    <section
      className="sectionCard acceptanceAudit"
      data-testid="wiki-truth-acceptance-audit"
      data-complete={acceptance.complete ? "1" : "0"}
      data-rows-total={acceptance.rowsTotal}
      data-rows-expected={acceptance.rowsExpected}
      data-report-version={acceptance.reportVersion}
      data-primary-law-all-307={
        requirementStatusByKey.primaryLawAll307 || "UNKNOWN"
      }
      data-color-review-closed-all-307={
        requirementStatusByKey.colorReviewClosedAll307 || "UNKNOWN"
      }
      data-color-apply-plan-ready={
        requirementStatusByKey.colorApplyPlanReady || "UNKNOWN"
      }
      data-color-apply-gate-fail-closed={
        requirementStatusByKey.colorApplyGateFailClosed || "UNKNOWN"
      }
      data-blocker-geos={acceptance.blockerGeos.join(",")}
    >
      <h2>Truth-first {acceptance.rowsExpected} acceptance audit</h2>
      <p className="sectionHint">
        Эта секция показывает итоговую приёмку pasted Truth-First требований.
        Она читает только локальный acceptance artifact и намеренно оставляет
        цель незакрытой, пока primary-law и color-review blockers не закрыты.
      </p>
      <div className="hardRule">
        Acceptance complete: {acceptance.complete ? "TRUE" : "FALSE"}.
        Production/SSOT/map changes are not applied by this view.
      </div>
      <div className="acceptanceGrid">
        <div>
          <strong>Rows</strong>
          <div>
            {acceptance.rowsTotal} / {acceptance.rowsExpected}
          </div>
        </div>
        <div>
          <strong>Primary Law {acceptance.rowsExpected}</strong>
          <div>{requirementStatusByKey.primaryLawAll307 || "UNKNOWN"}</div>
        </div>
        <div>
          <strong>Color review</strong>
          <div>
            {requirementStatusByKey.colorReviewClosedAll307 || "UNKNOWN"}
          </div>
        </div>
        <div>
          <strong>Apply gate</strong>
          <div>
            {requirementStatusByKey.colorApplyGateFailClosed || "UNKNOWN"}
          </div>
        </div>
        <div>
          <strong>Blocker GEO</strong>
          <div>{acceptance.blockerGeos.join(",") || "-"}</div>
        </div>
      </div>
      <details className="acceptanceDetails" open>
        <summary>Global requirements</summary>
        <div className="tableWrap acceptanceTableWrap">
          <table
            className="truthTable"
            data-testid="wiki-truth-acceptance-requirements-table"
          >
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Evidence preview</th>
              </tr>
            </thead>
            <tbody>
              {acceptance.globalRequirements.map((requirement) => (
                <tr
                  key={requirement.key}
                  data-requirement-key={requirement.key}
                  data-status={requirement.status}
                >
                  <td className="colMeta">{requirement.key}</td>
                  <td className="colMeta">{requirement.status}</td>
                  <td className="colNotes">{requirement.reason || "-"}</td>
                  <td className="colNotes">
                    {formatEvidence(requirement.evidence)}
                  </td>
                </tr>
              ))}
              {!acceptance.globalRequirements.length ? (
                <tr>
                  <td colSpan={4}>Acceptance requirements отсутствуют.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>
      <details className="acceptanceDetails">
        <summary>{acceptance.rowsExpected} GEO row acceptance statuses</summary>
        <div className="tableWrap acceptanceTableWrap">
          <table
            className="truthTable"
            data-testid="wiki-truth-acceptance-rows-table"
          >
            <thead>
              <tr>
                <th>GEO</th>
                <th>Territory</th>
                <th>Status</th>
                <th>Color audit</th>
                <th>Truth rule</th>
              </tr>
            </thead>
            <tbody>
              {acceptance.rows.map((row) => (
                <tr
                  key={row.geo}
                  data-geo={row.geo}
                  data-status={row.status}
                  data-color-status={row.colorStatus}
                  data-truth-rule-id={row.truthRuleId}
                >
                  <td className="colGeo">{row.geo}</td>
                  <td className="colCountry">{row.territory}</td>
                  <td className="colMeta">{row.status}</td>
                  <td className="colMeta">{row.colorStatus}</td>
                  <td className="colMeta">{row.truthRuleId}</td>
                </tr>
              ))}
              {!acceptance.rows.length ? (
                <tr>
                  <td colSpan={5}>Acceptance rows отсутствуют.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>
      <style jsx>{`
        .acceptanceAudit {
          margin-top: 28px;
          border-color: #fde68a;
          background: #fffbeb;
        }
        .hardRule {
          border: 1px solid #d97706;
          background: #fef3c7;
          color: #78350f;
          border-radius: 8px;
          padding: 12px;
          margin: 10px 0;
          font-weight: 700;
        }
        .acceptanceGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
          margin: 12px 0;
        }
        .acceptanceGrid > div {
          border: 1px solid #fbbf24;
          border-radius: 10px;
          background: #fff7ed;
          padding: 10px;
        }
        .acceptanceGrid strong {
          display: block;
          font-size: 12px;
          color: #92400e;
          margin-bottom: 4px;
        }
        .acceptanceDetails {
          margin-top: 14px;
          border: 1px solid #fcd34d;
          border-radius: 10px;
          padding: 12px;
          background: #fff;
        }
        .acceptanceTableWrap {
          overflow: auto;
          width: min(100%, calc(100vw - 64px));
          max-width: 100%;
          max-height: 72vh;
          margin-top: 10px;
        }
        .acceptanceTableWrap table {
          width: max-content;
          min-width: 1100px;
        }
      `}</style>
    </section>
  );
}
