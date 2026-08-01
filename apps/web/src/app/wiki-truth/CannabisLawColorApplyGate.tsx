"use client";

import type { WikiTruthColorApplyGateView } from "@/lib/wikiTruthColorApplyGate";

function formatCounts(counts: Record<string, number>) {
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
}

export default function CannabisLawColorApplyGate({
  gate,
}: {
  gate: WikiTruthColorApplyGateView;
}) {
  return (
    <section
      className="sectionCard colorApplyGate"
      data-testid="wiki-truth-color-apply-gate"
      data-gate-status={gate.gateStatus}
      data-non-mutating={gate.nonMutating ? "1" : "0"}
      data-local-only={gate.localOnly ? "1" : "0"}
      data-authorization-present={gate.authorization.present ? "1" : "0"}
      data-ssot-write-enabled={gate.environment.ssotWriteEnabled ? "1" : "0"}
      data-applied-rows={gate.appliedRows}
      data-blocked-rows={gate.blockedRows}
      data-production-touched={gate.productionTouched ? "1" : "0"}
      data-primary-law-blockers={gate.primaryLawBlockers.geos.join(",")}
    >
      <h2>Truth-first color apply gate: fail-closed local proof</h2>
      <p className="sectionHint">
        Этот gate показывает, почему {gate.rows.length} color proposals не могут перейти в
        SSOT/map/prod без явной авторизации и закрытия primary-law blockers.
        Он только читает apply-plan/blockers и пишет audit artifact.
      </p>
      <div className="hardRule">
        Gate status: {gate.gateStatus}. Applied rows: {gate.appliedRows}.
        Production touched: {gate.productionTouched ? "YES" : "NO"}.
      </div>
      <div className="boundaryGrid gateCounters">
        <div>
          <strong>Authorization</strong>
          <div>{gate.authorization.present ? "PRESENT" : "MISSING"}</div>
        </div>
        <div>
          <strong>SSOT_WRITE</strong>
          <div>{gate.environment.ssotWriteEnabled ? "1" : "0"}</div>
        </div>
        <div>
          <strong>Blocked rows</strong>
          <div>{gate.blockedRows}</div>
        </div>
        <div>
          <strong>Primary-law blockers</strong>
          <div>{gate.primaryLawBlockers.geos.join(",") || "-"}</div>
        </div>
      </div>
      <details className="gateCounts" open>
        <summary>Fail-closed reasons and hash proof</summary>
        <div className="countColumns">
          <div>
            <h3>Blocking reasons</h3>
            {gate.blockingReasons.map((reason) => (
              <span key={reason} className="countPill">
                {reason}
              </span>
            ))}
          </div>
          <div>
            <h3>Gate reason counts</h3>
            {formatCounts(gate.counts.gateReasons).map(([key, value]) => (
              <span key={key} className="countPill">
                {key}: {value}
              </span>
            ))}
          </div>
        </div>
        <div className="hashList">
          {gate.protectedHashProof.map((item) => (
            <span key={item.path}>
              {item.path}: {item.exists ? item.sha256 : "missing"}
            </span>
          ))}
        </div>
      </details>
      <div className="tableWrap gateTableWrap">
        <table
          className="truthTable"
          data-testid="wiki-truth-color-apply-gate-table"
        >
          <thead>
            <tr>
              <th>#</th>
              <th>GEO</th>
              <th>Территория</th>
              <th>Disposition</th>
              <th>Gate decision</th>
              <th>Gate reasons</th>
            </tr>
          </thead>
          <tbody>
            {gate.rows.map((row) => (
              <tr
                key={row.geo}
                data-geo={row.geo}
                data-gate-decision={row.gateDecision}
                data-gate-reasons={row.gateReasons.join(",")}
              >
                <td className="colMeta">{row.planIndex}</td>
                <td className="colGeo">{row.geo}</td>
                <td className="colCountry">{row.territory}</td>
                <td className="colMeta">{row.applyDisposition}</td>
                <td className="colMeta">{row.gateDecision}</td>
                <td className="colNotes">{row.gateReasons.join(", ")}</td>
              </tr>
            ))}
            {!gate.rows.length ? (
              <tr>
                <td colSpan={6}>Apply gate rows отсутствуют.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <style jsx>{`
        .colorApplyGate {
          margin-top: 28px;
          border-color: #fecaca;
          background: #fff1f2;
        }
        .hardRule {
          border: 1px solid #be123c;
          background: #ffe4e6;
          color: #881337;
          border-radius: 8px;
          padding: 12px;
          margin: 10px 0;
        }
        .gateCounters {
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
        .gateCounts {
          margin: 14px 0;
          border: 1px solid #fda4af;
          border-radius: 10px;
          padding: 12px;
          background: #fff7ed;
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
          background: #fee2e2;
          color: #991b1b;
          padding: 5px 8px;
          font-size: 12px;
          font-weight: 700;
        }
        .hashList {
          display: grid;
          gap: 4px;
          margin-top: 12px;
          font-size: 11px;
          color: #7f1d1d;
          overflow-wrap: anywhere;
        }
        .gateTableWrap {
          overflow: auto;
          width: min(100%, calc(100vw - 64px));
          max-width: 100%;
          max-height: 72vh;
          margin-top: 14px;
        }
        .gateTableWrap table {
          width: max-content;
          min-width: 1400px;
        }
      `}</style>
    </section>
  );
}
