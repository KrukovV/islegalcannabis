"use client";

import type { WikiTruthFinalReconciliationView } from "@/lib/wikiTruthFinalReconciliation";
import type { TruthMapDatasetMeta } from "@/truth-map/truthMapSource";

function entries(counts: Record<string, number>) {
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
}

export default function CannabisLawFinalReconciliation({
  reconciliation,
  truthMapDisplay,
}: {
  reconciliation: WikiTruthFinalReconciliationView;
  truthMapDisplay: TruthMapDatasetMeta;
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
      data-canonical-truth-schema={
        reconciliation.acceptance.flags.canonicalTruthResultSchemaComplete
          ? "1"
          : "0"
      }
      data-no-mutation={reconciliation.noMutationProof.unchanged ? "1" : "0"}
      data-human-summary-ready="1"
      data-truth-red={reconciliation.counts.truthColors.RED || 0}
      data-truth-yellow={reconciliation.counts.truthColors.YELLOW || 0}
      data-truth-green={reconciliation.counts.truthColors.GREEN || 0}
      data-truth-unknown={reconciliation.counts.truthColors.UNKNOWN || 0}
      data-display-uncolored={truthMapDisplay.displayUncoloredGeos.length}
      data-display-grey-geos={truthMapDisplay.displayGreyGeos.join(",")}
      data-display-nonpolar-grey={truthMapDisplay.displayNonPolarGreyGeos.length}
    >
      <h2>
        {reconciliation.acceptance.complete
          ? "Итоговая сверка Truth-First"
          : "Текущая сверка Truth-First"}
        : {reconciliation.rowsTotal}/
        {reconciliation.rowsExpected} GEO
      </h2>
      <p className="sectionHint">
        Текущий вывод является локальным предложением, построенным функцией{" "}
        <code>{reconciliation.deterministicColorFunction}</code>. Wikipedia и
        SSOT показаны только как независимые объекты сравнения. Исторические
        снимки и производные статусы не заменяют live-proof карты или полную
        независимую юридическую проверку.
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
      <p className="sectionHint">
        {reconciliation.acceptance.complete
          ? "Все обязательные юридические условия закрыты."
          : "Применение заблокировано: итоговая сверка ещё не заменяет текущие SSOT, карту, popup или SEO."}
      </p>
      <div className="boundaryGrid finalCounters">
        {entries(reconciliation.counts.truthColors).map(([key, value]) => (
          <div key={key}>
            <strong>{key}</strong>
            <div>{value}</div>
          </div>
        ))}
        {entries(reconciliation.counts.truthConfidence || {}).map(([key, value]) => (
          <div key={`confidence-${key}`}>
            <strong>Доказательность: {key}</strong>
            <div>{value}</div>
          </div>
        ))}
        <div>
          <strong>Изменили цвет</strong>
          <div>{reconciliation.changes.length}</div>
        </div>
        <div>
          <strong>Юридический UNKNOWN</strong>
          <div>{reconciliation.unknownRows.length}</div>
        </div>
        <div>
          <strong>Расхождения слоёв (только proposal)</strong>
          <div>{reconciliation.acceptance.crossLayerConflictRows.length}</div>
        </div>
        <div>
          <strong>Зелёных без operational proof</strong>
          <div>{reconciliation.acceptance.unprovenGreenRows.length}</div>
        </div>
        <div>
          <strong>Защищённые файлы не изменены</strong>
          <div>{reconciliation.noMutationProof.unchanged ? "ДА" : "НЕТ"}</div>
        </div>
        <div>
          <strong>Схема canonical truth</strong>
          <div>
            {reconciliation.acceptance.flags.canonicalTruthResultSchemaComplete
              ? "307/307 явная"
              : "НЕПОЛНАЯ"}
          </div>
        </div>
        {Object.entries(reconciliation.counts.applyStates || {}).map(([state, value]) => (
          <div key={state}>
            <strong>{state}</strong>
            <div>{value}</div>
          </div>
        ))}
      </div>
      <aside className="mapDisplayProjection" data-testid="wiki-truth-map-display">
        <h3>Карта /truth-map: отдельный display-слой</h3>
        <p>
          Юридический вывод остаётся в счётчиках выше. Display-цвет не меняет
          legal truth: неполярный <code>UNKNOWN</code> показан как направление
          исследования, а <code>GRAY</code> разрешён только для полярного GEO
          из policy.
        </p>
        <div className="boundaryGrid finalCounters">
          {entries(truthMapDisplay.displayColors).map(([key, value]) => (
            <div key={`display-${key}`}>
              <strong>Display {key}</strong>
              <div>{value}</div>
            </div>
          ))}
          <div>
            <strong>Незакрашенные GEO</strong>
            <div>{truthMapDisplay.displayUncoloredGeos.length}</div>
          </div>
          <div>
            <strong>Серые GEO</strong>
            <div>{truthMapDisplay.displayGreyGeos.join(", ") || "—"}</div>
          </div>
          <div>
            <strong>Серые неполярные GEO</strong>
            <div>{truthMapDisplay.displayNonPolarGreyGeos.length}</div>
          </div>
          <div>
            <strong>Геометрия display-слоя</strong>
            <div>{truthMapDisplay.rowsWithGeometry}/{truthMapDisplay.rowsTotal}</div>
          </div>
        </div>
      </aside>
      <details>
        <summary>Технические правила общей юридической модели</summary>
        <ul>
          {reconciliation.ruleEngineCorrections.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Технические счётчики ложных цветовых классов</summary>
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
      <details>
        <summary>Изменения цвета и исходный закон — audit trail</summary>
        <div className="tableWrap finalTableWrap">
          <table className="truthTable">
            <thead>
              <tr>
                <th>GEO</th>
                <th>Было</th>
                <th>Итог</th>
                <th>Технический класс</th>
                <th>Правило</th>
                <th>Уверенность</th>
                <th>Состояние применения</th>
                <th>Причина</th>
                <th>Исходный закон</th>
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
                  <td>{row.truthConfidence || "НЕ ПОДТВЕРЖДЕНО"}</td>
                  <td>{row.applyState || "ЗАБЛОКИРОВАНО"}</td>
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
                  <td colSpan={9}>Изменений цвета нет.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary>
          Полный технический manifest: {reconciliation.rows.length} GEO
        </summary>
        <div className="tableWrap finalTableWrap">
          <table className="truthTable">
            <thead>
              <tr>
                <th>GEO</th>
                <th>Территория</th>
                <th>Итоговый цвет</th>
                <th>Правило</th>
                <th>Уверенность</th>
                <th>Состояние применения</th>
                <th>Wiki-аудит</th>
                <th>SSOT-аудит</th>
                <th>Расхождение слоёв</th>
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
                  <td>{row.truthConfidence || "НЕ ПОДТВЕРЖДЕНО"}</td>
                  <td>{row.applyState || "ЗАБЛОКИРОВАНО"}</td>
                  <td>{row.wikipedia?.status || "НЕ ПОДТВЕРЖДЕНО"}</td>
                  <td>{row.ssot?.status || "НЕ ПОДТВЕРЖДЕНО"}</td>
                  <td>{row.layerConflict ? "ДА" : "НЕТ"}</td>
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
        .mapDisplayProjection {
          margin: 16px 0;
          border: 1px solid #64748b;
          border-radius: 10px;
          background: #f8fafc;
          padding: 14px;
        }
        .mapDisplayProjection h3 {
          margin: 0 0 8px;
          font-size: 16px;
        }
        .mapDisplayProjection p {
          margin: 0 0 12px;
          color: #334155;
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
