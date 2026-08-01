"use client";

import type { WikiTruthLegalKnowledgeAxisMatrixView } from "@/lib/wikiTruthLegalKnowledgeAxisMatrix";

function formatCounts(counts: Record<string, number>) {
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
}

export default function CannabisLawLegalKnowledgeAxisMatrix({
  matrix,
}: {
  matrix: WikiTruthLegalKnowledgeAxisMatrixView;
}) {
  return (
    <section
      className="sectionCard legalAxisMatrix"
      data-testid="wiki-truth-legal-knowledge-axis-matrix"
      data-status={matrix.status}
      data-rows-total={matrix.rowsTotal}
      data-rows-expected={matrix.rowsExpected}
      data-required-axis-total={matrix.requiredAxisTotal}
      data-cells-total={matrix.cellsTotal}
      data-known-axis-cells={matrix.knownAxisCells}
      data-unknown-axis-cells={matrix.unknownAxisCells}
      data-rows-with-unknown-axes={matrix.rowsWithUnknownAxes}
      data-rows-with-all-axes-known={matrix.rowsWithAllAxesKnown}
      data-non-mutating={matrix.nonMutating ? "1" : "0"}
      data-local-only={matrix.localOnly ? "1" : "0"}
      data-applied-rows={matrix.appliedRows}
      data-production-touched={matrix.productionTouched ? "1" : "0"}
      data-ssot-mutation-attempted={matrix.ssotMutationAttempted ? "1" : "0"}
      data-map-mutation-attempted={matrix.mapMutationAttempted ? "1" : "0"}
      data-all-rows-have-required-axis-groups={
        matrix.validation.allRowsHaveRequiredAxisGroups === true ? "1" : "0"
      }
      data-all-rows-have-all-required-axes={
        matrix.validation.allRowsHaveAllRequiredAxes === true ? "1" : "0"
      }
      data-unknown-cells-explicit={
        matrix.validation.unknownCellsExplicit === true ? "1" : "0"
      }
      data-no-missing-axis-cells={
        matrix.validation.noMissingAxisCells === true ? "1" : "0"
      }
    >
      <h2>
        Legal Knowledge Axis Matrix: {matrix.rowsTotal} GEO ×{" "}
        {matrix.requiredAxisTotal} axes
      </h2>
      <p className="sectionHint">
        Эта локальная матрица раскрывает полную осевую модель из ТЗ. Она не
        применяет статусы/цвета: неизвестные детальные оси остаются явными
        `UNKNOWN_UNPROVEN_AXIS`, а не выводятся из цвета, Wikipedia, parser
        summary, production/export/research/CBD/Sativex или claimant/federal
        scope shortcuts.
      </p>
      <div className="hardRule">
        Matrix status: {matrix.status}. Rows: {matrix.rowsTotal}/
        {matrix.rowsExpected}. Axes per GEO: {matrix.requiredAxisTotal}.
        Cells: {matrix.cellsTotal}. Applied rows: {matrix.appliedRows}.
      </div>
      <div className="axisCounterGrid">
        <div>
          <strong>Known/coarse cells</strong>
          <div>{matrix.knownAxisCells}</div>
        </div>
        <div>
          <strong>Explicit unknown cells</strong>
          <div>{matrix.unknownAxisCells}</div>
        </div>
        <div>
          <strong>Rows with unknown axes</strong>
          <div>{matrix.rowsWithUnknownAxes}</div>
        </div>
        <div>
          <strong>Rows with all axes known</strong>
          <div>{matrix.rowsWithAllAxesKnown}</div>
        </div>
      </div>
      <details className="axisCounts" open>
        <summary>Axis status, evidence class, and guardrails</summary>
        <div className="countColumns">
          <div>
            <h3>Axis status</h3>
            {formatCounts(matrix.counts.axisStatus).map(([key, value]) => (
              <span key={key} className="countPill">
                {key}: {value}
              </span>
            ))}
          </div>
          <div>
            <h3>Evidence class</h3>
            {formatCounts(matrix.counts.evidenceClass).map(([key, value]) => (
              <span key={key} className="countPill">
                {key}: {value}
              </span>
            ))}
          </div>
          <div>
            <h3>Guardrails</h3>
            {matrix.guardrails.map((guardrail) => (
              <span key={guardrail} className="countPill neutral">
                {guardrail}
              </span>
            ))}
          </div>
        </div>
      </details>
      <div className="tableWrap axisSchemaWrap">
        <table
          className="truthTable"
          data-testid="wiki-truth-legal-axis-schema-table"
        >
          <thead>
            <tr>
              <th>Group</th>
              <th>Axis</th>
            </tr>
          </thead>
          <tbody>
            {matrix.axes.map((row) => (
              <tr
                key={`${row.group}-${row.axis}`}
                data-axis-group={row.group}
                data-axis-name={row.axis}
              >
                <td className="colMeta">{row.group}</td>
                <td className="colMeta">{row.axis}</td>
              </tr>
            ))}
            {!matrix.axes.length ? (
              <tr>
                <td colSpan={2}>Axis schema отсутствует.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="tableWrap axisRowsWrap">
        <table
          className="truthTable"
          data-testid="wiki-truth-legal-axis-matrix-table"
        >
          <thead>
            <tr>
              <th>GEO</th>
              <th>Territory</th>
              <th>Truth color</th>
              <th>Known/coarse</th>
              <th>Unknown</th>
              <th>Coarse</th>
              <th>Direct</th>
              <th>Required axes</th>
              <th>Wiki audit</th>
              <th>SSOT</th>
              <th>Color audit</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr
                key={row.geo}
                data-geo={row.geo}
                data-truth-color={row.truthColor}
                data-known-axis-cells={row.knownAxisCells}
                data-unknown-axis-cells={row.unknownAxisCells}
                data-required-axis-cells={row.requiredAxisCells}
                data-wiki-audit-status={row.wikiAuditStatus}
                data-ssot-status={row.ssotStatus}
                data-color-status={row.colorStatus}
              >
                <td className="colGeo">{row.geo}</td>
                <td className="colCountry">{row.territory}</td>
                <td className="colMeta">{row.truthColor}</td>
                <td className="colMeta">{row.knownAxisCells}</td>
                <td className="colMeta">{row.unknownAxisCells}</td>
                <td className="colMeta">{row.coarseAxisCells}</td>
                <td className="colMeta">{row.directAxisCells}</td>
                <td className="colMeta">{row.requiredAxisCells}</td>
                <td className="colMeta">{row.wikiAuditStatus}</td>
                <td className="colMeta">{row.ssotStatus}</td>
                <td className="colMeta">{row.colorStatus}</td>
              </tr>
            ))}
            {!matrix.rows.length ? (
              <tr>
                <td colSpan={11}>Legal Knowledge Axis Matrix rows отсутствуют.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <style jsx>{`
        .legalAxisMatrix {
          margin-top: 28px;
          border-color: #fde68a;
          background: #fffbeb;
        }
        .hardRule {
          border: 1px solid #b45309;
          background: #fef3c7;
          color: #78350f;
          border-radius: 8px;
          padding: 12px;
          margin: 10px 0;
          font-weight: 700;
        }
        .axisCounterGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 10px;
          margin: 14px 0;
        }
        .axisCounterGrid > div {
          border: 1px solid #fbbf24;
          background: #fff;
          border-radius: 10px;
          padding: 12px;
        }
        .axisCounts {
          margin: 14px 0;
          border: 1px solid #fbbf24;
          border-radius: 10px;
          padding: 12px;
          background: #fff;
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
          background: #fef3c7;
          color: #78350f;
          padding: 5px 8px;
          font-size: 12px;
          font-weight: 700;
        }
        .countPill.neutral {
          background: #fff7ed;
          color: #9a3412;
        }
        .axisRowsWrap,
        .axisSchemaWrap {
          overflow: auto;
          width: min(100%, calc(100vw - 64px));
          max-width: 100%;
          max-height: 72vh;
          margin-top: 14px;
        }
        .axisRowsWrap table {
          width: max-content;
          min-width: 1700px;
        }
        .axisSchemaWrap table {
          width: max-content;
          min-width: 700px;
        }
      `}</style>
    </section>
  );
}
