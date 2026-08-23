"use client";

import type {
  WikiTruthAuditModel,
  WikiTruthAuditRow,
} from "@/lib/wikiTruthAudit";
import OfficialOwnershipSummary from "./OfficialOwnershipSummary";
import OfficialOwnershipTable from "./OfficialOwnershipTable";
import SecondPassProgress from "./SecondPassProgress";
import CannabisLawMatrix from "./CannabisLawMatrix";
import CannabisLawAcceptanceAudit from "./CannabisLawAcceptanceAudit";
import CannabisLawColorTable from "./CannabisLawColorTable";
import CannabisLawColorApplyGate from "./CannabisLawColorApplyGate";
import CannabisLawColorApplyPlan from "./CannabisLawColorApplyPlan";
import CannabisLawColorProposals from "./CannabisLawColorProposals";
import CannabisLawColorReviewDossier from "./CannabisLawColorReviewDossier";
import CannabisLawLegalKnowledgeAxisMatrix from "./CannabisLawLegalKnowledgeAxisMatrix";
import CannabisLawPrimaryLawBlockers from "./CannabisLawPrimaryLawBlockers";
import CannabisLawRuntimeApplyPipeline from "./CannabisLawRuntimeApplyPipeline";
import CannabisLawFinalReconciliation from "./CannabisLawFinalReconciliation";
import CannabisStoreAudit from "./CannabisStoreAudit";
import GoalAcceptanceAudit from "./GoalAcceptanceAudit";
import type { WikiTruthAcceptanceAuditView } from "@/lib/wikiTruthAcceptanceAudit";
import type { WikiTruthColorComparisonRow } from "@/lib/wikiTruthColorComparison";
import type { WikiTruthColorApplyGateView } from "@/lib/wikiTruthColorApplyGate";
import type { WikiTruthColorApplyPlanView } from "@/lib/wikiTruthColorApplyPlan";
import type { WikiTruthColorProposalsView } from "@/lib/wikiTruthColorProposals";
import type { WikiTruthColorReviewDossierView } from "@/lib/wikiTruthColorReviewDossier";
import type { WikiTruthLegalKnowledgeAxisMatrixView } from "@/lib/wikiTruthLegalKnowledgeAxisMatrix";
import type { WikiTruthPrimaryLawBlockersView } from "@/lib/wikiTruthPrimaryLawBlockers";
import type { WikiTruthRuntimeApplyPipelineView } from "@/lib/wikiTruthRuntimeApplyPipeline";
import type { WikiTruthFinalReconciliationView } from "@/lib/wikiTruthFinalReconciliation";
import type { WikiTruthStoreAuditView } from "@/lib/wikiTruthStoreAudit";
import type { WikiTruthGoalAcceptanceView } from "@/lib/wikiTruthGoalAcceptance";
import type { TruthMapDatasetMeta } from "@/truth-map/truthMapSource";
import { ruAuditValue, ruBoolean, SUMMARY_LABELS } from "./wikiTruthRu";

function renderLinks(
  items: Array<{ url?: string; title?: string; isOfficial?: boolean }>,
) {
  if (!items.length) return "-";
  return (
    <div className="linkList">
      {items.map((item) => {
        const href = item.url || "";
        const label = item.title || item.url || "-";
        return href ? (
          <a
            key={`${href}-${label}`}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="link"
          >
            <span>
              {label}
              {item.isOfficial ? " · ОФИЦИАЛЬНЫЙ" : ""}
            </span>
            {label !== href ? (
              <span
                style={{ display: "block", fontSize: 11, color: "#6b7280" }}
              >
                {href}
              </span>
            ) : null}
          </a>
        ) : (
          <span key={label}>{label}</span>
        );
      })}
    </div>
  );
}

function renderOfficialSignal(row: WikiTruthAuditRow) {
  if (row.officialSignal === "strong") return "да (сильный)";
  if (row.officialSignal === "weak") return "да (слабый)";
  if (row.officialSignal === "fallback") return "только резервный";
  return "нет";
}

function renderFlags(flags: string[]) {
  if (!flags.length) return "-";
  return (
    <div className="flagList">
      {flags.map((flag) => (
        <span key={flag} className="flagPill">
          {ruAuditValue(flag)}
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
      <td className="colStatus">{ruAuditValue(row.wikiStatus)}</td>
      <td className="colStatus">{ruAuditValue(row.finalStatus)}</td>
      <td className="colMeta">{ruAuditValue(row.truthSourceLabel)}</td>
      <td className="colMeta">{ruAuditValue(row.statusOverrideReason)}</td>
      <td className="colMeta">{row.snapshotId}</td>
      <td className="colDelta">{ruAuditValue(row.delta)}</td>
      <td className="colMeta">{row.ruleId}</td>
      <td className="colMeta">{ruBoolean(row.evidenceDeltaApproved)}</td>
      <td className="colUrl">
        {row.wikiPageUrl !== "-" ? (
          <a
            href={row.wikiPageUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="link"
          >
            {row.wikiPageUrl}
          </a>
        ) : (
          "-"
        )}
      </td>
      <td className="colLinks">{renderLinks(row.sources)}</td>
      <td className="colLinks">{renderLinks(row.officialSources)}</td>
      <td className="colMeta">{ruAuditValue(row.evidenceDelta)}</td>
      <td className="colMeta">{ruAuditValue(row.evidenceSourceType)}</td>
      <td className="colNotes">{row.triggerPhraseExcerpt}</td>
      <td className="colNotes">{row.wikiNotes}</td>
      <td className="colNotes">{row.notesText}</td>
      <td className="colNotes">{row.notesExplainability}</td>
      <td className="colNotes">{row.contextNote}</td>
      <td className="colNotes">{row.enforcementNote}</td>
      <td className="colNotes">{row.socialRealityNote}</td>
      <td className="colFlags">{renderFlags(row.flags)}</td>
    </tr>
  );
}

export default function WikiTruthTable({
  audit,
  acceptanceAudit,
  colorComparison,
  colorApplyGate,
  colorApplyPlan,
  colorProposals,
  colorReviewDossier,
  legalKnowledgeAxisMatrix,
  primaryLawBlockers,
  runtimeApplyPipeline,
  finalReconciliation,
  truthMapDisplay,
  storeAudit,
  goalAcceptance,
}: {
  audit: WikiTruthAuditModel;
  acceptanceAudit: WikiTruthAcceptanceAuditView;
  colorComparison: WikiTruthColorComparisonRow[];
  colorApplyGate: WikiTruthColorApplyGateView;
  colorApplyPlan: WikiTruthColorApplyPlanView;
  colorProposals: WikiTruthColorProposalsView;
  colorReviewDossier: WikiTruthColorReviewDossierView;
  legalKnowledgeAxisMatrix: WikiTruthLegalKnowledgeAxisMatrixView;
  primaryLawBlockers: WikiTruthPrimaryLawBlockersView;
  runtimeApplyPipeline: WikiTruthRuntimeApplyPipelineView;
  finalReconciliation: WikiTruthFinalReconciliationView;
  truthMapDisplay: TruthMapDatasetMeta;
  storeAudit: WikiTruthStoreAuditView;
  goalAcceptance: WikiTruthGoalAcceptanceView;
}) {
  return (
    <div className="auditView">
      <section className="cards" data-testid="wiki-truth-summary">
        {audit.summaryCards.map((card) => (
          <article
            key={card.id}
            className="card"
            data-testid={`summary-${card.id.toLowerCase()}`}
          >
            <h2>{SUMMARY_LABELS[card.id]?.title || card.title}</h2>
            <div className="numbers">
              <strong>
                {card.covered} / {card.total}
              </strong>
              <span>не хватает: {card.missing}</span>
            </div>
            <div className="meta">
              SSOT: {SUMMARY_LABELS[card.id]?.source || card.sourceOfTruth}
            </div>
            <div className="meta">
              Правило: {SUMMARY_LABELS[card.id]?.rule || card.inclusionRule}
            </div>
          </article>
        ))}
      </section>

      <section
        className="issueBar"
        data-testid="wiki-truth-issues"
        data-official-ownership-missing={
          audit.issueCounters.officialSourcesMissing
        }
      >
        <span>РАСХОЖДЕНИЕ СТАТУСА: {audit.issueCounters.statusMismatch}</span>
        <span>НЕТ ИТОГОВОЙ СТРОКИ: {audit.issueCounters.noOurRow}</span>
        <span>
          НЕТ ПРИВЯЗКИ ВЛАДЕЛЬЦА ОФИЦИАЛЬНОЙ ССЫЛКИ:{" "}
          {audit.issueCounters.officialSourcesMissing}
        </span>
        <span>НЕТ ИСТОЧНИКОВ: {audit.issueCounters.sourcesMissing}</span>
        <span>НЕТ ПРИМЕЧАНИЙ WIKI: {audit.issueCounters.wikiNotesMissing}</span>
      </section>

      <SecondPassProgress progress={audit.secondPassProgress} />

      <CannabisLawFinalReconciliation
        reconciliation={finalReconciliation}
        truthMapDisplay={truthMapDisplay}
      />

      <CannabisStoreAudit audit={storeAudit} />

      <GoalAcceptanceAudit acceptance={goalAcceptance} />

      <CannabisLawMatrix matrix={audit.cannabisLawMatrix} />

      <CannabisLawColorTable rows={colorComparison} />

      <CannabisLawAcceptanceAudit acceptance={acceptanceAudit} />

      <CannabisLawPrimaryLawBlockers blockers={primaryLawBlockers} />

      <CannabisLawColorProposals proposals={colorProposals} />

      <CannabisLawColorApplyPlan plan={colorApplyPlan} />

      <CannabisLawColorReviewDossier dossier={colorReviewDossier} />

      <CannabisLawLegalKnowledgeAxisMatrix matrix={legalKnowledgeAxisMatrix} />

      <CannabisLawColorApplyGate gate={colorApplyGate} />

      <CannabisLawRuntimeApplyPipeline pipeline={runtimeApplyPipeline} />

      <details className="secondaryAuditGroup">
        <summary>Официальный реестр и владение ссылками</summary>
        <OfficialOwnershipSummary view={audit.officialOwnershipView} />
        <OfficialOwnershipTable view={audit.officialOwnershipView} />
      </details>

      <details className="secondaryAuditGroup">
        <summary>Вторичная таблица стран Wiki/SSOT</summary>
        <section>
          <h2>Полная таблица стран Wiki/SSOT</h2>
          <p className="sectionHint">
            Нормализованные строки на основе SSOT. Это отдельная вселенная строк
            стран Wikipedia, а не копия матрицы 307 GEO. Расхождения вынесены в
            диагностический срез ниже.
          </p>
          <div
            className="tableWrap"
            style={{
              overflowX: "auto",
              width: "min(100%, calc(100vw - 64px))",
              maxWidth: "100%",
            }}
          >
            <table
              className="truthTable"
              data-testid="wiki-truth-table"
              style={{ width: "max-content", minWidth: 3200 }}
            >
              <thead>
                <tr>
                  <th
                    className="stickyCol1 colGeo"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    ISO2/Geo
                  </th>
                  <th
                    className="stickyCol2 colCountry"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    Страна
                  </th>
                  <th className="colStatus" style={{ whiteSpace: "nowrap" }}>
                    Рекр. (Wiki)
                  </th>
                  <th className="colStatus" style={{ whiteSpace: "nowrap" }}>
                    Мед. (Wiki)
                  </th>
                  <th className="colStatus" style={{ whiteSpace: "nowrap" }}>
                    Рекр. (итог)
                  </th>
                  <th className="colStatus" style={{ whiteSpace: "nowrap" }}>
                    Мед. (итог)
                  </th>
                  <th className="colMeta" style={{ whiteSpace: "nowrap" }}>
                    Категория карты
                  </th>
                  <th className="colMeta" style={{ whiteSpace: "nowrap" }}>
                    Основание правила
                  </th>
                  <th className="colMeta" style={{ whiteSpace: "nowrap" }}>
                    Причина переопределения
                  </th>
                  <th className="colMeta" style={{ whiteSpace: "nowrap" }}>
                    Снимок
                  </th>
                  <th className="colDelta" style={{ whiteSpace: "nowrap" }}>
                    Изменение
                  </th>
                  <th className="colMeta" style={{ whiteSpace: "nowrap" }}>
                    ID правила
                  </th>
                  <th className="colMeta" style={{ whiteSpace: "nowrap" }}>
                    Переопределение одобрено
                  </th>
                  <th className="colLinks" style={{ whiteSpace: "nowrap" }}>
                    Источники
                  </th>
                  <th className="colMeta" style={{ whiteSpace: "nowrap" }}>
                    Официальный
                  </th>
                  <th
                    className="colOfficialLinks"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    Официальная ссылка
                  </th>
                  <th className="colMeta" style={{ whiteSpace: "nowrap" }}>
                    Изменение доказательств
                  </th>
                  <th className="colMeta" style={{ whiteSpace: "nowrap" }}>
                    Источник доказательства
                  </th>
                  <th className="colNotes" style={{ whiteSpace: "nowrap" }}>
                    Ключевая фраза
                  </th>
                  <th className="colNotes" style={{ whiteSpace: "nowrap" }}>
                    Примечания Wiki
                  </th>
                  <th className="colNotes" style={{ whiteSpace: "nowrap" }}>
                    Нормализованные примечания
                  </th>
                  <th className="colNotes" style={{ whiteSpace: "nowrap" }}>
                    Объяснение примечаний
                  </th>
                  <th className="colNotes" style={{ whiteSpace: "nowrap" }}>
                    Контекст
                  </th>
                  <th className="colNotes" style={{ whiteSpace: "nowrap" }}>
                    Правоприменение
                  </th>
                  <th className="colNotes" style={{ whiteSpace: "nowrap" }}>
                    Практическая ситуация
                  </th>
                  <th className="colMeta" style={{ whiteSpace: "nowrap" }}>
                    Длина примечания
                  </th>
                  <th className="colMeta" style={{ whiteSpace: "nowrap" }}>
                    Качество примечания
                  </th>
                  <th className="colFlags" style={{ whiteSpace: "nowrap" }}>
                    Флаги расхождений
                  </th>
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
                    data-evidence-delta-approved={
                      row.evidenceDeltaApproved ? "1" : "0"
                    }
                  >
                    <td className="stickyCol1 stickyCell colGeo">
                      {row.geoKey}
                    </td>
                    <td className="stickyCol2 stickyCell colCountry">
                      {row.country}
                    </td>
                    <td className="colStatus">{ruAuditValue(row.wikiRec)}</td>
                    <td className="colStatus">{ruAuditValue(row.wikiMed)}</td>
                    <td className="colStatus">{ruAuditValue(row.finalRec)}</td>
                    <td className="colStatus">{ruAuditValue(row.finalMed)}</td>
                    <td className="colMeta">
                      {ruAuditValue(row.finalMapCategory)}
                    </td>
                    <td className="colMeta">
                      {ruAuditValue(row.truthSourceLabel)}
                    </td>
                    <td className="colMeta">
                      {ruAuditValue(row.statusOverrideReason)}
                    </td>
                    <td className="colMeta">{row.snapshotId}</td>
                    <td className="colDelta">{ruAuditValue(row.delta)}</td>
                    <td className="colMeta">{row.ruleId}</td>
                    <td className="colMeta">
                      {ruBoolean(row.evidenceDeltaApproved)}
                    </td>
                    <td className="colLinks">{renderLinks(row.sources)}</td>
                    <td className="colMeta">{renderOfficialSignal(row)}</td>
                    <td className="colOfficialLinks">
                      {renderLinks(row.officialSources)}
                    </td>
                    <td className="colMeta">
                      {ruAuditValue(row.evidenceDelta)}
                    </td>
                    <td className="colMeta">
                      {ruAuditValue(row.evidenceSourceType)}
                    </td>
                    <td className="colNotes">{row.triggerPhraseExcerpt}</td>
                    <td className="colNotes">{row.wikiNotes}</td>
                    <td className="colNotes">{row.notesText}</td>
                    <td className="colNotes">{row.notesExplainability}</td>
                    <td className="colNotes">{row.contextNote}</td>
                    <td className="colNotes">{row.enforcementNote}</td>
                    <td className="colNotes">{row.socialRealityNote}</td>
                    <td className="colMeta">{row.notesLen}</td>
                    <td className="colMeta">
                      {ruAuditValue(row.notesQuality)}
                    </td>
                    <td className="colFlags">
                      {renderFlags(row.mismatchFlags)}
                    </td>
                  </tr>
                ))}
                {!audit.allRows.length ? (
                  <tr>
                    <td colSpan={28}>Строк не найдено.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </details>

      <details className="secondaryAuditGroup">
        <summary>Расхождения Wiki/SSOT</summary>
        <section>
          <h2>Расхождения аудита</h2>
          <p className="sectionHint">
            Только существенные расхождения. Остатки парсера, пустые ISO и
            проблемы псевдонимов остаются в диагностике.
          </p>
          {audit.mainRows.length ? (
            <div className="tableWrap">
              <table
                className="truthTable"
                data-testid="wiki-truth-audit-table"
              >
                <thead>
                  <tr>
                    <th className="stickyCol1 colGeo">ISO2/Geo</th>
                    <th className="stickyCol2 colCountry">Страна</th>
                    <th className="colStatus">Статус Wiki</th>
                    <th className="colStatus">Итоговый статус</th>
                    <th className="colMeta">Основание правила</th>
                    <th className="colMeta">Причина переопределения</th>
                    <th className="colMeta">Снимок</th>
                    <th className="colDelta">Изменение</th>
                    <th className="colMeta">ID правила</th>
                    <th className="colMeta">Переопределение одобрено</th>
                    <th className="colUrl">Страница Wiki</th>
                    <th className="colLinks">Источники</th>
                    <th className="colOfficialLinks">Официальные источники</th>
                    <th className="colMeta">Изменение доказательств</th>
                    <th className="colMeta">Источник доказательства</th>
                    <th className="colNotes">Ключевая фраза</th>
                    <th className="colNotes">Примечания Wiki</th>
                    <th className="colNotes">Нормализованные примечания</th>
                    <th className="colNotes">Объяснение примечаний</th>
                    <th className="colNotes">Контекст</th>
                    <th className="colNotes">Правоприменение</th>
                    <th className="colNotes">Практическая ситуация</th>
                    <th className="colFlags">Флаги</th>
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
              Расхождений аудита не обнаружено.
            </p>
          )}
        </section>
      </details>

      <details className="secondaryAuditGroup">
        <summary>Пробелы покрытия по отдельным вселенным</summary>
        <section>
          <h2>Проверка стран ISO</h2>
          <p className="sectionHint">
            Раздел объясняет, почему число стран ISO отличается от числа строк
            стран Wikipedia. Это ожидаемые непокрытые страны, а не мусорные
            строки основной таблицы.
          </p>
          <div className="tableWrap">
            <table className="truthTable" data-testid="missing-coverage-table">
              <thead>
                <tr>
                  <th>ISO2</th>
                  <th>Страна</th>
                  <th>Причина</th>
                  <th>Ожидаемая страница Wiki</th>
                  <th>Подсказка по источнику</th>
                </tr>
              </thead>
              <tbody>
                {audit.uncoveredCountries.map((row) => (
                  <tr key={`missing-${row.geo}`}>
                    <td>{row.geo}</td>
                    <td>{row.name}</td>
                    <td>{ruAuditValue(row.reason)}</td>
                    <td>
                      {row.expectedWikiUrl ? (
                        <div className="linkList">
                          <span>{row.expectedWikiTitle || "-"}</span>
                          <a
                            href={row.expectedWikiUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="link"
                          >
                            {row.expectedWikiUrl}
                          </a>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{ruAuditValue(row.expectedSourceHint)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>Покрытие штатов США</h2>
          <p className="sectionHint">
            Покрыто: {audit.usStates.covered} / {audit.usStates.total}. Не
            хватает: {audit.usStates.missing}
          </p>
          {audit.usStates.rows.length ? (
            <div className="tableWrap">
              <table className="truthTable" data-testid="missing-states">
                <thead>
                  <tr>
                    <th>GEO</th>
                    <th>Название</th>
                    <th>Причина</th>
                    <th>Подсказка по источнику</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.usStates.rows.map((row) => (
                    <tr key={row.geo}>
                      <td>{row.geo}</td>
                      <td>{row.name}</td>
                      <td>{ruAuditValue(row.missing_reason)}</td>
                      <td>{ruAuditValue(row.expected_source_hint)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section>
          <h2>Покрытие справочника SSOT</h2>
          <p className="sectionHint">
            Покрыто: {audit.ssotCoverage.covered} / {audit.ssotCoverage.total}.
            Не хватает: {audit.ssotCoverage.missing}
          </p>
          {audit.ssotCoverage.rows.length ? (
            <div className="tableWrap">
              <table
                className="truthTable"
                data-testid="uncovered-jurisdictions-table"
              >
                <thead>
                  <tr>
                    <th>GEO</th>
                    <th>Название</th>
                    <th>Тип</th>
                    <th>Причина</th>
                    <th>Подсказка по источнику</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.ssotCoverage.rows.map((row) => (
                    <tr key={`ssot-${row.geo}`}>
                      <td>{row.geo}</td>
                      <td>{row.name}</td>
                      <td>{ruAuditValue(row.type)}</td>
                      <td>{ruAuditValue(row.reason)}</td>
                      <td>{ruAuditValue(row.expectedSourceHint)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </details>

      <details className="diagnostics" data-testid="wiki-truth-diagnostics">
        <summary>Техническая диагностика</summary>
        <div className="diagBlock">
          <h3>Мусорные строки</h3>
          <div>
            пустой ISO={audit.diagnostics.emptyIsoCount} · не ISO=
            {audit.diagnostics.nonIsoCount} · дубли=
            {audit.diagnostics.duplicateCount}
          </div>
          <ul>
            {audit.diagnostics.garbageRows.map((row) => (
              <li key={`${row.country}-${row.iso2}-${row.reason}`}>
                {row.country} [{row.iso2}] {"→"} {ruAuditValue(row.reason)}
              </li>
            ))}
          </ul>
        </div>
        <div className="diagBlock">
          <h3>Диагностика псевдонимов</h3>
          <div className="tableWrap">
            <table className="truthTable" data-testid="alias-diagnostics-table">
              <thead>
                <tr>
                  <th>ISO2</th>
                  <th>Страна</th>
                  <th>Каноническое название</th>
                  <th>Псевдоним Wiki</th>
                  <th>Ожидаемое название</th>
                  <th>Причина</th>
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
                    <td>{ruAuditValue(row.reason)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="diagBlock">
          <h3>Отсутствующие строки Wiki</h3>
          <div className="tableWrap">
            <table className="truthTable" data-testid="missing-wiki-rows-table">
              <thead>
                <tr>
                  <th>ISO2</th>
                  <th>Страна</th>
                  <th>Ожидаемое название</th>
                  <th>Ожидаемая страница Wiki</th>
                  <th>Причина</th>
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
                        <a
                          href={row.expectedWikiUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="link"
                        >
                          {row.expectedWikiUrl}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{ruAuditValue(row.reason)}</td>
                  </tr>
                ))}
                {!audit.diagnostics.missingWikiRows.length ? (
                  <tr>
                    <td colSpan={5}>Отсутствующих строк Wiki не обнаружено.</td>
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
        .secondaryAuditGroup {
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: #f8fafc;
          padding: 12px;
        }
        .secondaryAuditGroup > summary {
          cursor: pointer;
          font-weight: 700;
          color: #334155;
        }
        .secondaryAuditGroup[open] > summary {
          margin-bottom: 12px;
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

        @media print {
          .tableWrap {
            overflow-x: visible !important;
            overflow-y: visible !important;
            width: auto !important;
            max-width: none !important;
          }

          .truthTable {
            width: auto !important;
            min-width: 0 !important;
            max-width: none !important;
            table-layout: auto !important;
            font-size: 10px !important;
          }

          th,
          td {
            max-width: none !important;
            white-space: normal !important;
            word-break: break-word !important;
            overflow: visible !important;
          }

          .stickyCol1,
          .stickyCol2,
          .stickyCell,
          th {
            position: static !important;
            left: auto !important;
          }

          .colGeo,
          .colCountry,
          .colStatus,
          .colLinks,
          .colOfficialLinks,
          .colNotes,
          .colMeta,
          .colDelta,
          .colUrl,
          .colFlags {
            min-width: auto !important;
            width: auto !important;
          }
        }
      `}</style>
    </div>
  );
}
