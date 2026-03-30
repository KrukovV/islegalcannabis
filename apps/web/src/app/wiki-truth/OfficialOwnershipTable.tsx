"use client";

import { useMemo, useState } from "react";
import type {
  OfficialOwnershipGeoSummaryRow,
  OfficialOwnershipRowView,
  OfficialOwnershipViewModel
} from "@/lib/officialSources/officialOwnershipView";

function renderGeoList(row: OfficialOwnershipRowView) {
  if (!row.assignedGeoCodes.length) return "—";
  return row.assignedGeoCodes.map((geo, index) => `${geo} ${row.assignedGeoNames[index] || ""}`.trim()).join(", ");
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

function filterRows(rows: OfficialOwnershipRowView[], mode: string, search: string) {
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (mode === "effective" && !row.isEffective) return false;
    if (mode === "strong" && row.ownershipQuality !== "STRONG_OFFICIAL") return false;
    if (mode === "weak" && row.ownershipQuality !== "WEAK_OFFICIAL") return false;
    if (mode === "global" && row.ownershipQuality !== "GLOBAL_FALLBACK") return false;
    if (mode === "unknown" && row.ownershipType !== "unknown") return false;
    if (mode === "filtered" && row.exclusionReason === "none") return false;
    if (mode === "country" && row.ownershipType !== "country") return false;
    if (mode === "state" && row.ownershipType !== "state") return false;
    if (mode === "multi" && !["multi_geo", "global"].includes(row.ownershipType)) return false;
    if (!needle) return true;
    const haystack = [
      row.domain,
      row.url,
      row.ownershipType,
      row.assignedGeoCodes.join(" "),
      row.assignedGeoNames.join(" "),
      row.notes
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

function filterGeoRows(rows: OfficialOwnershipGeoSummaryRow[], search: string) {
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (!needle) return true;
    return [row.geo, row.country, row.linkDomains.join(" "), row.representativeLinks.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

export default function OfficialOwnershipTable({ view }: { view: OfficialOwnershipViewModel }) {
  const [mode, setMode] = useState("all");
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => filterRows(view.rows, mode, search), [view.rows, mode, search]);
  const filteredGeoRows = useMemo(() => filterGeoRows(view.geoSummaryRows, search), [view.geoSummaryRows, search]);

  return (
    <section className="sectionCard" data-testid="official-ownership-view">
      <h2>Official ownership table</h2>
      <p className="sectionHint">
        Full SSOT explainability layer for all protected official registry rows. This view shows where each raw link was
        assigned, filtered, or left unresolved.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <label>
          Filter{" "}
          <select value={mode} onChange={(event) => setMode(event.target.value)} data-testid="official-ownership-filter">
            <option value="all">All rows</option>
            <option value="effective">Only effective</option>
            <option value="strong">Only strong</option>
            <option value="weak">Only weak</option>
            <option value="global">Only global fallback</option>
            <option value="unknown">Only unknown</option>
            <option value="filtered">Only banned/filtered</option>
            <option value="country">Country assigned</option>
            <option value="state">State assigned</option>
            <option value="multi">Multi-geo / global</option>
          </select>
        </label>
        <label>
          Search{" "}
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="domain, ISO, country"
            data-testid="official-ownership-search"
          />
        </label>
        <span className="sectionHint">Visible rows: {filteredRows.length}</span>
      </div>

      <h3 style={{ marginTop: 0 }}>Effective assigned official links</h3>
      <div className="tableWrap">
        <table className="truthTable" data-testid="official-ownership-effective-table">
          <thead>
            <tr>
              <th>Registry ID</th>
              <th>Domain</th>
              <th>URL</th>
              <th>Ownership type</th>
              <th>Source type</th>
              <th>Registry state</th>
              <th>Source scope</th>
              <th>Ownership quality</th>
              <th>Ownership basis</th>
              <th>Assigned geo</th>
              <th>Effective</th>
              <th>Exclusion reason</th>
            </tr>
          </thead>
          <tbody>
            {view.effectiveAssignedRows.map((row) => (
              <tr key={`effective-${row.registryId}`}>
                <td>{row.registryId}</td>
                <td>{row.domain}</td>
                <td className="colUrl"><a href={`https://${row.url}`} target="_blank" rel="noreferrer noopener" className="link">{row.url}</a></td>
                <td>{row.ownershipType}</td>
                <td>{row.registrySourceType}</td>
                <td>{row.registryState}</td>
                <td>{row.sourceScope}</td>
                <td>{row.ownershipQuality}</td>
                <td>{row.ownershipBasis}</td>
                <td>{renderGeoList(row)}</td>
                <td>{row.isEffective ? "yes" : "no"}</td>
                <td>{row.exclusionReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Unknown ownership / unresolved</h3>
      <div className="tableWrap">
        <table className="truthTable" data-testid="official-ownership-unknown-table">
          <thead>
            <tr>
              <th>Registry ID</th>
              <th>Domain</th>
              <th>URL</th>
              <th>Ownership type</th>
              <th>Source type</th>
              <th>Registry state</th>
              <th>Source scope</th>
              <th>Ownership quality</th>
              <th>Ownership basis</th>
              <th>Assigned geo</th>
              <th>Effective</th>
              <th>Exclusion reason</th>
            </tr>
          </thead>
          <tbody>
            {view.unknownRows.map((row) => (
              <tr key={`unknown-${row.registryId}`}>
                <td>{row.registryId}</td>
                <td>{row.domain}</td>
                <td className="colUrl">{row.url}</td>
                <td>{row.ownershipType}</td>
                <td>{row.registrySourceType}</td>
                <td>{row.registryState}</td>
                <td>{row.sourceScope}</td>
                <td>{row.ownershipQuality}</td>
                <td>{row.ownershipBasis}</td>
                <td>{renderGeoList(row)}</td>
                <td>{row.isEffective ? "yes" : "no"}</td>
                <td>{row.exclusionReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Filtered but protected registry links</h3>
      <div className="tableWrap">
        <table className="truthTable" data-testid="official-ownership-filtered-table">
          <thead>
            <tr>
              <th>Registry ID</th>
              <th>Domain</th>
              <th>URL</th>
              <th>Ownership type</th>
              <th>Source type</th>
              <th>Registry state</th>
              <th>Source scope</th>
              <th>Ownership quality</th>
              <th>Ownership basis</th>
              <th>Assigned geo</th>
              <th>Effective</th>
              <th>Exclusion reason</th>
            </tr>
          </thead>
          <tbody>
            {view.filteredRows.map((row) => (
              <tr key={`filtered-${row.registryId}`}>
                <td>{row.registryId}</td>
                <td>{row.domain}</td>
                <td className="colUrl">{row.url}</td>
                <td>{row.ownershipType}</td>
                <td>{row.registrySourceType}</td>
                <td>{row.registryState}</td>
                <td>{row.sourceScope}</td>
                <td>{row.ownershipQuality}</td>
                <td>{row.ownershipBasis}</td>
                <td>{renderGeoList(row)}</td>
                <td>{row.isEffective ? "yes" : "no"}</td>
                <td>{row.exclusionReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Global regulatory references</h3>
      <p className="sectionHint">Visible for explainability, excluded from country-level official coverage and truth-table Official=yes.</p>
      <div className="tableWrap">
        <table className="truthTable" data-testid="official-ownership-global-table">
          <thead>
            <tr>
              <th>Registry ID</th>
              <th>Domain</th>
              <th>URL</th>
              <th>Ownership type</th>
              <th>Source type</th>
              <th>Registry state</th>
              <th>Source scope</th>
              <th>Ownership quality</th>
              <th>Ownership basis</th>
              <th>Assigned geo</th>
              <th>Effective</th>
              <th>Exclusion reason</th>
            </tr>
          </thead>
          <tbody>
            {view.globalRows.map((row) => (
              <tr key={`global-${row.registryId}`}>
                <td>{row.registryId}</td>
                <td>{row.domain}</td>
                <td className="colUrl">{row.url}</td>
                <td>{row.ownershipType}</td>
                <td>{row.registrySourceType}</td>
                <td>{row.registryState}</td>
                <td>{row.sourceScope}</td>
                <td>{row.ownershipQuality}</td>
                <td>{row.ownershipBasis}</td>
                <td>{renderGeoList(row)}</td>
                <td>{row.isEffective ? "yes" : "no"}</td>
                <td>{row.exclusionReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Geo → official links</h3>
      <div className="tableWrap">
        <table className="truthTable" data-testid="official-ownership-geo-summary">
          <thead>
            <tr>
              <th>ISO2/Geo</th>
              <th>Country</th>
              <th>Official links assigned count</th>
              <th>Effective official links count</th>
              <th>Link domains</th>
              <th>Representative links</th>
            </tr>
          </thead>
          <tbody>
            {filteredGeoRows.map((row) => (
              <tr key={`geo-${row.geo}`}>
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

      <h3>All protected registry rows</h3>
      <div className="tableWrap">
        <table className="truthTable" data-testid="official-ownership-raw-table">
          <thead>
            <tr>
              <th>Registry ID</th>
              <th>Domain</th>
              <th>URL</th>
              <th>Ownership type</th>
              <th>Source type</th>
              <th>Registry state</th>
              <th>Source scope</th>
              <th>Ownership quality</th>
              <th>Ownership basis</th>
              <th>Assigned geo</th>
              <th>Effective</th>
              <th>Exclusion reason</th>
              <th>Protected registry</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={`raw-${row.registryId}`}>
                <td>{row.registryId}</td>
                <td>{row.domain}</td>
                <td className="colUrl">{row.url}</td>
                <td>{row.ownershipType}</td>
                <td>{row.registrySourceType}</td>
                <td>{row.registryState}</td>
                <td>{row.sourceScope}</td>
                <td>{row.ownershipQuality}</td>
                <td>{row.ownershipBasis}</td>
                <td>{renderGeoList(row)}</td>
                <td>{row.isEffective ? "yes" : "no"}</td>
                <td>{row.exclusionReason}</td>
                <td>{row.isProtectedRegistryEntry ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
