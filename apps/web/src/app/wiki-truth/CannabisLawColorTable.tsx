"use client";

import { useMemo, useState } from "react";
import type {
  WikiTruthColorComparisonRow,
  WikiTruthColorValue,
} from "@/lib/wikiTruthColorComparison";

function ColorCell({ value }: { value: WikiTruthColorValue }) {
  return (
    <div className="colorValue">
      <span
        className="colorSwatch"
        style={{ background: value.color }}
        aria-hidden="true"
      />
      <span>
        <strong>{value.label}</strong>
        <small>{value.color}</small>
      </span>
    </div>
  );
}

export default function CannabisLawColorTable({
  rows,
}: {
  rows: WikiTruthColorComparisonRow[];
}) {
  const [query, setQuery] = useState("");
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const currentGreyCount = rows.filter(
    (row) => row.current.category === "UNKNOWN",
  ).length;
  const officialGreyCount = rows.filter(
    (row) => row.official.category === "UNKNOWN",
  ).length;
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesQuery =
          !normalizedQuery ||
          `${row.geo} ${row.territory}`
            .toLocaleLowerCase()
            .includes(normalizedQuery);
        return matchesQuery && (!differencesOnly || row.differs);
      }),
    [differencesOnly, normalizedQuery, rows],
  );

  return (
    <section
      className="sectionCard"
      data-testid="cannabis-law-color-comparison"
      data-current-grey-count={currentGreyCount}
      data-official-grey-count={officialGreyCount}
    >
      <h2>Цвет карты: текущий и подтверждённый официальным законом</h2>
      <p className="sectionHint">
        Текущий цвет взят из итогового 307-строчного снимка рендера — того же
        набора данных, из которого фактически красится карта после применения
        данных страниц стран и штатов. Правовой цвет независимо рассчитан по
        вручную проверенному официальному статусу. У семи GEO без статуса
        проекта фактический снимок рендера не окрашивает территорию; остальные 300 строк
        имеют реальный зелёный, жёлтый или красный цвет карты, а для спорных
        территорий возвращается отсутствие цвета.
      </p>
      <div className="colorToolbar">
        <label>
          <span>Найти территорию</span>
          <input
            suppressHydrationWarning
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="например: BF, Maine"
          />
        </label>
        <label className="checkLabel">
          <input
            suppressHydrationWarning
            type="checkbox"
            checked={differencesOnly}
            onChange={(event) => setDifferencesOnly(event.target.checked)}
          />
          <span>Только несовпадающие цвета</span>
        </label>
        <strong>
          Показано {visibleRows.length} / {rows.length}
        </strong>
      </div>
      <div className="tableWrap colorTableWrap">
        <table className="truthTable" data-testid="cannabis-law-color-table">
          <thead>
            <tr>
              <th>Территория / страна</th>
              <th>Текущий цвет на карте</th>
              <th>Цвет по официальному закону</th>
              <th>Комментарий по цветам (честный audit)</th>
              <th>Wiki vs SSOT</th>
              <th>Примечание Wiki-аудита</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.geo}
                data-geo={row.geo}
                data-color-diff={row.differs ? "1" : "0"}
                data-current-color={row.current.category}
                data-current-label={row.current.label}
                data-official-color={row.official.category}
                data-reaudit-result={row.reauditResult || "NOT_REAUDITED"}
                data-wiki-mismatch={row.wikiMismatchStatus}
              >
                <td>
                  <strong>{row.territory}</strong>
                  <small className="geoCode">{row.geo}</small>
                </td>
                <td>
                  <ColorCell value={row.current} />
                </td>
                <td>
                  <ColorCell value={row.official} />
                </td>
                <td className="colorComment">
                  <span>{row.comment}</span>
                  <details>
                    <summary>Техническая сверка осей</summary>
                    <span>{row.projectStatusSummary}</span>
                    <span>{row.officialStatusSummary}</span>
                    <span>{row.differenceReason}</span>
                    {row.reauditReason ? (
                      <span>Повторная проверка: {row.reauditReason}</span>
                    ) : null}
                    <span>{row.revalidationAuditSummary}</span>
                  </details>
                </td>
                <td>
                  <strong>{row.wikiMismatchStatusLabel}</strong>
                  <small>{row.wikiMismatchStatus}</small>
                </td>
                <td>{row.wikiMismatchReason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
