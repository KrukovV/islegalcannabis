"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type {
  WikiTruthCannabisLawLink,
  WikiTruthCannabisLawMatrix,
  WikiTruthCannabisLawRow,
} from "@/lib/wikiTruthCannabisLawMatrix";
import {
  ruAuditDifferenceStatus,
  ruAuditValue,
  ruDifferenceEvidenceSummary,
  ruOfficialStatusLine,
  ruProjectStatusLine,
} from "./wikiTruthRu";

function renderStatus(
  status:
    | WikiTruthCannabisLawRow["projectStatus"]
    | WikiTruthCannabisLawRow["officialStatus"],
  missingLabel: string,
  sourceType: "project" | "official" = "project",
) {
  if (!status && sourceType === "official") {
    return ruOfficialStatusLine(null, `рекреационный=${ruAuditValue("unknown")}; медицинский=${ruAuditValue("unknown")}; применение=${ruAuditValue("unknown")}`);
  }
  if (!status) return missingLabel;
  if (sourceType === "official") {
    return ruOfficialStatusLine(status, missingLabel);
  }
  return ruProjectStatusLine(status, missingLabel);
}

function linkHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function faviconUrl(url: string) {
  const hostname = linkHostname(url);
  if (!hostname) return "";
  return `/api/favicon?domain=${encodeURIComponent(hostname)}`;
}

function renderLinks(
  items: WikiTruthCannabisLawLink[],
  mode: "verified" | "fresh" | "candidate" | "context" | "supplemental",
) {
  if (!items.length) return "-";
  const content = (
    <div className="linkList">
      {items.map((item) => (
        <div key={`${mode}:${item.url}`} className={`linkItem ${mode}`}>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="link sourceLink"
          >
            <span className="sourceTitleLine">
              {faviconUrl(item.url) ? (
                <Image
                  src={faviconUrl(item.url)}
                  alt=""
                  aria-hidden="true"
                  className="sourceFavicon"
                  width={16}
                  height={16}
                  unoptimized
                />
              ) : null}
              <span>{item.title}</span>
            </span>
            <span className="url">{item.url}</span>
          </a>
          <span className="meta">
            проверка: {ruAuditValue(item.verification)}; уверенность:{" "}
            {ruAuditValue(item.confidence)}
          </span>
          {item.note ? <span className="meta">{item.note}</span> : null}
          {item.screenshotPath ? (
            <span className="screenshot">Снимок: {item.screenshotPath}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
  if (mode === "verified" || mode === "fresh") return content;
  return (
    <details>
      <summary>
        {items.length}{" "}
        {mode === "candidate"
          ? "непроверенных ссылок-кандидатов"
          : mode === "context"
            ? "контекстных ссылок"
            : "дополнительных официальных ссылок повторного аудита"}
      </summary>
      {content}
    </details>
  );
}

function coverageLabel(value: WikiTruthCannabisLawRow["sourceCoverage"]) {
  const labels: Record<WikiTruthCannabisLawRow["sourceCoverage"], string> = {
    VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW: "ЗАКОН ПРОВЕРЕН ВРУЧНУЮ",
    OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW:
      "ОФИЦИАЛЬНЫЙ URL; ПРОСМОТР ЗАБЛОКИРОВАН ИЛИ ОЖИДАЕТСЯ",
    CANDIDATE_LINKS_AWAITING_VISUAL_REVIEW: "НЕПРОВЕРЕННЫЕ ССЫЛКИ-КАНДИДАТЫ",
    OFFICIAL_CONTEXT_ONLY: "ТОЛЬКО ОФИЦИАЛЬНЫЙ КОНТЕКСТ",
    NO_CANDIDATE_PAGE_FOUND: "ПРЯМАЯ СТРАНИЦА НЕ НАЙДЕНА",
  };
  return labels[value];
}

export default function CannabisLawMatrix({
  matrix,
}: {
  matrix: WikiTruthCannabisLawMatrix;
}) {
  const [query, setQuery] = useState("");
  const [coverage, setCoverage] = useState<
    "ALL" | WikiTruthCannabisLawRow["sourceCoverage"]
  >("ALL");
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRows = useMemo(
    () =>
      matrix.rows.filter((row) => {
        const matchesQuery =
          !normalizedQuery ||
          `${row.geo} ${row.territory}`
            .toLocaleLowerCase()
            .includes(normalizedQuery);
        const matchesCoverage =
          coverage === "ALL" || row.sourceCoverage === coverage;
        const matchesDifference =
          !differencesOnly ||
          ![
            "MATCH",
            "MATCH_WITH_SCOPE_NOTE",
            "MATCH_WITH_MEDICAL_SCOPE_NOTE",
          ].includes(row.differenceStatus);
        return matchesQuery && matchesCoverage && matchesDifference;
      }),
    [coverage, differencesOnly, matrix.rows, normalizedQuery],
  );
  const directLinkCount = matrix.rows.reduce(
    (total, row) => total + row.directOfficialCannabisLawLinks.length,
    0,
  );
  const contextLinkCount = matrix.rows.reduce(
    (total, row) => total + row.officialContextLinks.length,
    0,
  );
  const supplementalLinkCount = matrix.rows.reduce(
    (total, row) => total + row.supplementalOfficialLinks.length,
    0,
  );
  const allPublishedLinkCount =
    directLinkCount + contextLinkCount + supplementalLinkCount;

  return (
    <section
      className="sectionCard cannabisMatrix"
      data-testid="cannabis-law-matrix-307"
      data-official-url-geos={matrix.counts.rowsWithPublishedOfficialLinks}
      data-no-project-status={matrix.counts.noProjectStatus}
      data-supplemental-official-links={supplementalLinkCount}
      data-all-published-official-links={allPublishedLinkCount}
    >
      <h2>
        Ручная проверка официальных законов о каннабисе: все{" "}
        {matrix.counts.total} территорий
      </h2>
      <p className="sectionHint">
        Полная матрица из {matrix.counts.total} GEO: прямые нормы, официальный контекст и честные
        отрицательные результаты разделены.
      </p>
      <p className="sectionHint">
        Здесь показаны все {matrix.counts.total} строк каннабис-матрицы и все официальные URL по ним.
        Важно не смешивать эти цифры с карточкой «Покрытие GEO официальными ссылками» в
        сводке: там считается отдельная вселенная для ISO-страна через
        official_link_ownership.
      </p>
      <p className="sectionMeta" style={{ fontSize: 11, color: "#475569" }}>
        Последнее обновление матрицы: {matrix.generatedAt || "—"}; база
        источников: {matrix.sourceCorpusGeneratedAt || "—"}
      </p>
      <p className="hardRule">
        Ручная проверка означает, что официальный материал открыт и просмотрен
        глазами. Ссылка считается подтверждённым правовым доказательством только
        после сохранения снимка cannabis-специфичного фрагмента. Завершённая
        проверка может честно закончиться результатом «прямая страница не
        найдена» или «только контекст».
      </p>
      <div className="boundaryGrid matrixCounters">
        <div>
          <strong>Всего строк GEO</strong>
          <div>{matrix.counts.total}</div>
        </div>
        <div>
          <strong>Ручных проверок завершено</strong>
          <div>{matrix.counts.manualVisualReviewComplete}</div>
        </div>
        <div>
          <strong>Подтверждённых страниц законов</strong>
          <div>{matrix.counts.visuallyVerifiedOfficialCannabisLaw}</div>
        </div>
        <div>
          <strong>Проверено: прямая страница не найдена</strong>
          <div>{matrix.counts.visuallyReviewedNoDirectPageFound}</div>
        </div>
        <div>
          <strong>Проверено: только официальный контекст</strong>
          <div>{matrix.counts.visuallyReviewedOfficialContextOnly}</div>
        </div>
        <div>
          <strong>Осталось ручных проверок</strong>
          <div>{matrix.counts.visualReviewRemaining}</div>
        </div>
        <div>
          <strong>Официальных URL ожидают просмотра</strong>
          <div>{matrix.counts.officialSourceAwaitingVisualReview}</div>
        </div>
        <div>
          <strong>Строк-кандидатов ожидают просмотра</strong>
          <div>{matrix.counts.candidateRowsAwaitingVisualReview}</div>
        </div>
        <div>
          <strong>Только официальный контекст</strong>
          <div>{matrix.counts.officialContextOnly}</div>
        </div>
        <div>
          <strong>Прямая страница не найдена</strong>
          <div>{matrix.counts.noCandidatePageFound}</div>
        </div>
        <div>
          <strong>Сырых сигналов парсера (сами по себе не конфликт)</strong>
          <div>{matrix.counts.rawParserSignalRows}</div>
        </div>
        <div>
          <strong>Строк с кодом PROJECT_STATUS_MISMATCH</strong>
          <div>{matrix.counts.projectStatusMismatch}</div>
        </div>
        <div>
          <strong>Строк без статуса проекта</strong>
          <div>{matrix.counts.noProjectStatus}</div>
        </div>
        <div>
          <strong>Сохранение снимка заблокировано</strong>
          <div>{matrix.counts.visualCaptureBlocked}</div>
        </div>
        <div>
          <strong>Опубликованных прямых официальных URL</strong>
          <div>{directLinkCount}</div>
        </div>
        <div>
          <strong>Опубликованных официальных контекстных URL</strong>
          <div>{contextLinkCount}</div>
        </div>
        <div>
          <strong>Дополнительных официальных URL повторного аудита</strong>
          <div>{supplementalLinkCount}</div>
        </div>
        <div>
          <strong>Всего опубликованных официальных URL</strong>
          <div>{allPublishedLinkCount}</div>
        </div>
        <div>
          <strong>GEO с опубликованным официальным URL</strong>
          <div>
            {matrix.counts.rowsWithPublishedOfficialLinks} /{" "}
            {matrix.counts.total}
          </div>
        </div>
      </div>
      <div className="matrixToolbar" aria-label="Фильтры матрицы законов о каннабисе">
        <label>
          <span>Найти GEO или территорию</span>
          <input
            suppressHydrationWarning
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="например: BF, Maine, Venezuela"
          />
        </label>
        <label>
          <span>Тип доказательства</span>
          <select
            value={coverage}
            onChange={(event) =>
              setCoverage(event.target.value as typeof coverage)
            }
          >
            <option value="ALL">Все типы</option>
            <option value="VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW">
              Прямая страница закона
            </option>
            <option value="OFFICIAL_CONTEXT_ONLY">
              Только официальный контекст
            </option>
            <option value="NO_CANDIDATE_PAGE_FOUND">
              Прямая страница не найдена
            </option>
            <option value="OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW">
              Официальный URL ожидает просмотра
            </option>
            <option value="CANDIDATE_LINKS_AWAITING_VISUAL_REVIEW">
              Кандидат ожидает просмотра
            </option>
          </select>
        </label>
        <label className="checkLabel">
          <input
            suppressHydrationWarning
            type="checkbox"
            checked={differencesOnly}
            onChange={(event) => setDifferencesOnly(event.target.checked)}
          />
          <span>Только расхождения и замечания</span>
        </label>
        <strong className="showing">
          Показано {visibleRows.length} / {matrix.rows.length}
        </strong>
      </div>
      <div className="tableWrap matrixTableWrap">
        <table className="truthTable matrixTable">
          <thead>
            <tr>
              <th className="stickyCol1 colGeo">GEO</th>
              <th className="stickyCol2 colCountry">Территория</th>
              <th className="colStatus">
                Статус проекта и официальный вывод по тем же осям
              </th>
              <th className="colMeta">Покрытие доказательствами</th>
              <th className="colOfficialLinks">
                Официальные доказательства, контекст и повторный аудит
              </th>
              <th className="colNotes">Сравнение и причина</th>
              <th className="colNotes">Проверка снимков</th>
              <th className="colNotes">Диагностика парсера</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.geo}
                data-geo={row.geo}
                data-difference-status={row.differenceStatus}
              >
                <td className="stickyCol1 stickyCell colGeo">{row.geo}</td>
                <td className="stickyCol2 stickyCell colCountry">
                  {row.territory}
                </td>
                <td className="colStatus">
                  <strong>Проект</strong>
                  <span className="statusLine">
                    {renderStatus(
                      row.projectStatus,
                      "НЕТ СТРОКИ СТАТУСА ПРОЕКТА",
                      "project",
                    )}
                  </span>
                  <strong>Официальный вывод по источникам</strong>
                  <span className="statusLine">
                    {renderStatus(
                      row.officialStatus,
                      "ОФИЦИАЛЬНЫЙ СТАТУС НЕ ПОДТВЕРЖДЁН ВРУЧНУЮ",
                      "official",
                    )}
                  </span>
                </td>
                <td className="colMeta">
                  <span className={`coverage ${row.sourceCoverage}`}>
                    {coverageLabel(row.sourceCoverage)}
                  </span>
                </td>
                <td className="colOfficialLinks">
                  {renderLinks(row.directOfficialCannabisLawLinks, "verified")}
                  {row.freshSecondPassOfficialLinks?.length
                    ? renderLinks(row.freshSecondPassOfficialLinks, "fresh")
                    : null}
                  {renderLinks(row.officialContextLinks, "context")}
                  {renderLinks(
                    row.supplementalOfficialLinks,
                    "supplemental",
                  )}
                  {renderLinks(
                    row.candidateLinksAwaitingVisualReview,
                    "candidate",
                  )}
                </td>
                <td className="colNotes">
                  <strong>{ruAuditDifferenceStatus(row.differenceStatus)}</strong>
                  <span className="reviewNote">
                    <span className="reviewLine">
                      <strong>Честный вывод:</strong>{" "}
                      {ruDifferenceEvidenceSummary(row)}
                    </span>
                    <details>
                      <summary>
                        Техническая сверка осей и исходный журнал
                      </summary>
                      <span className="reviewLine">
                        <strong>Проект:</strong> {renderStatus(row.projectStatus, "—")}
                      </span>
                      <span className="reviewLine">
                        <strong>Официальный вывод:</strong>{" "}
                        {renderStatus(row.officialStatus, "—", "official")}
                      </span>
                      <span className="reviewNote">
                        {row.differenceDescription || "—"}
                      </span>
                    </details>
                  </span>
                </td>
                <td className="colNotes">
                  <strong>{ruAuditValue(row.visualReviewStatus)}</strong>
                  <span className="reviewNote">{row.reviewNotes}</span>
                  {row.screenshotPaths.length ? (
                    <details>
                      <summary>{row.screenshotPaths.length} снимков</summary>
                      {row.screenshotPaths.map((screenshotPath) => (
                        <span className="screenshot" key={screenshotPath}>
                          {screenshotPath}
                        </span>
                      ))}
                    </details>
                  ) : null}
                </td>
                <td className="colNotes">
                  {row.parserSignals.length ? (
                    <details>
                      <summary>
                        {row.parserSignals.length} сырых сигналов
                      </summary>
                      {row.parserSignals.join("; ")}
                    </details>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style jsx>{`
        .cannabisMatrix {
          margin-top: 28px;
        }
        .hardRule {
          border: 1px solid #b45309;
          background: #fffbeb;
          color: #78350f;
          border-radius: 8px;
          padding: 12px;
        }
        .matrixCounters {
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
        .matrixToolbar {
          position: sticky;
          top: 0;
          z-index: 12;
          display: grid;
          grid-template-columns: minmax(220px, 1fr) minmax(
              220px,
              1fr
            ) auto auto;
          align-items: end;
          gap: 12px;
          margin: 14px 0;
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: rgba(248, 250, 252, 0.98);
        }
        .matrixToolbar label {
          display: grid;
          gap: 5px;
          font-size: 12px;
          color: #475569;
        }
        .matrixToolbar input[type="text"],
        .matrixToolbar input:not([type]),
        .matrixToolbar select {
          min-height: 38px;
          border: 1px solid #94a3b8;
          border-radius: 7px;
          background: #fff;
          padding: 7px 9px;
          color: #0f172a;
        }
        .checkLabel {
          grid-template-columns: auto 1fr;
          align-items: center;
          min-height: 38px;
        }
        .showing {
          align-self: center;
          white-space: nowrap;
          color: #0f172a;
        }
        .matrixTableWrap {
          overflow: auto;
          width: min(100%, calc(100vw - 64px));
          max-width: 100%;
          max-height: 78vh;
        }
        .matrixTable {
          width: max-content;
          min-width: 2050px;
        }
        .linkList,
        .linkItem {
          display: grid;
          gap: 6px;
        }
        .linkItem {
          border-left: 3px solid #94a3b8;
          padding: 8px;
          background: #f8fafc;
        }
        .linkItem.verified {
          border-left-color: #15803d;
          background: #f0fdf4;
        }
        .linkItem.candidate {
          border-left-color: #d97706;
          background: #fffbeb;
        }
        .link {
          color: #075985;
          overflow-wrap: anywhere;
        }
        .sourceLink {
          display: grid;
          gap: 3px;
          text-decoration: none;
        }
        .sourceLink:hover .sourceTitleLine span {
          text-decoration: underline;
        }
        .sourceTitleLine {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #1d4ed8;
          font-weight: 650;
          line-height: 1.25;
        }
        .sourceFavicon {
          width: 18px;
          height: 18px;
          flex: 0 0 18px;
          border-radius: 4px;
          background: #e2e8f0;
          object-fit: contain;
        }
        .url,
        .meta,
        .screenshot,
        .reviewNote {
          display: block;
          font-size: 11px;
          color: #64748b;
          overflow-wrap: anywhere;
        }
        .reviewLine {
          display: block;
          margin: 2px 0;
          color: #334155;
          font-size: 11px;
        }
        .statusLine {
          display: block;
          margin: 3px 0 9px;
          overflow-wrap: anywhere;
        }
        .screenshot {
          margin-top: 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .reviewNote {
          margin-top: 6px;
        }
        summary {
          cursor: pointer;
          color: #475569;
        }
        .coverage {
          display: inline-block;
          max-width: 220px;
          border-radius: 999px;
          padding: 4px 8px;
          font-size: 11px;
          line-height: 1.3;
          background: #e2e8f0;
        }
        .coverage.VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW {
          background: #dcfce7;
          color: #166534;
        }
        .coverage.OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW,
        .coverage.CANDIDATE_LINKS_AWAITING_VISUAL_REVIEW {
          background: #fef3c7;
          color: #92400e;
        }
        .coverage.OFFICIAL_CONTEXT_ONLY {
          background: #dbeafe;
          color: #1e40af;
        }
        .coverage.NO_CANDIDATE_PAGE_FOUND {
          background: #fee2e2;
          color: #991b1b;
        }
        @media (max-width: 900px) {
          .matrixToolbar {
            position: static;
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
