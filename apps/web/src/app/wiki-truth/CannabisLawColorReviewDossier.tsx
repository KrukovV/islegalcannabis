"use client";

import type { WikiTruthColorReviewDossierView } from "@/lib/wikiTruthColorReviewDossier";

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

export default function CannabisLawColorReviewDossier({
  dossier,
}: {
  dossier: WikiTruthColorReviewDossierView;
}) {
  return (
    <section
      className="sectionCard colorReviewDossier"
      data-testid="wiki-truth-color-review-dossier"
      data-review-status={dossier.reviewStatus}
      data-rows-total={dossier.rowsTotal}
      data-non-mutating={dossier.nonMutating ? "1" : "0"}
      data-local-only={dossier.localOnly ? "1" : "0"}
      data-applied-rows={dossier.appliedRows}
      data-ready-pending-authorization={dossier.readyPendingAuthorizationRows}
      data-blocked-rows={dossier.blockedRows}
      data-primary-law-blockers={dossier.primaryLawBlockerGeos.join(",")}
      data-all-rows-have-review-decision={
        dossier.validation.allRowsHaveReviewDecision === true ? "1" : "0"
      }
      data-all-rows-have-legal-basis={
        dossier.validation.allRowsHaveLegalBasisClass === true ? "1" : "0"
      }
      data-allowed-colors-only={
        dossier.validation.allowedColorsOnly === true ? "1" : "0"
      }
    >
      <h2>
        Truth-first color review dossier: {dossier.rowsTotal}-row local packet
      </h2>
      <p className="sectionHint">
        Этот dossier связывает color proposals, apply plan и fail-closed gate в
        один review packet. Он доказывает, что каждая строка имеет диспозицию,
        но не применяет SSOT/map/prod changes.
      </p>
      <div className="hardRule">
        Review status: {dossier.reviewStatus}. Applied rows:{" "}
        {dossier.appliedRows}. This is not authorization to mutate.
      </div>
      <div className="boundaryGrid dossierCounters">
        <div>
          <strong>Rows</strong>
          <div>{dossier.rowsTotal}</div>
        </div>
        <div>
          <strong>Ready, pending auth</strong>
          <div>{dossier.readyPendingAuthorizationRows}</div>
        </div>
        <div>
          <strong>Blocked/review</strong>
          <div>{dossier.blockedRows}</div>
        </div>
        <div>
          <strong>Primary-law blockers</strong>
          <div>{dossier.primaryLawBlockerGeos.join(",") || "-"}</div>
        </div>
      </div>
      <details className="dossierCounts" open>
        <summary>Review decisions and legal basis classes</summary>
        <div className="countColumns">
          <div>
            <h3>Review decisions</h3>
            {formatCounts(dossier.counts.reviewDecision).map(([key, value]) => (
              <span key={key} className="countPill">
                {key}: {value}
              </span>
            ))}
          </div>
          <div>
            <h3>Legal basis</h3>
            {formatCounts(dossier.counts.legalBasisClass).map(
              ([key, value]) => (
                <span key={key} className="countPill">
                  {key}: {value}
                </span>
              ),
            )}
          </div>
        </div>
      </details>
      <div className="tableWrap dossierTableWrap">
        <table
          className="truthTable"
          data-testid="wiki-truth-color-review-dossier-table"
        >
          <thead>
            <tr>
              <th>#</th>
              <th>GEO</th>
              <th>Территория</th>
              <th>Transition</th>
              <th>Review decision</th>
              <th>Legal basis</th>
              <th>Apply disposition</th>
              <th>Non-apply reason</th>
            </tr>
          </thead>
          <tbody>
            {dossier.rows.map((row) => (
              <tr
                key={row.geo}
                data-geo={row.geo}
                data-review-decision={row.reviewDecision}
                data-legal-basis-class={row.legalBasisClass}
                data-apply-disposition={row.applyDisposition}
                data-blocked-primary-law={row.blockedByPrimaryLaw ? "1" : "0"}
              >
                <td className="colMeta">{row.reviewIndex}</td>
                <td className="colGeo">{row.geo}</td>
                <td className="colCountry">{row.territory}</td>
                <td className="colStatus">
                  {colorLabel(row.currentColor)} →{" "}
                  {colorLabel(row.proposedTruthColor)}
                </td>
                <td className="colMeta">{row.reviewDecision}</td>
                <td className="colMeta">{row.legalBasisClass}</td>
                <td className="colMeta">{row.applyDisposition}</td>
                <td className="colNotes">{row.nonApplyReason}</td>
              </tr>
            ))}
            {!dossier.rows.length ? (
              <tr>
                <td colSpan={8}>Color review dossier rows отсутствуют.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <style jsx>{`
        .colorReviewDossier {
          margin-top: 28px;
          border-color: #bbf7d0;
          background: #f0fdf4;
        }
        .hardRule {
          border: 1px solid #15803d;
          background: #dcfce7;
          color: #14532d;
          border-radius: 8px;
          padding: 12px;
          margin: 10px 0;
          font-weight: 700;
        }
        .dossierCounters {
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
        .dossierCounts {
          margin: 14px 0;
          border: 1px solid #86efac;
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
          background: #dcfce7;
          color: #14532d;
          padding: 5px 8px;
          font-size: 12px;
          font-weight: 700;
        }
        .dossierTableWrap {
          overflow: auto;
          width: min(100%, calc(100vw - 64px));
          max-width: 100%;
          max-height: 72vh;
          margin-top: 14px;
        }
        .dossierTableWrap table {
          width: max-content;
          min-width: 1600px;
        }
      `}</style>
    </section>
  );
}
