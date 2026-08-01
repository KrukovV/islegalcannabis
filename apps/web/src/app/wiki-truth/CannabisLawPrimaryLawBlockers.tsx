"use client";

import type { WikiTruthPrimaryLawBlockersView } from "@/lib/wikiTruthPrimaryLawBlockers";
import { ruAuditValue } from "./wikiTruthRu";

function zeroSearchSummary(
  searches: WikiTruthPrimaryLawBlockersView["blockers"][number]["negativeSearches"],
) {
  return searches.map((search) => `${search.term}:${search.found}`).join(",");
}

function freshSearchDirectFinds(
  blocker: WikiTruthPrimaryLawBlockersView["blockers"][number],
) {
  return [
    ...blocker.freshPrimaryLawSearchAudit.queries,
    ...blocker.freshPrimaryLawSearchAudit.officialSourcesReviewed,
  ].filter((item) => item.directCannabisPrimaryLawFound).length;
}

function renderSourceLink(item: { url?: string; title?: string }) {
  const href = item.url || "";
  const label = item.title || href || "-";
  if (!href) return <span>{label}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="link">
      <span>{label}</span>
      {label !== href ? <small>{href}</small> : null}
    </a>
  );
}

export default function CannabisLawPrimaryLawBlockers({
  blockers,
}: {
  blockers: WikiTruthPrimaryLawBlockersView;
}) {
  return (
    <section
      className="sectionCard primaryLawBlockers"
      data-testid="wiki-truth-primary-law-blockers"
      data-blockers-total={blockers.blockersTotal}
      data-non-mutating={blockers.nonMutating ? "1" : "0"}
      data-report-version={blockers.reportVersion}
    >
      <h2>Primary-law blockers: unresolved Truth-first evidence gaps</h2>
      <p className="sectionHint">
        Этот блок показывает территории, где локальный 307-GEO audit не смог
        честно доказать прямой применимый cannabis-law источник. Это не
        изменение статуса и не изменение карты: строка остаётся blocker до
        появления первичного закона, schedule, gazette, regulator, parliament,
        ministry или court evidence.
      </p>
      <div className="hardRule">
        Non-mutating blocker evidence: {blockers.nonMutating ? "YES" : "NO"}.
        Rows here explain why acceptance remains false instead of inventing a
        truth color.
      </div>
      <div className="boundaryGrid blockerCounters">
        <div>
          <strong>Blockers</strong>
          <div>{blockers.blockersTotal}</div>
        </div>
        <div>
          <strong>Artifact version</strong>
          <div>{blockers.reportVersion}</div>
        </div>
        <div>
          <strong>Generated</strong>
          <div>{blockers.generatedAt}</div>
        </div>
      </div>
      <div className="tableWrap blockerTableWrap">
        <table
          className="truthTable"
          data-testid="wiki-truth-primary-law-blockers-table"
        >
          <thead>
            <tr>
              <th>GEO</th>
              <th>Территория</th>
              <th>Status</th>
              <th>Truth rule</th>
              <th>Context evidence</th>
              <th>Negative searches</th>
              <th>Required next evidence</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {blockers.blockers.map((row) => (
              <tr
                key={row.geo}
                data-geo={row.geo}
                data-blocker-status={row.status}
                data-blocker-type={row.blockerType}
                data-proposed-truth-color={row.proposedTruthColor}
                data-negative-searches={zeroSearchSummary(row.negativeSearches)}
                data-known-primary-boundary={row.knownPrimaryLawBoundary.status}
                data-fresh-search-result={
                  row.freshPrimaryLawSearchAudit.result
                }
                data-fresh-search-query-count={
                  row.freshPrimaryLawSearchAudit.queries.length
                }
                data-fresh-search-source-count={
                  row.freshPrimaryLawSearchAudit.officialSourcesReviewed.length
                }
                data-fresh-search-direct-finds={freshSearchDirectFinds(row)}
                data-collector-has-cannabis-pages={
                  row.localCollectorAudit.hasCannabisPages ? "1" : "0"
                }
                data-collector-fetched-candidates={
                  row.localCollectorAudit.fetchedCandidates
                }
                data-visual-screenshots={
                  row.visualReviewEvidence.screenshotPaths.length
                }
              >
                <td className="colGeo">{row.geo}</td>
                <td className="colCountry">{row.territory}</td>
                <td className="colStatus">
                  <strong>{row.status}</strong>
                  <small>{row.blockerType}</small>
                </td>
                <td className="colMeta">{row.currentTruthRule}</td>
                <td className="colLinks">
                  <strong>
                    UNODC CLD country search:{" "}
                    {row.officialContextSearch.found}
                  </strong>
                  <div className="linkList">
                    {row.supportingPrimaryLawContext.map((item) => (
                      <span key={`${item.url}-${item.title}`}>
                        {renderSourceLink(item)}
                        <small>{ruAuditValue(item.sourceKind)}</small>
                        <small>{item.legalUse}</small>
                      </span>
                    ))}
                  </div>
                  <strong>
                    Local collector: {row.localCollectorAudit.source}
                  </strong>
                  <small>
                    selected={row.localCollectorAudit.selectedCandidates};
                    fetched={row.localCollectorAudit.fetchedCandidates};
                    has_cannabis_pages=
                    {row.localCollectorAudit.hasCannabisPages ? "true" : "false"}
                  </small>
                  <small>{row.localCollectorAudit.conclusion}</small>
                  <strong>
                    Visual review: {row.visualReviewEvidence.visualReviewStatus}
                  </strong>
                  <small>
                    sourceCoverage={row.visualReviewEvidence.sourceCoverage};
                    screenshots={row.visualReviewEvidence.screenshotPaths.length}
                  </small>
                  <small>{row.visualReviewEvidence.conclusion}</small>
                  <strong>
                    Fresh targeted search:{" "}
                    {row.freshPrimaryLawSearchAudit.result}
                  </strong>
                  <small>
                    source={row.freshPrimaryLawSearchAudit.source};
                    executed={row.freshPrimaryLawSearchAudit.executedAt};
                    queries={row.freshPrimaryLawSearchAudit.queries.length};
                    official_sources=
                    {
                      row.freshPrimaryLawSearchAudit.officialSourcesReviewed
                        .length
                    }
                    ; direct_finds={freshSearchDirectFinds(row)}
                  </small>
                  <small>
                    {row.freshPrimaryLawSearchAudit.conclusion}
                  </small>
                </td>
                <td className="colNotes">
                  {row.negativeSearches.map((search) => (
                    <a
                      key={`${row.geo}-${search.term}`}
                      href={search.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="searchPill"
                      data-search-term={search.term}
                      data-search-found={search.found}
                    >
                      {search.term}: {search.found}
                    </a>
                  ))}
                </td>
                <td className="colNotes">{row.requiredNextEvidence}</td>
                <td className="colNotes">
                  <strong>{row.proposedTruthColor}</strong>
                  <span className="boundary">
                    Boundary: {row.knownPrimaryLawBoundary.status}
                  </span>
                  <span>{row.knownPrimaryLawBoundary.proven}</span>
                  <span>{row.knownPrimaryLawBoundary.missing}</span>
                  <span>{row.knownPrimaryLawBoundary.legalConclusion}</span>
                  <span>{row.evidenceSummary}</span>
                  <span>{row.nonMutationDecision}</span>
                </td>
              </tr>
            ))}
            {!blockers.blockers.length ? (
              <tr>
                <td colSpan={8}>Primary-law blockers не обнаружены.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <style jsx>{`
        .primaryLawBlockers {
          margin-top: 28px;
          border-color: #fed7aa;
          background: #fff7ed;
        }
        .hardRule {
          border: 1px solid #b45309;
          background: #fffbeb;
          color: #78350f;
          border-radius: 8px;
          padding: 12px;
          margin: 10px 0;
        }
        .blockerCounters {
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
        .blockerTableWrap {
          overflow: auto;
          width: min(100%, calc(100vw - 64px));
          max-width: 100%;
          max-height: 72vh;
          margin-top: 14px;
        }
        .blockerTableWrap table {
          width: max-content;
          min-width: 1900px;
        }
        .blockerTableWrap small,
        .blockerTableWrap span {
          display: block;
        }
        .searchPill {
          display: inline-block;
          margin: 0 6px 6px 0;
          border-radius: 999px;
          background: #fee2e2;
          color: #991b1b;
          padding: 5px 8px;
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
        }
        .link {
          color: #2563eb;
          text-decoration: none;
          word-break: break-word;
        }
        .linkList {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
      `}</style>
    </section>
  );
}
