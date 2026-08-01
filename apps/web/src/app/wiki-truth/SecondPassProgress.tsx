import type { WikiTruthSecondPassProgress } from "@/lib/wikiTruthSecondPass";

function boolText(value: boolean) {
  return value ? "да" : "нет";
}

function gateText(value: unknown) {
  if (value === true) return "да";
  if (value === false) return "нет";
  if (value == null || value === "") return "не подтверждено";
  return String(value);
}

export default function SecondPassProgress({
  progress,
}: {
  progress: WikiTruthSecondPassProgress;
}) {
  const gateComplete =
    progress.total_geo_count > 0 &&
    progress.processed_geo_count === progress.total_geo_count &&
    progress.goal_achieved === true;

  return (
    <section
      className="sectionCard secondPassProgress"
      data-testid="wiki-truth-second-pass-progress"
      data-total-geo-count={progress.total_geo_count}
      data-processed-geo-count={progress.processed_geo_count}
      data-fresh-search-count={progress.fresh_search_count}
      data-fresh-visual-review-count={progress.fresh_visual_review_count}
      data-goal-achieved={progress.goal_achieved ? "1" : "0"}
    >
      <h2>
        Truth-First proposal re-audit {progress.processed_geo_count}/
        {progress.total_geo_count}: gate status
      </h2>
      <p className="sectionHint">
        Данные поступают из текущего proposal reconciliation artifact. Browser,
        HTTP recheck и live-map capture считаются отдельно от сохранённого
        historical visual-law evidence; 307 обработанных строк не являются
        доказательством 307 текущих юридических проверок.
      </p>
      <p className={gateComplete ? "gate ok" : "gate pending"}>
        {gateComplete
          ? "GOAL_ACHIEVED=true"
          : "GOAL_ACHIEVED=false: текущая юридическая сверка содержит незакрытые расхождения или недоказанные источники."}
      </p>
      <div className="boundaryGrid progressGrid">
        <div>
          <strong>Total GEO</strong>
          <span>{progress.total_geo_count}</span>
        </div>
        <div>
          <strong>Processed GEO</strong>
          <span>{progress.processed_geo_count}</span>
        </div>
        <div>
          <strong>Fresh search</strong>
          <span>{progress.fresh_search_count}</span>
        </div>
        <div>
          <strong>Fresh visual review</strong>
          <span>{progress.fresh_visual_review_count}</span>
        </div>
        <div>
          <strong>Search work items</strong>
          <span>{progress.working_search_artifact_count}</span>
        </div>
        <div>
          <strong>Review work items</strong>
          <span>{progress.working_review_artifact_count}</span>
        </div>
        <div>
          <strong>Canonical evidence records</strong>
          <span>{progress.canonical_evidence_record_count}</span>
        </div>
        <div>
          <strong>Baseline screenshots</strong>
          <span>{progress.baseline_screenshot_count}</span>
        </div>
        <div>
          <strong>Proposal-only status changes</strong>
          <span>{progress.proposed_status_changes}</span>
        </div>
        <div>
          <strong>Proposal-only color changes</strong>
          <span>{progress.proposed_color_changes}</span>
        </div>
        <div>
          <strong>Status data changed</strong>
          <span>{boolText(progress.status_data_changed)}</span>
        </div>
        <div>
          <strong>Map colors changed</strong>
          <span>{boolText(progress.map_colors_changed)}</span>
        </div>
        <div>
          <strong>Production touched</strong>
          <span>{boolText(progress.production_touched)}</span>
        </div>
      </div>
      <details>
        <summary>Acceptance flags и локальные артефакты</summary>
        <div className="auditTrail">
          {Object.entries(progress.acceptance_flags || {}).map(([key, value]) => (
            <span key={key}>
              <strong>{key}</strong>: {gateText(value)}
            </span>
          ))}
          {Object.entries(progress.artifacts || {}).map(([key, value]) => (
            <span key={key}>
              <strong>{key}</strong>: {value}
            </span>
          ))}
        </div>
      </details>
      <style jsx>{`
        .secondPassProgress {
          margin-top: 28px;
        }
        .gate {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 10px 12px;
          font-weight: 700;
        }
        .gate.pending {
          border-color: #b45309;
          background: #fffbeb;
          color: #78350f;
        }
        .gate.ok {
          border-color: #15803d;
          background: #f0fdf4;
          color: #14532d;
        }
        .progressGrid {
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }
        .progressGrid span {
          display: block;
          margin-top: 4px;
          font-size: 22px;
          font-weight: 700;
          color: #0f172a;
        }
        .auditTrail {
          display: grid;
          gap: 6px;
          margin-top: 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11px;
          color: #475569;
        }
        .auditTrail span {
          overflow-wrap: anywhere;
        }
      `}</style>
    </section>
  );
}
