import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { WikiTruthPageContent } from "./WikiTruthPageContent";

type CannabisLawMatrixRowForCounts = {
  directOfficialCannabisLawLinks?: unknown[];
  officialContextLinks?: unknown[];
  supplementalOfficialLinks?: unknown[];
};

type FinalReconciliationForCounts = {
  rowsTotal?: number;
  rowsExpected?: number;
  complete?: boolean;
  counts?: {
    truthColors?: Record<string, number>;
  };
  acceptance?: {
    complete?: boolean;
    flags?: Record<string, boolean>;
    crossLayerConflictRows?: string[];
    unprovenGreenRows?: string[];
  };
  noMutationProof?: {
    unchanged?: boolean;
  };
};

function findRepoRoot(start: string): string {
  let current = start;
  for (let index = 0; index < 6; index += 1) {
    if (
      fs.existsSync(
        path.join(
          current,
          "data",
          "reviews",
          "wiki-truth-cannabis-law-matrix-307.json",
        ),
      )
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (!parent || parent === current) break;
    current = parent;
  }
  return start;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readCannabisMatrixLinkCounts(): {
  direct: number;
  context: number;
  supplemental: number;
  total: number;
} {
  const root = findRepoRoot(process.cwd());
  const matrix = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        "data",
        "reviews",
        "wiki-truth-cannabis-law-matrix-307.json",
      ),
      "utf8",
    ),
  ) as { rows?: CannabisLawMatrixRowForCounts[] };
  const counts = (matrix.rows || []).reduce(
    (accumulator, row) => {
      accumulator.direct += asArray(row.directOfficialCannabisLawLinks).length;
      accumulator.context += asArray(row.officialContextLinks).length;
      accumulator.supplemental += asArray(row.supplementalOfficialLinks).length;
      return accumulator;
    },
    { direct: 0, context: 0, supplemental: 0 },
  );
  return {
    ...counts,
    total: counts.direct + counts.context + counts.supplemental,
  };
}

function readFinalReconciliation(): FinalReconciliationForCounts {
  const root = findRepoRoot(process.cwd());
  return JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        "data",
        "reviews",
        "wiki-truth-307-final-reconciliation.json",
      ),
      "utf8",
    ),
  ) as FinalReconciliationForCounts;
}

function readStoreSourceCandidateCount() {
  const root = findRepoRoot(process.cwd());
  const audit = JSON.parse(
    fs.readFileSync(
      path.join(root, "data", "reviews", "wiki-truth-307-store-audit.json"),
      "utf8",
    ),
  ) as { counts?: { STORE_SOURCE_CANDIDATES?: number } };
  return Number(audit.counts?.STORE_SOURCE_CANDIDATES || 0);
}

describe("/wiki-truth", () => {
  it("renders a clean audit header with separated universes", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    expect(html).toContain("Аудит Wiki Truth");
    expect(html).toContain("Строки стран Wikipedia");
    expect(html).toContain("Проверка стран ISO");
    expect(html).toContain("Покрытие справочника SSOT");
    expect(html).toContain("Покрытие штатов США");
    expect(html).toContain("Официальный реестр");
    expect(html).toContain("Покрытие GEO официальными ссылками");
    expect(html).toContain('data-testid="wiki-truth-summary"');
  });

  it("keeps the current Truth-First reconciliation fail-closed until official visual proof is complete", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    const final = readFinalReconciliation();
    const section =
      html.match(
        /data-testid="wiki-truth-final-reconciliation"[\s\S]*?<\/section>/,
      )?.[0] || "";
    expect(final.rowsTotal).toBe(307);
    expect(final.rowsExpected).toBe(307);
    expect(final.complete).toBe(false);
    expect(final.acceptance?.complete).toBe(false);
    expect(final.acceptance?.flags?.freshOfficialVisualReviewComplete).toBe(
      false,
    );
    expect(final.acceptance?.flags?.currentMapCaptureComplete).toBe(false);
    const conflictRows = final.acceptance?.crossLayerConflictRows || [];
    expect(new Set(conflictRows).size).toBe(conflictRows.length);
    const unprovenGreenRows = final.acceptance?.unprovenGreenRows || [];
    expect(Array.isArray(unprovenGreenRows)).toBe(true);
    expect(final.acceptance?.flags?.allGreenOperationallyProven).toBe(
      unprovenGreenRows.length === 0,
    );
    expect(conflictRows.length).toBeGreaterThan(0);
    expect(final.noMutationProof?.unchanged).toBe(true);
    expect(section).toContain('data-complete="0"');
    expect(section).toContain(
      `data-cross-layer-conflicts="${conflictRows.length}"`,
    );
    expect(section).toContain(`data-unproven-green="${unprovenGreenRows.length}"`);
    expect(section).toContain('data-no-mutation="1"');
    expect(section).toContain('data-display-uncolored="0"');
    expect(section).toContain('data-display-grey-geos="AQ"');
    expect(section).toContain('data-display-nonpolar-grey="0"');
    expect(section).toContain('data-testid="wiki-truth-map-display"');
    expect(section).toContain("Карта /truth-map: отдельный display-слой");
    expect(section).toContain("Юридический UNKNOWN");
    expect(section).not.toContain("UNKNOWN / без цвета");
    expect(section).toContain("FINAL_RECONCILIATION_HAS_OPEN_TRUTH_BLOCKERS");
    expect(section).toContain(
      `>${final.counts?.truthColors?.UNKNOWN || 0}<`,
    );
    expect(html).not.toContain("Честно осталось серыми");
    expect(html).not.toContain("Цвет закрыт повторной проверкой");
    expect(html).not.toContain("Повторно проверено серых строк");
  });

  it("keeps main final, store, and acceptance summaries human-readable while technical trails stay collapsed", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    const final = html.match(/data-testid="wiki-truth-final-reconciliation"[\s\S]*?<\/section>/)?.[0] || "";
    const store = html.match(/data-testid="wiki-truth-store-audit"[\s\S]*?<\/section>/)?.[0] || "";
    const acceptance = html.match(/data-testid="wiki-truth-goal-acceptance"[\s\S]*?<\/section>/)?.[0] || "";
    expect(final).toContain('data-human-summary-ready="1"');
    expect(final).toContain("Текущая сверка Truth-First");
    expect(final).not.toContain("Текущая Truth-First proposal сверка");
    expect(final).not.toContain("<details open");
    expect(store).toContain("Лицензированные точки продажи каннабиса");
    expect(store).not.toContain("Store Truth: licensed cannabis locations");
    expect(store).not.toContain("<details open");
    expect(acceptance).toContain("Итоговая приёмка 307 GEO");
    expect(acceptance).not.toContain("307-GEO final acceptance");
    expect(acceptance).not.toContain("<details open");
    expect(acceptance).toContain('data-human-summary-placeholders="0"');
  });

  it("keeps local store-discovery leads separate from validated official registries", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    const section = html.match(/data-testid="wiki-truth-store-audit"[\s\S]*?<\/section>/)?.[0] || "";
    expect(section).toContain("Локальные leads для проверки");
    expect(section).toContain("Ожидают извлечения");
    expect(section).toContain("Локальные source leads, требующие official review");
    expect(section).toContain("Тип точки-кандидата");
    expect(section).toContain("Форма lead");
    expect(section).toContain("Каталог / реестр");
    expect(section).toContain("STORE_DISCOVERY_FAIL_CLOSED");
    expect(section).toContain(
      `data-store-source-candidates="${readStoreSourceCandidateCount()}"`,
    );
    expect(section).toContain("Подтверждённые официальные реестры");
  });

  it("keeps the combined legal/store goal verdict fail-closed", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    const section = html.match(/data-testid="wiki-truth-goal-acceptance"[\s\S]*?<\/section>/)?.[0] || "";
    expect(section).toContain("Итоговая приёмка 307 GEO");
    expect(section).toContain("GOAL_ACCEPTANCE_FAIL_CLOSED");
    expect(section).toContain('data-goal-achieved="0"');
    expect(section).toContain('data-truth-reconciled="0"');
    expect(section).toContain('data-store-geo-checked="307"');
    expect(section).toContain("STORE_DISCOVERY_COMPLETE");
  });

  it("keeps parser leftovers out of the main audit table", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    const mainTable =
      html.match(/data-testid="wiki-truth-table"[\s\S]*?<\/table>/)?.[0] || "";
    expect(mainTable).not.toContain("Country/Territory");
    expect(html).toContain('data-testid="wiki-truth-diagnostics"');
  });

  it("renders the full truth table with the complete SSOT column schema", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    const mainTable =
      html.match(/data-testid="wiki-truth-table"[\s\S]*?<\/table>/)?.[0] || "";
    expect(mainTable).toContain(">Страна<");
    expect(mainTable).toContain(">Рекр. (Wiki)<");
    expect(mainTable).toContain(">Мед. (Wiki)<");
    expect(mainTable).toContain(">Рекр. (итог)<");
    expect(mainTable).toContain(">Мед. (итог)<");
    expect(mainTable).toContain(">Категория карты<");
    expect(mainTable).toContain(">Основание правила<");
    expect(mainTable).toContain(">Причина переопределения<");
    expect(mainTable).toContain(">ID правила<");
    expect(mainTable).toContain(">Переопределение одобрено<");
    expect(mainTable).toContain(">Официальный<");
    expect(mainTable).toContain(">Официальная ссылка<");
    expect(mainTable).toContain(">Изменение доказательств<");
    expect(mainTable).toContain(">Источник доказательства<");
    expect(mainTable).toContain(">Ключевая фраза<");
    expect(mainTable).toContain(">Примечания Wiki<");
    expect(mainTable).toContain(">Нормализованные примечания<");
    expect(mainTable).toContain(">Объяснение примечаний<");
    expect(mainTable).toContain(">Длина примечания<");
    expect(mainTable).toContain(">Качество примечания<");
    expect(mainTable).toContain(">Флаги расхождений<");
  });

  it("shows alias diagnostics as a separate diagnostics block", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    expect(html).toContain("Диагностика псевдонимов");
    expect(html).toContain("Отсутствующие строки Wiki");
    expect(html).toContain("Техническая диагностика");
    expect(html).toContain("Проверка стран ISO");
  });

  it("shows recent ssot changes as a separate audit block", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    expect(html).toContain("Последние изменения SSOT");
    expect(html).toContain('data-testid="wiki-truth-recent-changes"');
  });

  it("does not present official geo coverage as registry size", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    expect(html).toContain("Защищённый официальный реестр SSOT");
    expect(html).toContain(
      "Только эффективные официальные ссылки, совпавшие с владельцем GEO",
    );
    expect(html).not.toContain(">Официальное покрытие<");
  });

  it("renders audit mismatches separately from the full truth table", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    expect(html).toContain("Полная таблица стран Wiki/SSOT");
    expect(html).toContain("Расхождения аудита");
    expect(
      html.includes('data-testid="wiki-truth-audit-table"') ||
        html.includes('data-testid="wiki-truth-audit-empty"'),
    ).toBe(true);
  });

  it("renders the official ownership explainability view", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    expect(html).toContain("Сводка владения официальными ссылками");
    expect(html).toContain("Владение официальными ссылками");
    expect(html).toContain("Качество владения");
    expect(html).toContain("Основание владения");
    expect(html).toContain("Область источника");
    expect(html).toContain('data-testid="official-ownership-registry-table"');
    expect(html).toContain('data-testid="official-ownership-geo-summary"');
    expect(html).not.toContain(
      'data-testid="official-ownership-effective-table"',
    );
    expect(html).not.toContain(
      'data-testid="official-ownership-unknown-table"',
    );
    expect(html).not.toContain(
      'data-testid="official-ownership-filtered-table"',
    );
    expect(html).not.toContain('data-testid="official-ownership-global-table"');
    expect(html).not.toContain('data-testid="official-ownership-raw-table"');
  });

  it("renders source revalidation only as audit metadata", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    const matrixSection =
      html.match(
        /data-testid="cannabis-law-matrix-307"[\s\S]*?<\/section>/,
      )?.[0] || "";
    expect(matrixSection).toContain("Last checked:");
    expect(matrixSection).toContain("source state:");
    expect(matrixSection).toContain("reason:");
    expect(matrixSection).toContain("data-revalidation-state=");
  });

  it("renders the complete protected cannabis-law matrix as the primary ordered audit", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    const linkCounts = readCannabisMatrixLinkCounts();
    const matrix =
      html.match(
        /data-testid="cannabis-law-matrix-307"[\s\S]*?<\/section>/,
      )?.[0] || "";
    expect(linkCounts.direct).toBeGreaterThanOrEqual(532);
    expect(linkCounts.context).toBeGreaterThanOrEqual(159);
    expect(linkCounts.direct + linkCounts.supplemental).toBeGreaterThanOrEqual(
      573,
    );
    expect(linkCounts.total).toBeGreaterThanOrEqual(732);
    expect(matrix).toContain(
      "Ручная проверка официальных законов о каннабисе: все 307 территорий",
    );
    expect(matrix).toContain("Опубликованных прямых официальных URL");
    expect(matrix).toContain(`>${linkCounts.direct}<`);
    expect(matrix).toContain("Опубликованных официальных контекстных URL");
    expect(matrix).toContain(`>${linkCounts.context}<`);
    expect(matrix).toContain("Дополнительных официальных URL повторного аудита");
    expect(matrix).toContain(`>${linkCounts.supplemental}<`);
    expect(matrix).toContain("Всего опубликованных официальных URL");
    expect(matrix).toContain(`>${linkCounts.total}<`);
    expect(matrix).toContain("Строк без статуса проекта");
    expect(matrix).toContain(">7<");
    expect(matrix).toContain("GEO с опубликованным официальным URL");
    expect(matrix).toContain(">307 / 307<");
    expect(matrix).toContain("Показано 307 / 307");
    expect(matrix).toContain("Независимый Truth Color (только proposal)");
    expect(matrix).toMatch(
      /data-independent-truth-color="(?:GREEN|YELLOW|RED|UNKNOWN)"/,
    );
    expect(matrix).toContain('data-geo="BF"');
    expect(matrix).toContain('data-geo="ET"');
    expect(matrix).toContain('data-geo="VE"');
    expect(matrix).toContain(
      "https://www.mea.gov.bf/fileadmin/user_upload/stockage/documents/Burkina_Faso_Loi_N_2394ADP_portant_Code_de_la_Sante_Publique.pdf",
    );
    expect(matrix).toContain(
      "https://www.efda.gov.et/publication/nps-formulary/",
    );
    expect(matrix).toContain("https://mpps.gob.ve/cannabis");
    expect(html.indexOf('data-testid="cannabis-law-matrix-307"')).toBeLessThan(
      html.indexOf("Официальный реестр и владение ссылками"),
    );
    expect(html).toContain("Вторичная таблица стран Wiki/SSOT");
  });

  it("renders exactly 307 current-map versus official-law color rows with explanations", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    const table =
      html.match(
        /data-testid="cannabis-law-color-table"[\s\S]*?<\/table>/,
      )?.[0] || "";
    expect(table).toContain("Территория / страна");
    expect(table).toContain("Текущий цвет на карте");
    expect(table).toContain("Цвет по официальному закону");
    expect(table).toContain("Комментарий по цветам");
    expect((table.match(/data-geo=/g) || []).length).toBe(307);
    expect((table.match(/data-official-color="UNKNOWN"/g) || []).length).toBe(
      readFinalReconciliation().counts?.truthColors?.UNKNOWN,
    );
    expect(table).toContain("#cde7cf");
    expect(table).toContain("#f4e9c2");
    expect(table).toContain("#ead0d1");
    expect(table).toContain("Статус SSOT проекта не меняется автоматически");
  });
});
