"use client";

import { useMemo, useState } from "react";
import type { WikiTruthColorProposalsView } from "@/lib/wikiTruthColorProposals";
import { ruAuditValue } from "./wikiTruthRu";

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

export default function CannabisLawColorProposals({
  proposals,
}: {
  proposals: WikiTruthColorProposalsView;
}) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("ALL");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const actionOptions = useMemo(
    () => ["ALL", ...Object.keys(proposals.counts.proposalAction).sort()],
    [proposals.counts.proposalAction],
  );
  const visibleRows = useMemo(
    () =>
      proposals.proposals.filter((row) => {
        const matchesQuery =
          !normalizedQuery ||
          `${row.geo} ${row.territory} ${row.proposalAction} ${row.truthRule}`
            .toLocaleLowerCase()
            .includes(normalizedQuery);
        const matchesAction = action === "ALL" || row.proposalAction === action;
        return matchesQuery && matchesAction;
      }),
    [action, normalizedQuery, proposals.proposals],
  );

  return (
    <section
      className="sectionCard colorProposals"
      data-testid="wiki-truth-color-proposals"
      data-proposals-total={proposals.proposalsTotal}
      data-non-mutating={proposals.nonMutating ? "1" : "0"}
      data-report-version={proposals.reportVersion}
    >
      <h2>Truth-first color proposals: non-mutating Color Audit</h2>
      <p className="sectionHint">
        Этот блок показывает, какие цвета предлагает truth-first engine для
        строк, где текущая карта расходится с независимым юридическим выводом.
        Это не изменение SSOT и не изменение карты: предложения проходят через
        отдельный review/apply step.
      </p>
      <p className="hardRule">
        Mutation policy: {proposals.mutationPolicy || "non-mutating local artifact"}
      </p>
      <div className="boundaryGrid proposalCounters">
        <div>
          <strong>Строк в truth report</strong>
          <div>{proposals.rowsTotal}</div>
        </div>
        <div>
          <strong>Предложений цветов</strong>
          <div>{proposals.proposalsTotal}</div>
        </div>
        <div>
          <strong>Non-mutating</strong>
          <div>{proposals.nonMutating ? "YES" : "NO"}</div>
        </div>
        <div>
          <strong>Версия truth report</strong>
          <div>{proposals.reportVersion}</div>
        </div>
      </div>
      <details className="proposalCounts" open>
        <summary>Счётчики proposed actions и truth colors</summary>
        <div className="countColumns">
          <div>
            <h3>Proposal actions</h3>
            {formatCounts(proposals.counts.proposalAction).map(([key, value]) => (
              <span key={key} className="countPill">
                {key}: {value}
              </span>
            ))}
          </div>
          <div>
            <h3>Proposed truth colors</h3>
            {formatCounts(proposals.counts.proposedTruthColor).map(([key, value]) => (
              <span key={key} className={`countPill ${key}`}>
                {colorLabel(key)}: {value}
              </span>
            ))}
          </div>
        </div>
      </details>
      <div className="proposalToolbar" aria-label="Фильтры color proposals">
        <label>
          <span>Найти GEO, действие или правило</span>
          <input
            suppressHydrationWarning
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="например: ER, CHANGE_RED_TO_YELLOW"
          />
        </label>
        <label>
          <span>Proposal action</span>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            {actionOptions.map((option) => (
              <option key={option} value={option}>
                {option === "ALL" ? "Все действия" : option}
              </option>
            ))}
          </select>
        </label>
        <strong>
          Показано {visibleRows.length} / {proposals.proposals.length}
        </strong>
      </div>
      <div className="tableWrap proposalTableWrap">
        <table className="truthTable" data-testid="wiki-truth-color-proposals-table">
          <thead>
            <tr>
              <th>GEO</th>
              <th>Территория</th>
              <th>Текущий цвет</th>
              <th>Предложение</th>
              <th>Truth color</th>
              <th>Truth rule</th>
              <th>Evidence coverage</th>
              <th>Причина</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.geo}
                data-geo={row.geo}
                data-proposal-action={row.proposalAction}
                data-current-color={row.currentColor}
                data-truth-color={row.proposedTruthColor}
              >
                <td className="colGeo">{row.geo}</td>
                <td className="colCountry">{row.territory}</td>
                <td className="colStatus">
                  <strong>{colorLabel(row.currentColor)}</strong>
                  <small>{row.currentSource}</small>
                </td>
                <td className="colMeta">
                  <strong>{row.proposalAction}</strong>
                </td>
                <td className="colStatus">
                  {colorLabel(row.proposedTruthColor)}
                </td>
                <td className="colMeta">{row.truthRule}</td>
                <td className="colMeta">
                  {ruAuditValue(row.effectiveSourceCoverage)}
                </td>
                <td className="colNotes">
                  <span>{row.proposalRationale || row.truthReason}</span>
                  <details>
                    <summary>Техническая причина текущего цвета</summary>
                    <span>{row.currentReason || "—"}</span>
                    <span>{row.truthReason || "—"}</span>
                  </details>
                </td>
              </tr>
            ))}
            {!visibleRows.length ? (
              <tr>
                <td colSpan={8}>Предложений по выбранным фильтрам нет.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <style jsx>{`
        .colorProposals {
          margin-top: 28px;
        }
        .hardRule {
          border: 1px solid #b45309;
          background: #fffbeb;
          color: #78350f;
          border-radius: 8px;
          padding: 12px;
        }
        .proposalCounters {
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
        .proposalCounts {
          margin: 14px 0;
          border: 1px solid #cbd5e1;
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
        .countPill.GREEN {
          background: #dcfce7;
          color: #166534;
        }
        .countPill.YELLOW {
          background: #fef3c7;
          color: #92400e;
        }
        .countPill.RED {
          background: #fee2e2;
          color: #991b1b;
        }
        .proposalToolbar {
          position: sticky;
          top: 0;
          z-index: 12;
          display: grid;
          grid-template-columns: minmax(220px, 1fr) minmax(220px, 360px) auto;
          align-items: end;
          gap: 12px;
          margin: 14px 0;
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: rgba(248, 250, 252, 0.98);
        }
        .proposalToolbar label {
          display: grid;
          gap: 5px;
          font-size: 12px;
          color: #475569;
        }
        .proposalToolbar input,
        .proposalToolbar select {
          min-height: 38px;
          border: 1px solid #94a3b8;
          border-radius: 7px;
          background: #fff;
          padding: 7px 9px;
          color: #0f172a;
        }
        .proposalTableWrap {
          overflow: auto;
          width: min(100%, calc(100vw - 64px));
          max-width: 100%;
          max-height: 78vh;
        }
        .proposalTableWrap table {
          width: max-content;
          min-width: 1800px;
        }
        .proposalTableWrap small,
        .proposalTableWrap span {
          display: block;
        }
        @media (max-width: 900px) {
          .proposalToolbar {
            position: static;
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
