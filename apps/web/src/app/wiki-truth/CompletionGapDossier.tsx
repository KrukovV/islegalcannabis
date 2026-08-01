import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";

type CompletionGapBlocker = {
  id?: string;
  status?: string;
  reason?: string;
  evidenceSource?: string;
};

type CompletionGapRequirement = {
  id?: string;
  source?: string;
  pastedRequirement?: string;
  status?: string;
  completionImpact?: string;
  reason?: string;
  evidenceSource?: string;
};

type CompletionGapDossierPayload = {
  generatedAt?: string;
  dossierStatus?: string;
  localOnly?: boolean;
  nonMutating?: boolean;
  overallComplete?: boolean;
  completionClaimAllowed?: boolean;
  blockingGate?: string;
  appliedRows?: number;
  productionTouched?: boolean;
  ssotMutationAttempted?: boolean;
  mapMutationAttempted?: boolean;
  summary?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  guardrails?: string[];
  completionBlockers?: CompletionGapBlocker[];
  requirementRows?: CompletionGapRequirement[];
};

function readDossier(): CompletionGapDossierPayload | null {
  const root = findRepoRoot(process.cwd());
  const filePath = path.join(
    root,
    "data",
    "reviews",
    "wiki-truth-307-completion-gap-dossier.json",
  );
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as CompletionGapDossierPayload;
  } catch {
    return null;
  }
}

function text(value: unknown, fallback = "MISSING") {
  const out = String(value ?? "").trim();
  return out || fallback;
}

function num(value: unknown) {
  return Number(value || 0);
}

function bit(value: unknown) {
  return value === true ? "1" : "0";
}

function summaryNumber(summary: Record<string, unknown> | undefined, key: string) {
  return num(summary?.[key]);
}

export default function CompletionGapDossier() {
  const dossier = readDossier();
  if (!dossier) {
    return (
      <section className="sectionCard completionGapDossier" data-testid="wiki-truth-completion-gap-dossier" data-status="MISSING">
        <h2>Truth-first completion gap dossier</h2>
        <p>Completion-gap dossier artifact is missing.</p>
      </section>
    );
  }

  const summary = dossier.summary || {};
  const blockers = Array.isArray(dossier.completionBlockers)
    ? dossier.completionBlockers
    : [];
  const requirements = Array.isArray(dossier.requirementRows)
    ? dossier.requirementRows
    : [];
  const guardrails = Array.isArray(dossier.guardrails) ? dossier.guardrails : [];

  return (
    <section
      className="sectionCard completionGapDossier"
      data-testid="wiki-truth-completion-gap-dossier"
      data-status={text(dossier.dossierStatus)}
      data-overall-complete={bit(dossier.overallComplete)}
      data-completion-claim-allowed={bit(dossier.completionClaimAllowed)}
      data-blocking-gate={text(dossier.blockingGate)}
      data-requirements-total={summaryNumber(summary, "requirementsTotal")}
      data-proven-requirements={summaryNumber(summary, "provenRequirements")}
      data-incomplete-requirements={summaryNumber(summary, "incompleteRequirements")}
      data-failed-requirements={summaryNumber(summary, "failedRequirements")}
      data-blocked-completion-requirements={summaryNumber(summary, "blockedCompletionRequirements")}
      data-hard-blockers={summaryNumber(summary, "hardBlockers")}
      data-blocker-exit-ready-now={summaryNumber(summary, "blockerExitReadyNow")}
      data-safe-rows={summaryNumber(summary, "safeRows")}
      data-no-op-rows={summaryNumber(summary, "noOpRows")}
      data-post-apply-truth-aligned={summaryNumber(summary, "postApplyTruthAlignedRows")}
      data-post-apply-coverage-rows={summaryNumber(summary, "postApplyCoverageRows")}
      data-legal-axis-rows={summaryNumber(summary, "legalAxisRows")}
      data-legal-axis-required-axes={summaryNumber(summary, "legalAxisRequiredAxes")}
      data-legal-axis-cells={summaryNumber(summary, "legalAxisCellsTotal")}
      data-legal-axis-known-cells={summaryNumber(summary, "legalAxisKnownCells")}
      data-legal-axis-unknown-cells={summaryNumber(summary, "legalAxisUnknownCells")}
      data-applied-rows={num(dossier.appliedRows)}
      data-production-touched={bit(dossier.productionTouched)}
      data-ssot-mutation-attempted={bit(dossier.ssotMutationAttempted)}
      data-map-mutation-attempted={bit(dossier.mapMutationAttempted)}
      data-non-mutating={bit(dossier.nonMutating)}
      data-local-only={bit(dossier.localOnly)}
    >
      <h2>Truth-first completion gap dossier</h2>
      <p className="sectionHint">
        This local artifact prevents a false completion claim. It renders the
        current evidence boundary: proved layers are kept, but final completion
        remains blocked until the color-review closure and blocker exits are
        legally proven and authorized.
      </p>
      <div className="completionGapBanner">
        Status: {text(dossier.dossierStatus)}. Completion claim allowed: {dossier.completionClaimAllowed ? "YES" : "NO"}.
        Blocking gate: {text(dossier.blockingGate)}. Applied rows: {num(dossier.appliedRows)}.
      </div>
      <div className="completionGapGrid">
        <article>
          <strong>{summaryNumber(summary, "requirementsTotal")}</strong>
          <span>requirements</span>
        </article>
        <article>
          <strong>{summaryNumber(summary, "provenRequirements")}</strong>
          <span>proven</span>
        </article>
        <article>
          <strong>{summaryNumber(summary, "incompleteRequirements")}</strong>
          <span>incomplete</span>
        </article>
        <article>
          <strong>{summaryNumber(summary, "hardBlockers")}</strong>
          <span>hard blockers</span>
        </article>
        <article>
          <strong>{summaryNumber(summary, "postApplyTruthAlignedRows")}</strong>
          <span>post-apply aligned rows</span>
        </article>
        <article>
          <strong>{summaryNumber(summary, "legalAxisUnknownCells")}</strong>
          <span>explicit unknown axes</span>
        </article>
      </div>
      <details open className="completionGapDetails">
        <summary>Completion blockers and guardrails</summary>
        <div className="completionGapGuardrails">
          {guardrails.map((guardrail) => (
            <span key={guardrail}>{guardrail}</span>
          ))}
        </div>
        <div className="tableWrap completionGapTableWrap">
          <table className="truthTable" data-testid="wiki-truth-completion-gap-blockers-table">
            <thead>
              <tr>
                <th>Blocker</th>
                <th>Status</th>
                <th>Evidence source</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {blockers.map((blocker) => (
                <tr
                  key={text(blocker.id)}
                  data-blocker-id={text(blocker.id)}
                  data-status={text(blocker.status)}
                  data-evidence-source={text(blocker.evidenceSource)}
                >
                  <td className="colMeta">{text(blocker.id)}</td>
                  <td className="colMeta">{text(blocker.status)}</td>
                  <td className="colMeta">{text(blocker.evidenceSource)}</td>
                  <td className="colNotes">{text(blocker.reason)}</td>
                </tr>
              ))}
              {!blockers.length ? (
                <tr>
                  <td colSpan={4}>No completion blockers are recorded.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>
      <div className="tableWrap completionGapTableWrap">
        <table className="truthTable" data-testid="wiki-truth-completion-gap-requirements-table">
          <thead>
            <tr>
              <th>Requirement</th>
              <th>Status</th>
              <th>Impact</th>
              <th>Source</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((requirement) => (
              <tr
                key={text(requirement.id)}
                data-requirement-id={text(requirement.id)}
                data-status={text(requirement.status)}
                data-completion-impact={text(requirement.completionImpact)}
                data-source={text(requirement.source)}
              >
                <td className="colMeta">{text(requirement.id)}</td>
                <td className="colMeta">{text(requirement.status)}</td>
                <td className="colMeta">{text(requirement.completionImpact)}</td>
                <td className="colMeta">{text(requirement.source)}</td>
                <td className="colNotes">{text(requirement.reason)}</td>
              </tr>
            ))}
            {!requirements.length ? (
              <tr>
                <td colSpan={5}>No completion requirements are recorded.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <style>{`
        .completionGapDossier {
          margin-bottom: 20px;
          border-color: #fed7aa;
          background: #fff7ed;
        }
        .completionGapBanner {
          border: 1px solid #c2410c;
          background: #ffedd5;
          color: #7c2d12;
          border-radius: 10px;
          padding: 12px;
          margin: 12px 0;
          font-weight: 700;
        }
        .completionGapGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
          margin: 12px 0;
        }
        .completionGapGrid article {
          border: 1px solid #fdba74;
          border-radius: 12px;
          background: #fff;
          padding: 12px;
        }
        .completionGapGrid strong {
          display: block;
          color: #9a3412;
          font-size: 24px;
        }
        .completionGapGrid span {
          color: #7c2d12;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .completionGapDetails {
          border: 1px solid #fdba74;
          border-radius: 10px;
          background: #fff;
          padding: 12px;
          margin: 12px 0;
        }
        .completionGapGuardrails span {
          display: inline-block;
          margin: 0 6px 6px 0;
          border-radius: 999px;
          background: #ffedd5;
          color: #9a3412;
          padding: 5px 8px;
          font-size: 12px;
          font-weight: 700;
        }
        .completionGapTableWrap {
          overflow: auto;
          width: min(100%, calc(100vw - 64px));
          max-width: 100%;
          max-height: 72vh;
          margin-top: 12px;
        }
        .completionGapTableWrap table {
          width: max-content;
          min-width: 1200px;
        }
      `}</style>
    </section>
  );
}
