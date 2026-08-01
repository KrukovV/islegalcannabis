"use client";

import type { WikiTruthFinalReconciliationView } from "@/lib/wikiTruthFinalReconciliation";

function entries(counts: Record<string, number>) {
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
}

export default function CannabisLawFinalReconciliation({
  reconciliation,
}: {
  reconciliation: WikiTruthFinalReconciliationView;
}) {
  return (
    <section
      className="sectionCard finalReconciliation"
      data-testid="wiki-truth-final-reconciliation"
      data-rows-total={reconciliation.rowsTotal}
      data-rows-expected={reconciliation.rowsExpected}
      data-complete={reconciliation.acceptance.complete ? "1" : "0"}
      data-cross-layer-conflicts={
        reconciliation.acceptance.crossLayerConflictRows.length
      }
      data-unproven-green={
        reconciliation.acceptance.unprovenGreenRows.length
      }
      data-no-mutation={reconciliation.noMutationProof.unchanged ? "1" : "0"}
      data-truth-red={reconciliation.counts.truthColors.RED || 0}
      data-truth-yellow={reconciliation.counts.truthColors.YELLOW || 0}
      data-truth-green={reconciliation.counts.truthColors.GREEN || 0}
      data-truth-unknown={reconciliation.counts.truthColors.UNKNOWN || 0}
    >
      <h2>
        Финальная Truth-First сверка: {reconciliation.rowsTotal}/
        {reconciliation.rowsExpected} GEO
      </h2>
      <p className="sectionHint">
        Единственный текущий вывод строится функцией{" "}
        <code>{reconciliation.deterministicColorFunction}</code>. Wikipedia и
        SSOT показаны только как независимые объекты сравнения.
      </p>
      <div
        className={
          reconciliation.acceptance.complete ? "finalGate ok" : "finalGate pending"
        }
      >
        {reconciliation.acceptance.complete
          ? "FINAL_RECONCILIATION_COMPLETE"
          : "FINAL_RECONCILIATION_HAS_OPEN_TRUTH_BLOCKERS"}
      </div>
      <div className="boundaryGrid finalCounters">
        {entries(reconciliation.counts.truthColors).map(([key, value]) => (
          <div key={key}>
            <strong>{key}</strong>
            <div>{value}</div>
          </div>
        ))}
        <div>
          <strong>Изменили Truth Color</strong>
          <div>{reconciliation.changes.length}</div>
        </div>
        <div>
          <strong>UNKNOWN / без цвета</strong>
          <div>{reconciliation.unknownRows.length}</div>
        </div>
        <div>
          <strong>Cross-layer conflicts</strong>
          <div>{reconciliation.acceptance.crossLayerConflictRows.length}</div>
        </div>
        <div>
          <strong>Unproven GREEN</strong>
          <div>{reconciliation.acceptance.unprovenGreenRows.length}</div>
        </div>
        <div>
          <strong>Protected files unchanged</strong>
          <div>{reconciliation.noMutationProof.unchanged ? "YES" : "NO"}</div>
        </div>
      </div>
      <details open>
        <summary>Исправления общей юридической модели</summary>
        <ul>
          {reconciliation.ruleEngineCorrections.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
      <details open>
        <summary>FALSE GREEN / YELLOW / RED / UNKNOWN</summary>
        <div className="falseCounts">
          {["FALSE_GREEN", "FALSE_YELLOW", "FALSE_RED", "FALSE_UNKNOWN"].map(
            (key) => (
              <span key={key}>
                {key}: {reconciliation.counts.falseClasses[key] || 0}
              </span>
            ),
          )}
        </div>
      </details>
      <details open>
        <summary>Изменения цвета и Primary Law</summary>
        <div className="tableWrap finalTableWrap">
          <table className="truthTable">
            <thead>
              <tr>
                <th>GEO</th>
                <th>Было</th>
                <th>Truth</th>
                <th>FALSE class</th>
                <th>Rule</th>
                <th>Причина</th>
                <th>Primary Law</th>
              </tr>
            </thead>
            <tbody>
              {reconciliation.changes.map((row) => (
                <tr key={row.geo} data-geo={row.geo}>
                  <td className="colGeo">{row.geo}</td>
                  <td>{row.previousColor}</td>
                  <td>{row.truthColor}</td>
                  <td>{row.falseClass || "-"}</td>
                  <td>{row.truthRuleId}</td>
                  <td className="colNotes">{row.truthReason}</td>
                  <td className="colUrl">
                    {row.primaryLaw?.primaryLawUrl ? (
                      <a
                        href={row.primaryLaw.primaryLawUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {row.primaryLaw.primaryLawUrl}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
              {!reconciliation.changes.length ? (
                <tr>
                  <td colSpan={7}>Изменений Truth Color нет.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary>
          Полный reconciled manifest: {reconciliation.rows.length} GEO
        </summary>
        <div className="tableWrap finalTableWrap">
          <table className="truthTable">
            <thead>
              <tr>
                <th>GEO</th>
                <th>Территория</th>
                <th>Truth Color</th>
                <th>Rule</th>
                <th>Wiki Audit</th>
                <th>SSOT Audit</th>
                <th>Layer conflict</th>
              </tr>
            </thead>
            <tbody>
              {reconciliation.rows.map((row) => (
                <tr
                  key={row.geo}
                  data-geo={row.geo}
                  data-truth-color={row.truthColor}
                  data-layer-conflict={row.layerConflict ? "1" : "0"}
                >
                  <td className="colGeo">{row.geo}</td>
                  <td>{row.territory}</td>
                  <td>{row.truthColor}</td>
                  <td>{row.truthRuleId}</td>
                  <td>{row.wikipedia?.status || "UNKNOWN"}</td>
                  <td>{row.ssot?.status || "UNKNOWN"}</td>
                  <td>{row.layerConflict ? "YES" : "NO"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <style jsx>{`
        .finalReconciliation {
          margin-top: 28px;
          border-color: #0f766e;
          background:
            radial-gradient(circle at top right, #ccfbf1 0, transparent 34%),
            #f0fdfa;
        }
        .finalGate {
          border: 1px solid;
          border-radius: 10px;
          padding: 12px;
          margin: 12px 0;
          font-weight: 800;
        }
        .finalGate.ok {
          border-color: #15803d;
          background: #dcfce7;
          color: #14532d;
        }
        .finalGate.pending {
          border-color: #b45309;
          background: #fffbeb;
          color: #78350f;
        }
        .finalCounters {
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        }
        .falseCounts {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }
        .falseCounts span {
          border-radius: 999px;
          background: #fff;
          border: 1px solid #5eead4;
          padding: 6px 10px;
          font-weight: 700;
        }
        .finalTableWrap {
          max-height: 70vh;
          overflow: auto;
          margin-top: 10px;
        }
        .finalTableWrap table {
          width: max-content;
          min-width: 1500px;
        }
      `}</style>
    </section>
  );
}
