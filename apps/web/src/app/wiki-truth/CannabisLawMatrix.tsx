"use client";

import type {
  WikiTruthCannabisLawLink,
  WikiTruthCannabisLawMatrix,
  WikiTruthCannabisLawRow
} from "@/lib/wikiTruthCannabisLawMatrix";

function renderStatus(status: WikiTruthCannabisLawRow["projectStatus"] | WikiTruthCannabisLawRow["officialStatus"]) {
  return status
    ? `rec=${status.recreational}; med=${status.medical}; enforcement=${status.enforcement ?? "-"}`
    : "NOT_VISUALLY_CONFIRMED";
}

function renderLinks(items: WikiTruthCannabisLawLink[], mode: "verified" | "candidate" | "context") {
  if (!items.length) return "-";
  const content = (
    <div className="linkList">
      {items.map((item) => (
        <div key={`${mode}:${item.url}`} className={`linkItem ${mode}`}>
          <a href={item.url} target="_blank" rel="noreferrer noopener" className="link">
            <span>{item.title}</span>
            <span className="url">{item.url}</span>
          </a>
          <span className="meta">{item.verification}; confidence={item.confidence}</span>
          {item.note ? <span className="meta">{item.note}</span> : null}
          {item.screenshotPath ? <span className="screenshot">Screenshot: {item.screenshotPath}</span> : null}
        </div>
      ))}
    </div>
  );
  if (mode === "verified") return content;
  return (
    <details>
      <summary>{items.length} {mode === "candidate" ? "unreviewed candidate link(s)" : "context link(s)"}</summary>
      {content}
    </details>
  );
}

function coverageLabel(value: WikiTruthCannabisLawRow["sourceCoverage"]) {
  const labels: Record<WikiTruthCannabisLawRow["sourceCoverage"], string> = {
    VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW: "VISUALLY VERIFIED LAW PAGE",
    OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW: "OFFICIAL URL; VISUAL REVIEW BLOCKED/PENDING",
    CANDIDATE_LINKS_AWAITING_VISUAL_REVIEW: "UNREVIEWED CANDIDATE LINKS",
    OFFICIAL_CONTEXT_ONLY: "OFFICIAL CONTEXT ONLY",
    NO_CANDIDATE_PAGE_FOUND: "NO CANDIDATE PAGE FOUND"
  };
  return labels[value];
}

export default function CannabisLawMatrix({ matrix }: { matrix: WikiTruthCannabisLawMatrix }) {
  return (
    <section className="sectionCard cannabisMatrix" data-testid="cannabis-law-matrix-307">
      <h2>Official cannabis-law manual review: all 307 territories</h2>
      <p className="sectionHint">{matrix.scope}</p>
      <p className="hardRule">
        Manual review means the official material was opened and checked by eye. A link is listed as verified law evidence only after its cannabis-specific content was also saved as a screenshot; a completed review may honestly end with no direct page found or context only.
      </p>
      <div className="boundaryGrid matrixCounters">
        <div><strong>All GEO rows</strong><div>{matrix.counts.total}</div></div>
        <div><strong>Manual visual reviews complete</strong><div>{matrix.counts.manualVisualReviewComplete}</div></div>
        <div><strong>Visually verified law pages</strong><div>{matrix.counts.visuallyVerifiedOfficialCannabisLaw}</div></div>
        <div><strong>Reviewed: no direct page found</strong><div>{matrix.counts.visuallyReviewedNoDirectPageFound}</div></div>
        <div><strong>Reviewed: official context only</strong><div>{matrix.counts.visuallyReviewedOfficialContextOnly}</div></div>
        <div><strong>Visual reviews remaining</strong><div>{matrix.counts.visualReviewRemaining}</div></div>
        <div><strong>Official URLs awaiting visual review</strong><div>{matrix.counts.officialSourceAwaitingVisualReview}</div></div>
        <div><strong>Former candidate rows awaiting visual review</strong><div>{matrix.counts.candidateRowsAwaitingVisualReview}</div></div>
        <div><strong>Official context only</strong><div>{matrix.counts.officialContextOnly}</div></div>
        <div><strong>No candidate page found</strong><div>{matrix.counts.noCandidatePageFound}</div></div>
        <div><strong>Raw parser-signal rows (never conflicts by themselves)</strong><div>{matrix.counts.rawParserSignalRows}</div></div>
        <div><strong>Visually supported project mismatches</strong><div>{matrix.counts.projectStatusMismatch}</div></div>
        <div><strong>Visual capture blocked</strong><div>{matrix.counts.visualCaptureBlocked}</div></div>
      </div>
      <div className="tableWrap matrixTableWrap">
        <table className="truthTable matrixTable">
          <thead>
            <tr>
              <th className="stickyCol1 colGeo">Geo</th>
              <th className="stickyCol2 colCountry">Territory</th>
              <th className="colStatus">Project status</th>
              <th className="colStatus">Visually confirmed official status</th>
              <th className="colMeta">Evidence coverage</th>
              <th className="colOfficialLinks">Visually verified official law evidence</th>
              <th className="colOfficialLinks">Candidates awaiting visual review</th>
              <th className="colOfficialLinks">Official context only</th>
              <th className="colMeta">Difference status</th>
              <th className="colNotes">What is established / still missing</th>
              <th className="colNotes">Raw parser output (never a conflict by itself)</th>
              <th className="colNotes">Screenshot review</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.geo} data-geo={row.geo} data-difference-status={row.differenceStatus}>
                <td className="stickyCol1 stickyCell colGeo">{row.geo}</td>
                <td className="stickyCol2 stickyCell colCountry">{row.territory}</td>
                <td className="colStatus">{renderStatus(row.projectStatus)}</td>
                <td className="colStatus">{renderStatus(row.officialStatus)}</td>
                <td className="colMeta"><span className={`coverage ${row.sourceCoverage}`}>{coverageLabel(row.sourceCoverage)}</span></td>
                <td className="colOfficialLinks">{renderLinks(row.directOfficialCannabisLawLinks, "verified")}</td>
                <td className="colOfficialLinks">{renderLinks(row.candidateLinksAwaitingVisualReview, "candidate")}</td>
                <td className="colOfficialLinks">{renderLinks(row.officialContextLinks, "context")}</td>
                <td className="colMeta">{row.differenceStatus}</td>
                <td className="colNotes">{row.differenceDescription}</td>
                <td className="colNotes">{row.parserSignals.join("; ") || "-"}</td>
                <td className="colNotes">
                  <strong>{row.visualReviewStatus}</strong>
                  <span className="reviewNote">{row.reviewNotes}</span>
                  {row.screenshotPaths.length ? (
                    <details>
                      <summary>{row.screenshotPaths.length} screenshot(s)</summary>
                      {row.screenshotPaths.map((screenshotPath) => <span className="screenshot" key={screenshotPath}>{screenshotPath}</span>)}
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style jsx>{`
        .cannabisMatrix { margin-top: 28px; }
        .hardRule { border: 1px solid #b45309; background: #fffbeb; color: #78350f; border-radius: 8px; padding: 12px; }
        .matrixCounters { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
        .matrixTableWrap { overflow: auto; width: min(100%, calc(100vw - 64px)); max-width: 100%; max-height: 78vh; }
        .matrixTable { width: max-content; min-width: 3300px; }
        .linkList, .linkItem { display: grid; gap: 6px; }
        .linkItem { border-left: 3px solid #94a3b8; padding: 8px; background: #f8fafc; }
        .linkItem.verified { border-left-color: #15803d; background: #f0fdf4; }
        .linkItem.candidate { border-left-color: #d97706; background: #fffbeb; }
        .link { color: #075985; overflow-wrap: anywhere; }
        .url, .meta, .screenshot, .reviewNote { display: block; font-size: 11px; color: #64748b; overflow-wrap: anywhere; }
        .screenshot { margin-top: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .reviewNote { margin-top: 6px; }
        summary { cursor: pointer; color: #475569; }
        .coverage { display: inline-block; max-width: 220px; border-radius: 999px; padding: 4px 8px; font-size: 11px; line-height: 1.3; background: #e2e8f0; }
        .coverage.VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW { background: #dcfce7; color: #166534; }
        .coverage.OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW,
        .coverage.CANDIDATE_LINKS_AWAITING_VISUAL_REVIEW { background: #fef3c7; color: #92400e; }
        .coverage.OFFICIAL_CONTEXT_ONLY { background: #dbeafe; color: #1e40af; }
        .coverage.NO_CANDIDATE_PAGE_FOUND { background: #fee2e2; color: #991b1b; }
      `}</style>
    </section>
  );
}
