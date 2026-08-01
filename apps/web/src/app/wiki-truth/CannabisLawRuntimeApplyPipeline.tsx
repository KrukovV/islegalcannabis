"use client";

import type { ReactNode } from "react";
import type { WikiTruthRuntimeApplyPipelineView } from "@/lib/wikiTruthRuntimeApplyPipeline";

function formatCounts(counts: Record<string, number>) {
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
}

function StageCard({
  title,
  status,
  children,
}: {
  title: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <article className="runtimeStageCard">
      <h3>{title}</h3>
      <strong>{status}</strong>
      <div>{children}</div>
    </article>
  );
}

export default function CannabisLawRuntimeApplyPipeline({
  pipeline,
}: {
  pipeline: WikiTruthRuntimeApplyPipelineView;
}) {
  const execution = pipeline.execution;
  const postApply = pipeline.postApply;
  const blockerExit = pipeline.blockerExitDossier;
  return (
    <section
      className="sectionCard runtimeApplyPipeline"
      data-testid="wiki-truth-runtime-apply-pipeline"
      data-dry-run-status={pipeline.dryRun.status}
      data-preflight-status={pipeline.preflight.status}
      data-execution-status={execution.status}
      data-dry-run-rows={pipeline.dryRun.rowsTotal}
      data-preflight-rows={pipeline.preflight.rowsTotal}
      data-execution-rows={execution.rows.length}
      data-target-files={pipeline.preflight.targetFilesTotal}
      data-target-drift-files={pipeline.preflight.targetDriftFiles}
      data-target-drift-rows={pipeline.preflight.targetDriftRows}
      data-applied-rows={execution.appliedRows}
      data-written-target-files={execution.writtenTargetFilesTotal}
      data-would-write-now={execution.wouldWriteRowsNow}
      data-apply-flag-present={execution.applyFlagPresent ? "1" : "0"}
      data-authorization-present={execution.authorizationPresent ? "1" : "0"}
      data-ssot-write-enabled={execution.ssotWriteEnabled ? "1" : "0"}
      data-non-mutating={execution.nonMutating ? "1" : "0"}
      data-production-touched={execution.productionTouched ? "1" : "0"}
      data-ssot-mutation-attempted={execution.ssotMutationAttempted ? "1" : "0"}
      data-map-mutation-attempted={execution.mapMutationAttempted ? "1" : "0"}
      data-post-apply-status={postApply.status}
      data-post-apply-safe-rows={postApply.safeRows}
      data-post-apply-no-op-rows={postApply.noOpRows}
      data-post-apply-blocked-rows={postApply.blockedRows}
      data-post-apply-truth-aligned={postApply.truthAlignedRowsAfterAuthorizedApply}
      data-post-apply-coverage-rows={postApply.coverageRowsTotal}
      data-post-apply-coverage-expected={postApply.coverageRowsExpected}
      data-post-apply-target-files={postApply.targetFilesTotal}
      data-post-apply-applied-rows={postApply.appliedRows}
      data-post-apply-would-apply={postApply.wouldApplyRowsAfterAuthorization}
      data-post-apply-non-mutating={postApply.nonMutating ? "1" : "0"}
      data-post-apply-production-touched={postApply.productionTouched ? "1" : "0"}
      data-post-apply-ssot-mutation-attempted={postApply.ssotMutationAttempted ? "1" : "0"}
      data-post-apply-map-mutation-attempted={postApply.mapMutationAttempted ? "1" : "0"}
      data-blocker-exit-status={blockerExit.status}
      data-blocker-exit-rows={blockerExit.blockedRowsTotal}
      data-blocker-exit-disputed-targets={blockerExit.disputedTargetBlockers}
      data-blocker-exit-runtime-conflicts={blockerExit.runtimeTruthConflictBlockers}
      data-blocker-exit-ready-now={blockerExit.exitReadyNow}
      data-blocker-exit-excluded-safe={blockerExit.excludedFromSafeApply}
      data-blocker-exit-safe-rows={blockerExit.safeApplyRows}
      data-blocker-exit-no-op-rows={blockerExit.noOpRows}
      data-blocker-exit-truth-aligned={blockerExit.postApplyTruthAlignedRows}
      data-blocker-exit-coverage-rows={blockerExit.postApplyCoverageRows}
      data-blocker-exit-target-files={blockerExit.targetFiles}
      data-blocker-exit-applied-rows={blockerExit.appliedRows}
      data-blocker-exit-non-mutating={blockerExit.nonMutating ? "1" : "0"}
      data-blocker-exit-local-only={blockerExit.localOnly ? "1" : "0"}
      data-blocker-exit-production-touched={blockerExit.productionTouched ? "1" : "0"}
      data-blocker-exit-ssot-mutation-attempted={blockerExit.ssotMutationAttempted ? "1" : "0"}
      data-blocker-exit-map-mutation-attempted={blockerExit.mapMutationAttempted ? "1" : "0"}
    >
      <h2>Runtime apply pipeline: dry-run, preflight, executor</h2>
      <p className="sectionHint">
        Эта секция показывает локальную цепочку будущего runtime apply. Сейчас
        она доказывает обратное действие: без `--apply`, точной authorization
        phrase и `SSOT_WRITE=1` ни одна строка не записывается.
      </p>
      <div className="hardRule">
        Executor status: {execution.status}. Applied rows: {execution.appliedRows}.
        Written target files: {execution.writtenTargetFilesTotal}. Production touched: {execution.productionTouched ? "YES" : "NO"}.
      </div>
      <div className="runtimeStageGrid">
        <StageCard title="Dry-run diff" status={pipeline.dryRun.status}>
          Rows: {pipeline.dryRun.rowsTotal}; targets: {pipeline.dryRun.targetFilesTotal}; would apply after authorization: {pipeline.dryRun.wouldApplyRowsAfterAuthorization}.
        </StageCard>
        <StageCard title="Preflight" status={pipeline.preflight.status}>
          Drift files: {pipeline.preflight.targetDriftFiles}; would write now: {pipeline.preflight.wouldWriteRowsNow}; authorization: {pipeline.preflight.authorizationPresent ? "present" : "missing"}.
        </StageCard>
        <StageCard title="Executor" status={execution.status}>
          `--apply`: {execution.applyFlagPresent ? "present" : "missing"}; SSOT_WRITE: {execution.ssotWriteEnabled ? "1" : "0"}; applied rows: {execution.appliedRows}.
        </StageCard>
        <StageCard title="Post-apply verifier" status={postApply.status}>
          Safe rows: {postApply.safeRows}; no-op rows: {postApply.noOpRows}; blocked rows: {postApply.blockedRows}; Truth-aligned after authorized safe apply: {postApply.truthAlignedRowsAfterAuthorizedApply}/{postApply.coverageRowsExpected}.
        </StageCard>
        <StageCard title="Blocked-row exit dossier" status={blockerExit.status}>
          Rows: {blockerExit.blockedRowsTotal}; exit-ready now: {blockerExit.exitReadyNow}; excluded from safe apply: {blockerExit.excludedFromSafeApply}; applied rows: {blockerExit.appliedRows}.
        </StageCard>
      </div>
      <div
        className="hardRule postApplyRule"
        data-testid="wiki-truth-runtime-post-apply-verifier"
      >
        Post-apply verifier: {postApply.status}. Safe rows: {postApply.safeRows}.
        No-op rows: {postApply.noOpRows}. Blocked rows: {postApply.blockedRows}.
        Applied rows now: {postApply.appliedRows}. Production touched: {postApply.productionTouched ? "YES" : "NO"}.
      </div>
      <div
        className="hardRule blockerExitRule"
        data-testid="wiki-truth-runtime-blocker-exit-dossier"
      >
        Blocker exit dossier: {blockerExit.status}. Blocked rows: {blockerExit.blockedRowsTotal}.
        Disputed target blockers: {blockerExit.disputedTargetBlockers}. Runtime/truth conflicts: {blockerExit.runtimeTruthConflictBlockers}.
        Exit-ready now: {blockerExit.exitReadyNow}. Applied rows now: {blockerExit.appliedRows}.
      </div>
      <details open className="runtimeCounts">
        <summary>Guardrails and execution counts</summary>
        <div className="countColumns">
          <div>
            <h3>Execution decisions</h3>
            {formatCounts(execution.counts.executionDecision || {}).map(
              ([key, value]) => (
                <span key={key} className="countPill">
                  {key}: {value}
                </span>
              ),
            )}
          </div>
          <div>
            <h3>Blocking reasons</h3>
            {formatCounts(execution.counts.blockingReason || {}).map(
              ([key, value]) => (
                <span key={key} className="countPill">
                  {key}: {value}
                </span>
              ),
            )}
          </div>
          <div>
            <h3>Post-apply colors</h3>
            {formatCounts(postApply.counts.safePostApplyColor || {}).map(
              ([key, value]) => (
                <span key={key} className="countPill">
                  {key}: {value}
                </span>
              ),
            )}
          </div>
          <div>
            <h3>Exit blocker classes</h3>
            {formatCounts(blockerExit.counts.blockerClass || {}).map(
              ([key, value]) => (
                <span key={key} className="countPill">
                  {key}: {value}
                </span>
              ),
            )}
          </div>
          <div>
            <h3>Guardrails</h3>
            {[...new Set([...execution.guardrails, ...blockerExit.guardrails])].map((guardrail) => (
              <span key={guardrail} className="countPill neutral">
                {guardrail}
              </span>
            ))}
          </div>
        </div>
      </details>
      <div className="tableWrap runtimeTableWrap">
        <table
          className="truthTable"
          data-testid="wiki-truth-runtime-blocker-exit-dossier-table"
        >
          <thead>
            <tr>
              <th>GEO</th>
              <th>Territory</th>
              <th>Blocker class</th>
              <th>Exit condition</th>
              <th>Runtime color</th>
              <th>Truth color</th>
              <th>Required next evidence</th>
              <th>Blocking reasons</th>
            </tr>
          </thead>
          <tbody>
            {blockerExit.rows.map((row) => (
              <tr
                key={`${row.geo}-${row.blockerClass}`}
                data-geo={row.geo}
                data-blocker-class={row.blockerClass}
                data-exit-condition={row.exitCondition}
                data-exit-ready-now={row.exitReadyNow ? "1" : "0"}
                data-excluded-from-safe-apply={row.excludedFromSafeApply ? "1" : "0"}
                data-readiness-decision={row.readinessDecision}
                data-current-runtime-color={row.currentRuntimeColor}
                data-proposed-truth-color={row.proposedTruthColor}
                data-required-next-evidence={row.requiredNextEvidence.join(",")}
                data-blocking-reasons={row.blockingReasons.join(",")}
              >
                <td className="colGeo">{row.geo}</td>
                <td className="colCountry">{row.territory}</td>
                <td className="colMeta">{row.blockerClass}</td>
                <td className="colMeta">{row.exitCondition}</td>
                <td className="colMeta">{row.currentRuntimeColor}</td>
                <td className="colMeta">{row.proposedTruthColor}</td>
                <td className="colNotes">{row.requiredNextEvidence.join(", ")}</td>
                <td className="colNotes">{row.blockingReasons.join(", ")}</td>
              </tr>
            ))}
            {!blockerExit.rows.length ? (
              <tr>
                <td colSpan={8}>Blocked-row exit dossier отсутствует.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="tableWrap runtimeTableWrap">
        <table
          className="truthTable"
          data-testid="wiki-truth-runtime-post-apply-blocked-table"
        >
          <thead>
            <tr>
              <th>GEO</th>
              <th>Territory</th>
              <th>Decision</th>
              <th>Target family</th>
              <th>Runtime color</th>
              <th>Truth color</th>
              <th>Truth rule</th>
              <th>Blocking reasons</th>
            </tr>
          </thead>
          <tbody>
            {postApply.blockedRowsList.map((row) => (
              <tr
                key={`${row.geo}-${row.decision}`}
                data-geo={row.geo}
                data-decision={row.decision}
                data-target-family={row.targetFamily}
                data-current-runtime-color={row.currentRuntimeColor}
                data-proposed-truth-color={row.proposedTruthColor}
                data-blocking-reasons={row.blockingReasons.join(",")}
              >
                <td className="colGeo">{row.geo}</td>
                <td className="colCountry">{row.territory}</td>
                <td className="colMeta">{row.decision}</td>
                <td className="colMeta">{row.targetFamily}</td>
                <td className="colMeta">{row.currentRuntimeColor}</td>
                <td className="colMeta">{row.proposedTruthColor}</td>
                <td className="colMeta">{row.truthRule}</td>
                <td className="colNotes">{row.blockingReasons.join(", ")}</td>
              </tr>
            ))}
            {!postApply.blockedRowsList.length ? (
              <tr>
                <td colSpan={8}>Post-apply blocked rows отсутствуют.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="tableWrap runtimeTableWrap">
        <table
          className="truthTable"
          data-testid="wiki-truth-runtime-apply-pipeline-table"
        >
          <thead>
            <tr>
              <th>GEO</th>
              <th>Territory</th>
              <th>Target</th>
              <th>Truth color</th>
              <th>Derived after patch</th>
              <th>Ops</th>
              <th>Decision</th>
              <th>Blocking reasons</th>
            </tr>
          </thead>
          <tbody>
            {execution.rows.map((row) => (
              <tr
                key={`${row.geo}-${row.targetPath}`}
                data-geo={row.geo}
                data-target-family={row.targetFamily}
                data-proposed-truth-color={row.proposedTruthColor}
                data-derived-color-after-patch={row.derivedColorAfterPatch}
                data-execution-decision={row.executionDecision}
                data-blocking-reasons={row.blockingReasons.join(",")}
                data-target-hash-matches-dry-run={row.targetHashMatchesDryRun ? "1" : "0"}
              >
                <td className="colGeo">{row.geo}</td>
                <td className="colCountry">{row.territory}</td>
                <td className="colMeta">{row.targetPath}</td>
                <td className="colMeta">{row.proposedTruthColor}</td>
                <td className="colMeta">{row.derivedColorAfterPatch}</td>
                <td className="colMeta">{row.operationCount}</td>
                <td className="colMeta">{row.executionDecision}</td>
                <td className="colNotes">{row.blockingReasons.join(", ")}</td>
              </tr>
            ))}
            {!execution.rows.length ? (
              <tr>
                <td colSpan={8}>Runtime apply rows отсутствуют.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <style jsx>{`
        .runtimeApplyPipeline {
          margin-top: 28px;
          border-color: #bae6fd;
          background: #f0f9ff;
        }
        .hardRule {
          border: 1px solid #0369a1;
          background: #e0f2fe;
          color: #0c4a6e;
          border-radius: 8px;
          padding: 12px;
          margin: 10px 0;
        }
        .postApplyRule {
          border-color: #15803d;
          background: #dcfce7;
          color: #14532d;
        }
        .blockerExitRule {
          border-color: #b45309;
          background: #fef3c7;
          color: #78350f;
        }
        .runtimeStageGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
          margin: 14px 0;
        }
        .runtimeStageCard {
          border: 1px solid #7dd3fc;
          border-radius: 12px;
          background: #fff;
          padding: 12px;
        }
        .runtimeStageCard h3 {
          margin: 0 0 6px;
          font-size: 14px;
        }
        .runtimeStageCard strong {
          display: block;
          color: #075985;
          font-size: 12px;
          margin-bottom: 8px;
          overflow-wrap: anywhere;
        }
        .runtimeCounts {
          margin: 14px 0;
          border: 1px solid #7dd3fc;
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
          background: #dbeafe;
          color: #1e3a8a;
          padding: 5px 8px;
          font-size: 12px;
          font-weight: 700;
        }
        .countPill.neutral {
          background: #e0f2fe;
          color: #075985;
        }
        .runtimeTableWrap {
          overflow: auto;
          width: min(100%, calc(100vw - 64px));
          max-width: 100%;
          max-height: 72vh;
          margin-top: 14px;
        }
        .runtimeTableWrap table {
          width: max-content;
          min-width: 1700px;
        }
      `}</style>
    </section>
  );
}
