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
    >
      <h2>Цвет карты: текущий и подтверждённый официальным законом</h2>
      <p className="sectionHint">
        Текущий цвет взят из фактического Status Engine карты. Правовой цвет
        рассчитан по вручную проверенному официальному статусу теми же
        правилами: зелёный, жёлтый или красный. Серый означает, что прямого
        официального статуса недостаточно для честного вывода.
      </p>
      <div className="colorToolbar">
        <label>
          <span>Найти территорию</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="например: BF, Maine"
          />
        </label>
        <label className="checkLabel">
          <input
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
              <th>Комментарий по цветам</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.geo}
                data-geo={row.geo}
                data-color-diff={row.differs ? "1" : "0"}
                data-current-color={row.current.category}
                data-official-color={row.official.category}
                data-reaudit-result={row.reauditResult || "NOT_REAUDITED"}
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
                <td className="colorComment">{row.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
