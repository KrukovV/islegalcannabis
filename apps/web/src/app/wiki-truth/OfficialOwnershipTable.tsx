"use client";

import { useMemo, useState } from "react";
import type {
  OfficialOwnershipGeoSummaryRow,
  OfficialOwnershipRowView,
  OfficialOwnershipViewModel,
} from "@/lib/officialSources/officialOwnershipView";
import { ruAuditValue, ruBoolean } from "./wikiTruthRu";

function renderGeoList(row: OfficialOwnershipRowView) {
  if (!row.assignedGeoCodes.length) return "—";
  return row.assignedGeoCodes
    .map((geo, index) => `${geo} ${row.assignedGeoNames[index] || ""}`.trim())
    .join(", ");
}

function renderLinkList(values: string[]) {
  if (!values.length) return "—";
  return (
    <div className="linkList">
      {values.map((value) => (
        <span key={value}>{value}</span>
      ))}
    </div>
  );
}

function filterRows(
  rows: OfficialOwnershipRowView[],
  mode: string,
  search: string,
) {
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (mode === "effective" && !row.isEffective) return false;
    if (mode === "strong" && row.ownershipQuality !== "STRONG_OFFICIAL")
      return false;
    if (mode === "weak" && row.ownershipQuality !== "WEAK_OFFICIAL")
      return false;
    if (mode === "global" && row.ownershipQuality !== "GLOBAL_FALLBACK")
      return false;
    if (mode === "unknown" && row.ownershipType !== "unknown") return false;
    if (mode === "filtered" && row.exclusionReason === "none") return false;
    if (mode === "country" && row.ownershipType !== "country") return false;
    if (mode === "state" && row.ownershipType !== "state") return false;
    if (
      mode === "multi" &&
      !["multi_geo", "global"].includes(row.ownershipType)
    )
      return false;
    if (!needle) return true;
    return [
      row.domain,
      row.url,
      row.ownershipType,
      row.assignedGeoCodes.join(" "),
      row.assignedGeoNames.join(" "),
      row.notes,
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

function filterGeoRows(rows: OfficialOwnershipGeoSummaryRow[], search: string) {
  const needle = search.trim().toLowerCase();
  return rows.filter(
    (row) =>
      !needle ||
      [
        row.geo,
        row.country,
        row.linkDomains.join(" "),
        row.representativeLinks.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
  );
}

export default function OfficialOwnershipTable({
  view,
}: {
  view: OfficialOwnershipViewModel;
}) {
  const [mode, setMode] = useState("all");
  const [search, setSearch] = useState("");
  const filteredRows = useMemo(
    () => filterRows(view.rows, mode, search),
    [view.rows, mode, search],
  );
  const filteredGeoRows = useMemo(
    () => filterGeoRows(view.geoSummaryRows, search),
    [view.geoSummaryRows, search],
  );

  return (
    <section className="sectionCard" data-testid="official-ownership-view">
      <h2>Владение официальными ссылками</h2>
      <p className="sectionHint">
        Единый реестр заменяет четыре повторявших друг друга среза. Фильтр
        показывает эффективные, слабые, глобальные, исключённые и неразрешённые
        строки без повторной публикации тех же записей.
      </p>
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <label>
          Фильтр{" "}
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            data-testid="official-ownership-filter"
          >
            <option value="all">Все строки</option>
            <option value="effective">Только эффективные</option>
            <option value="strong">Только сильные</option>
            <option value="weak">Только слабые</option>
            <option value="global">Только глобальные резервные</option>
            <option value="unknown">Только неразрешённые</option>
            <option value="filtered">Только исключённые</option>
            <option value="country">Назначенные странам</option>
            <option value="state">Назначенные штатам</option>
            <option value="multi">Несколько GEO / глобальные</option>
          </select>
        </label>
        <label>
          Поиск{" "}
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="домен, ISO, страна"
            className="ym-disable-keys"
            data-testid="official-ownership-search"
          />
        </label>
        <span className="sectionHint">
          Показано строк: {filteredRows.length}
        </span>
      </div>

      <h3 style={{ marginTop: 0 }}>Единый защищённый реестр</h3>
      <div className="tableWrap">
        <table
          className="truthTable"
          data-testid="official-ownership-registry-table"
        >
          <thead>
            <tr>
              <th>ID реестра</th>
              <th>Домен</th>
              <th>URL</th>
              <th>Тип владения</th>
              <th>Тип источника</th>
              <th>Состояние реестра</th>
              <th>Область источника</th>
              <th>Качество владения</th>
              <th>Основание владения</th>
              <th>Назначенные GEO</th>
              <th>Эффективна</th>
              <th>Причина исключения</th>
              <th>Защищённая строка</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.registryId}>
                <td>{row.registryId}</td>
                <td>{row.domain}</td>
                <td className="colUrl">
                  <a
                    href={`https://${row.url}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="link"
                  >
                    {row.url}
                  </a>
                </td>
                <td>{ruAuditValue(row.ownershipType)}</td>
                <td>{ruAuditValue(row.registrySourceType)}</td>
                <td>{ruAuditValue(row.registryState)}</td>
                <td>{ruAuditValue(row.sourceScope)}</td>
                <td>{ruAuditValue(row.ownershipQuality)}</td>
                <td>{ruAuditValue(row.ownershipBasis)}</td>
                <td>{renderGeoList(row)}</td>
                <td>{ruBoolean(row.isEffective)}</td>
                <td>{ruAuditValue(row.exclusionReason)}</td>
                <td>{ruBoolean(row.isProtectedRegistryEntry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>GEO → официальные ссылки</h3>
      <p className="sectionHint">
        Отдельная агрегация по GEO, а не копия строк реестра.
      </p>
      <div className="tableWrap">
        <table
          className="truthTable"
          data-testid="official-ownership-geo-summary"
        >
          <thead>
            <tr>
              <th>ISO2/GEO</th>
              <th>Страна</th>
              <th>Назначено ссылок</th>
              <th>Эффективных ссылок</th>
              <th>Домены</th>
              <th>Примеры ссылок</th>
            </tr>
          </thead>
          <tbody>
            {filteredGeoRows.map((row) => (
              <tr key={row.geo}>
                <td>{row.geo}</td>
                <td>{row.country}</td>
                <td>{row.assignedCount}</td>
                <td>{row.effectiveCount}</td>
                <td>{renderLinkList(row.linkDomains)}</td>
                <td>{renderLinkList(row.representativeLinks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
