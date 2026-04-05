"use client";

import type { WikiTruthAuditModel, WikiTruthAuditRow } from "@/lib/wikiTruthAudit";
import OfficialOwnershipSummary from "./OfficialOwnershipSummary";
import OfficialOwnershipTable from "./OfficialOwnershipTable";

function renderLinks(items: Array<{ url?: string; title?: string; isOfficial?: boolean }>) {
  if (!items.length) return "-";
  return (
    <div className="linkList">
      {items.map((item) => {
        const href = item.url || "";
        const label = item.title || item.url || "-";
        return href ? (
          <a key={`${href}-${label}`} href={href} target="_blank" rel="noreferrer noopener" className="link">
            <span>{label}{item.isOfficial ? " OFFICIAL" : ""}</span>
            {label !== href ? <span style={{ display: "block", fontSize: 11, color: "#6b7280" }}>{href}</span> : null}
          </a>
        ) : (
          <span key={label}>{label}</span>
        );
      })}
    </div>
  );
}

function renderOfficialSignal(row: WikiTruthAuditRow) {
  if (row.officialSignal === "strong") return "yes (strong)";
  if (row.officialSignal === "weak") return "yes (weak)";
  if (row.officialSignal === "fallback") return "fallback only";
  return "no";
}

function renderFlags(flags: string[]) {
  if (!flags.length) return "-";
  return (
    <div className="flagList">
      {flags.map((flag) => (
        <span key={flag} className="flagPill">
          {flag}
        </span>
      ))}
    </div>
  );
}

function Row({ row }: { row: WikiTruthAuditRow }) {
  return (
    <tr
      data-geo={row.geoKey}
      data-final-rec={row.finalRec}
      data-final-med={row.finalMed}
      data-final-map-category={row.finalMapCategory}
      data-truth-source-label={row.truthSourceLabel}
      data-status-override-reason={row.statusOverrideReason}
      data-snapshot-id={row.snapshotId}
      data-rule-id={row.ruleId}
      data-evidence-delta-approved={row.evidenceDeltaApproved ? "1" : "0"}
    >
      <td className="stickyCol1 stickyCell colGeo">{row.geoKey}</td>
      <td className="stickyCol2 stickyCell colCountry">{row.country}</td>
      <td className="colStatus">{row.wikiStatus}</td>
      <td className="colStatus">{row.finalStatus}</td>
      <td className="colMeta">{row.truthSourceLabel}</td>
      <td className="colMeta">{row.statusOverrideReason}</td>
      <td className="colMeta">{row.snapshotId}</td>
      <td className="colDelta">{row.delta}</td>
      <td className="colMeta">{row.ruleId}</td>
      <td className="colMeta">{row.evidenceDeltaApproved ? "yes" : "no"}</td>
      <td className="colUrl">
        {row.wikiPageUrl !== "-" ? (
          <a href={row.wikiPageUrl} target="_blank" rel="noreferrer noopener" className="link">
            {row.wikiPageUrl}
          </a>
        ) : (
          "-"
        )}
      </td>
      <td className="colLinks">{renderLinks(row.sources)}</td>
      <td className="colLinks">{renderLinks(row.officialSources)}</td>
      <td className="colMeta">{row.evidenceDelta}</td>
      <td className="colMeta">{row.evidenceSourceType}</td>
      <td className="colNotes">{row.triggerPhraseExcerpt}</td>
      <td className="colNotes">{row.contextNote}</td>
      <td className="colNotes">{row.enforcementNote}</td>
      <td className="colNotes">{row.socialRealityNote}</td>
      <td className="colNotes">{row.notesText}</td>
      <td className="colFlags">{renderFlags(row.flags)}</td>
    </tr>
  );
}

export default function WikiTruthTable({ audit }: { audit: WikiTruthAuditModel }) {
  const wikiCoverage = audit.summaryCards.find((card) => card.id === "WIKI_COUNTRIES");
  const isoCoverage = audit.summaryCards.find((card) => card.id === "ISO_COUNTRIES");
  const refCoverage = audit.summaryCards.find((card) => card.id === "REF_SSOT");
  const statesCoverage = audit.summaryCards.find((card) => card.id === "US_STATES");
  const officialRegistry = audit.summaryCards.find((card) => card.id === "OFFICIAL_REGISTRY");
  const officialGeoCoverage = audit.summaryCards.find((card) => card.id === "OFFICIAL_GEO_COVERAGE");
  const diagnosticsCoverage = audit.summaryCards.find((card) => card.id === "DIAGNOSTICS");

  return (
    <div className="auditView">
      <section className="cards" data-testid="wiki-truth-summary">
        {audit.summaryCards.map((card) => (
          <article key={card.id} className="card" data-testid={`summary-${card.id.toLowerCase()}`}>
            <h2>{card.title}</h2>
            <div className="numbers">
              <strong>
                {card.covered} / {card.total}
              </strong>
              <span>missing: {card.missing}</span>
            </div>
            <div className="meta">SSOT: {card.sourceOfTruth}</div>
            <div className="meta">Rule: {card.inclusionRule}</div>
          </article>
        ))}
      </section>

      <section className="issueBar" data-testid="wiki-truth-issues">
        <span>STATUS_MISMATCH: {audit.issueCounters.statusMismatch}</span>
        <span>NO_FINAL_ROW: {audit.issueCounters.noOurRow}</span>
        <span>OFFICIAL_SOURCES_MISSING: {audit.issueCounters.officialSourcesMissing}</span>
        <span>SOURCES_MISSING: {audit.issueCounters.sourcesMissing}</span>
        <span>WIKI_NOTES_MISSING: {audit.issueCounters.wikiNotesMissing}</span>
      </section>

      <section className="sectionCard">
        <h2>Audit universe boundaries</h2>
        <div className="boundaryGrid">
          <div>
            <strong>Wiki country coverage</strong>
            <div>{wikiCoverage?.sourceOfTruth}</div>
            <div>{wikiCoverage?.inclusionRule}</div>
          </div>
          <div>
            <strong>ISO country audit</strong>
            <div>{isoCoverage?.sourceOfTruth}</div>
            <div>{isoCoverage?.inclusionRule}</div>
          </div>
          <div>
            <strong>SSOT reference coverage</strong>
            <div>{refCoverage?.sourceOfTruth}</div>
            <div>{refCoverage?.inclusionRule}</div>
          </div>
          <div>
            <strong>US states coverage</strong>
            <div>{statesCoverage?.sourceOfTruth}</div>
            <div>{statesCoverage?.inclusionRule}</div>
          </div>
          <div>
            <strong>Official registry</strong>
            <div>{officialRegistry?.sourceOfTruth}</div>
            <div>{officialRegistry?.inclusionRule}</div>
          </div>
          <div>
            <strong>Official geo coverage</strong>
            <div>{officialGeoCoverage?.sourceOfTruth}</div>
            <div>{officialGeoCoverage?.inclusionRule}</div>
          </div>
          <div>
            <strong>Diagnostics</strong>
            <div>{diagnosticsCoverage?.sourceOfTruth}</div>
            <div>{diagnosticsCoverage?.inclusionRule}</div>
          </div>
        </div>
      </section>

      <section className="sectionCard" data-testid="official-ownership-diagnostics">
        <h2>Official ownership diagnostics</h2>
        <div className="boundaryGrid">
          <div>
            <strong>Raw registry total</strong>
            <div>{audit.officialOwnership.rawRegistryTotal}</div>
          </div>
          <div>
            <strong>Effective ownership total</strong>
            <div>{audit.officialOwnership.effectiveRegistryTotal}</div>
          </div>
          <div>
            <strong>Country / state assigned</strong>
            <div>
              {audit.officialOwnership.assignedCountryLinks} / {audit.officialOwnership.assignedStateLinks}
            </div>
          </div>
          <div>
            <strong>Multi-geo / global</strong>
            <div>
              {audit.officialOwnership.assignedMultiGeoLinks} / {audit.officialOwnership.assignedGlobalLinks}
            </div>
          </div>
          <div>
            <strong>Unknown ownership</strong>
            <div>{audit.officialOwnership.unresolvedUnknownLinks}</div>
          </div>
        </div>
        <p className="sectionHint">{audit.officialOwnership.discrepancyExplanation}</p>
      </section>

      <OfficialOwnershipSummary view={audit.officialOwnershipView} />
      <OfficialOwnershipTable view={audit.officialOwnershipView} />

      <section>
        <h2>All countries truth table</h2>
        <p className="sectionHint">
          Normalized SSOT-backed truth rows. This is the primary country truth view; audit mismatches remain a separate
          diagnostics layer below.
        </p>
        <div
          className="tableWrap"
          style={{ overflowX: "auto", width: "min(100%, calc(100vw - 64px))", maxWidth: "100%" }}
        >
          <table className="truthTable" data-testid="wiki-truth-table" style={{ width: "max-content", minWidth: 3200 }}>
            <thead>
              <tr>
                <th className="stickyCol1 colGeo" style={{ whiteSpace: "nowrap" }}>ISO2/Geo</th>
                <th className="stickyCol2 colCountry" style={{ whiteSpace: "nowrap" }}>Country</th>
                <th className="colStatus" style={{ whiteSpace: "nowrap" }}>Rec (Wiki)</th>
                <th className="colStatus" style={{ whiteSpace: "nowrap" }}>Med (Wiki)</th>
                <th className="colStatus" style={{ whiteSpace: "nowrap" }}>Rec (Final)</th>
                <th className="colStatus" style={{ whiteSpace: "nowrap" }}>Med (Final)</th>
                <th className="colMeta" style={{ whiteSpace: "nowrap" }}>Map category</th>
                <th className="colMeta" style={{ whiteSpace: "nowrap" }}>Rule basis</th>
                <th className="colMeta" style={{ whiteSpace: "nowrap" }}>Override reason</th>
                <th className="colMeta" style={{ whiteSpace: "nowrap" }}>Snapshot</th>
                <th className="colDelta" style={{ whiteSpace: "nowrap" }}>Delta</th>
                <th className="colMeta" style={{ whiteSpace: "nowrap" }}>Rule ID</th>
                <th className="colMeta" style={{ whiteSpace: "nowrap" }}>Approved override</th>
                <th className="colLinks" style={{ whiteSpace: "nowrap" }}>Sources</th>
                <th className="colMeta" style={{ whiteSpace: "nowrap" }}>Official</th>
                <th className="colOfficialLinks" style={{ whiteSpace: "nowrap" }}>Official link</th>
                <th className="colMeta" style={{ whiteSpace: "nowrap" }}>Evidence delta</th>
                <th className="colMeta" style={{ whiteSpace: "nowrap" }}>Evidence source</th>
                <th className="colNotes" style={{ whiteSpace: "nowrap" }}>Trigger phrase</th>
                <th className="colNotes" style={{ whiteSpace: "nowrap" }}>Context</th>
                <th className="colNotes" style={{ whiteSpace: "nowrap" }}>Enforcement</th>
                <th className="colNotes" style={{ whiteSpace: "nowrap" }}>Social reality</th>
                <th className="colNotes" style={{ whiteSpace: "nowrap" }}>Normalized notes</th>
                <th className="colMeta" style={{ whiteSpace: "nowrap" }}>NotesLen</th>
                <th className="colMeta" style={{ whiteSpace: "nowrap" }}>NotesQuality</th>
                <th className="colFlags" style={{ whiteSpace: "nowrap" }}>MismatchFlags</th>
              </tr>
            </thead>
            <tbody>
              {audit.allRows.map((row) => (
                <tr
                  key={`truth-${row.geoKey}-${row.country}`}
                  data-geo={row.geoKey}
                  data-final-rec={row.finalRec}
                  data-final-med={row.finalMed}
                  data-final-map-category={row.finalMapCategory}
                  data-truth-source-label={row.truthSourceLabel}
                  data-status-override-reason={row.statusOverrideReason}
                  data-snapshot-id={row.snapshotId}
                  data-rule-id={row.ruleId}
                  data-evidence-delta-approved={row.evidenceDeltaApproved ? "1" : "0"}
                >
                  <td className="stickyCol1 stickyCell colGeo">{row.geoKey}</td>
                  <td className="stickyCol2 stickyCell colCountry">{row.country}</td>
                  <td className="colStatus">{row.wikiRec}</td>
                  <td className="colStatus">{row.wikiMed}</td>
                  <td className="colStatus">{row.finalRec}</td>
                  <td className="colStatus">{row.finalMed}</td>
                  <td className="colMeta">{row.finalMapCategory}</td>
                  <td className="colMeta">{row.truthSourceLabel}</td>
                  <td className="colMeta">{row.statusOverrideReason}</td>
                  <td className="colMeta">{row.snapshotId}</td>
                  <td className="colDelta">{row.delta}</td>
                  <td className="colMeta">{row.ruleId}</td>
                  <td className="colMeta">{row.evidenceDeltaApproved ? "yes" : "no"}</td>
                  <td className="colLinks">{renderLinks(row.sources)}</td>
                  <td className="colMeta">{renderOfficialSignal(row)}</td>
                  <td className="colOfficialLinks">{renderLinks(row.officialSources)}</td>
                  <td className="colMeta">{row.evidenceDelta}</td>
                  <td className="colMeta">{row.evidenceSourceType}</td>
                  <td className="colNotes">{row.triggerPhraseExcerpt}</td>
                  <td className="colNotes">{row.contextNote}</td>
                  <td className="colNotes">{row.enforcementNote}</td>
                  <td className="colNotes">{row.socialRealityNote}</td>
                  <td className="colNotes">{row.notesText}</td>
                  <td className="colMeta">{row.notesLen}</td>
                  <td className="colMeta">{row.notesQuality}</td>
                  <td className="colFlags">{renderFlags(row.mismatchFlags)}</td>
                </tr>
              ))}
              {!audit.allRows.length ? (
                <tr>
                  <td colSpan={26}>No truth rows found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Audit mismatches</h2>
        <p className="sectionHint">
          High-signal mismatches only. Parser leftovers, empty ISO rows and alias-resolution issues stay in diagnostics.
        </p>
        {audit.mainRows.length ? (
          <div className="tableWrap">
            <table className="truthTable" data-testid="wiki-truth-audit-table">
              <thead>
                <tr>
                  <th className="stickyCol1 colGeo">ISO2/Geo</th>
                  <th className="stickyCol2 colCountry">Country</th>
                  <th className="colStatus">Wiki status</th>
                  <th className="colStatus">Final status</th>
                  <th className="colMeta">Rule basis</th>
                  <th className="colMeta">Override reason</th>
                  <th className="colDelta">Delta</th>
                  <th className="colMeta">Rule ID</th>
                  <th className="colMeta">Approved override</th>
                  <th className="colUrl">Wiki page</th>
                  <th className="colLinks">Sources</th>
                  <th className="colOfficialLinks">Official sources</th>
                  <th className="colMeta">Evidence delta</th>
                  <th className="colMeta">Evidence source</th>
                  <th className="colNotes">Trigger phrase</th>
                  <th className="colNotes">Normalized notes</th>
                  <th className="colFlags">Flags</th>
                </tr>
              </thead>
              <tbody>
                {audit.mainRows.map((row) => (
                  <Row key={`${row.geoKey}-${row.country}`} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sectionHint" data-testid="wiki-truth-audit-empty">
            No audit mismatches detected.
          </p>
        )}
      </section>

      <section>
        <h2>ISO country audit</h2>
        <p className="sectionHint">
          This section explains why ISO-country totals differ from wiki country rows. These are expected uncovered
          countries, not garbage rows in the main audit table.
        </p>
        <div className="tableWrap">
          <table className="truthTable" data-testid="missing-coverage-table">
            <thead>
              <tr>
                <th>ISO2</th>
                <th>Country</th>
                <th>Reason</th>
                <th>Expected wiki page</th>
                <th>Source hint</th>
              </tr>
            </thead>
            <tbody>
              {audit.uncoveredCountries.map((row) => (
                <tr key={`missing-${row.geo}`}>
                  <td>{row.geo}</td>
                  <td>{row.name}</td>
                  <td>{row.reason}</td>
                  <td>
                    {row.expectedWikiUrl ? (
                      <div className="linkList">
                        <span>{row.expectedWikiTitle || "-"}</span>
                        <a href={row.expectedWikiUrl} target="_blank" rel="noreferrer noopener" className="link">
                          {row.expectedWikiUrl}
                        </a>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{row.expectedSourceHint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>US states coverage</h2>
        <p className="sectionHint">
          {audit.usStates.covered} / {audit.usStates.total} covered. Missing: {audit.usStates.missing}
        </p>
        {audit.usStates.rows.length ? (
          <div className="tableWrap">
            <table className="truthTable" data-testid="missing-states">
              <thead>
                <tr>
                  <th>Geo</th>
                  <th>Name</th>
                  <th>Reason</th>
                  <th>Source hint</th>
                </tr>
              </thead>
              <tbody>
                {audit.usStates.rows.map((row) => (
                  <tr key={row.geo}>
                    <td>{row.geo}</td>
                    <td>{row.name}</td>
                    <td>{row.missing_reason}</td>
                    <td>{row.expected_source_hint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section>
        <h2>SSOT reference coverage</h2>
        <p className="sectionHint">
          {audit.ssotCoverage.covered} / {audit.ssotCoverage.total} covered. Missing: {audit.ssotCoverage.missing}
        </p>
        {audit.ssotCoverage.rows.length ? (
          <div className="tableWrap">
            <table className="truthTable" data-testid="uncovered-jurisdictions-table">
              <thead>
                <tr>
                  <th>Geo</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Reason</th>
                  <th>Source hint</th>
                </tr>
              </thead>
              <tbody>
                {audit.ssotCoverage.rows.map((row) => (
                  <tr key={`ssot-${row.geo}`}>
                    <td>{row.geo}</td>
                    <td>{row.name}</td>
                    <td>{row.type}</td>
                    <td>{row.reason}</td>
                    <td>{row.expectedSourceHint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <details className="diagnostics" data-testid="wiki-truth-diagnostics">
        <summary>Diagnostics</summary>
        <div className="diagBlock">
          <h3>Garbage rows</h3>
          <div>
            empty_iso={audit.diagnostics.emptyIsoCount} · non_iso={audit.diagnostics.nonIsoCount} · duplicates=
            {audit.diagnostics.duplicateCount}
          </div>
          <ul>
            {audit.diagnostics.garbageRows.map((row) => (
              <li key={`${row.country}-${row.iso2}-${row.reason}`}>
                {row.country} [{row.iso2}] {"->"} {row.reason}
              </li>
            ))}
          </ul>
        </div>
        <div className="diagBlock">
          <h3>Alias diagnostics</h3>
          <div className="tableWrap">
            <table className="truthTable" data-testid="alias-diagnostics-table">
              <thead>
                <tr>
                  <th>ISO2</th>
                  <th>Country</th>
                  <th>Canonical title</th>
                  <th>Wiki alias</th>
                  <th>Expected title</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {audit.diagnostics.unresolvedAliases.map((row) => (
                  <tr key={`alias-${row.geo}`}>
                    <td>{row.geo}</td>
                    <td>{row.country}</td>
                    <td>{row.canonicalTitle || "-"}</td>
                    <td>{row.wikiAliasTitle || "-"}</td>
                    <td>{row.expectedWikiTitle || "-"}</td>
                    <td>{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="diagBlock">
          <h3>Missing wiki rows</h3>
          <div className="tableWrap">
            <table className="truthTable" data-testid="missing-wiki-rows-table">
              <thead>
                <tr>
                  <th>ISO2</th>
                  <th>Country</th>
                  <th>Expected title</th>
                  <th>Expected wiki page</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {audit.diagnostics.missingWikiRows.map((row) => (
                  <tr key={`missing-wiki-${row.geo}`}>
                    <td>{row.geo}</td>
                    <td>{row.name}</td>
                    <td>{row.expectedWikiTitle || "-"}</td>
                    <td>
                      {row.expectedWikiUrl ? (
                        <a href={row.expectedWikiUrl} target="_blank" rel="noreferrer noopener" className="link">
                          {row.expectedWikiUrl}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{row.reason}</td>
                  </tr>
                ))}
                {!audit.diagnostics.missingWikiRows.length ? (
                  <tr>
                    <td colSpan={5}>No missing wiki rows detected.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <style jsx>{`
        .auditView {
          display: grid;
          gap: 18px;
        }
        .cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }
        .card {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 14px;
          background: #fff;
        }
        .card h2 {
          margin: 0 0 8px;
          font-size: 16px;
        }
        .numbers {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }
        .numbers strong {
          font-size: 22px;
        }
        .meta {
          font-size: 12px;
          color: #4b5563;
        }
        .issueBar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 14px;
          font-size: 13px;
          color: #374151;
          padding: 10px 12px;
          border-radius: 10px;
          background: #f8fafc;
          border: 1px solid #e5e7eb;
        }
        .sectionCard {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #fff;
          padding: 14px;
        }
        .boundaryGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
          font-size: 13px;
          color: #4b5563;
        }
        .boundaryGrid strong {
          display: block;
          margin-bottom: 4px;
          color: #111827;
        }
        .sectionHint {
          margin: 4px 0 10px;
          color: #4b5563;
          font-size: 13px;
        }
        .tableWrap {
          overflow-x: auto;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #fff;
        }
        .truthTable {
          width: max-content;
          min-width: 2300px;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 13px;
        }
        th,
        td {
          padding: 10px 12px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: top;
          text-align: left;
          max-width: 360px;
        }
        th {
          position: sticky;
          top: 0;
          background: #f8fafc;
          z-index: 1;
          white-space: nowrap;
          overflow: visible;
          text-overflow: clip;
        }
        .stickyCol1,
        .stickyCol2,
        .stickyCell {
          position: sticky;
          left: 0;
          background: #fff;
          z-index: 2;
        }
        .stickyCol2 {
          left: 96px;
        }
        .colGeo {
          min-width: 96px;
          width: 96px;
        }
        .colCountry {
          min-width: 220px;
          width: 220px;
        }
        .colStatus {
          min-width: 132px;
        }
        .colLinks {
          min-width: 280px;
        }
        .colOfficialLinks {
          min-width: 420px;
        }
        .colNotes {
          min-width: 360px;
          white-space: normal;
          word-break: break-word;
        }
        .colMeta {
          min-width: 96px;
        }
        .colDelta {
          min-width: 180px;
          white-space: normal;
        }
        .colUrl {
          min-width: 320px;
        }
        .colFlags {
          min-width: 220px;
        }
        .linkList,
        .flagList {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .linkList :global(a),
        .linkList :global(span) {
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .flagPill {
          display: inline-flex;
          width: fit-content;
          padding: 2px 8px;
          border-radius: 999px;
          background: #eef2ff;
          color: #3730a3;
          font-size: 11px;
          font-weight: 600;
        }
        .link {
          color: #2563eb;
          text-decoration: none;
          word-break: break-word;
        }
        .diagnostics {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #fff;
          padding: 12px 14px;
        }
        .diagBlock + .diagBlock {
          margin-top: 16px;
        }
      `}</style>
    </div>
  );
}
