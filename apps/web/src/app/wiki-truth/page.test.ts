import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { WikiTruthPageContent } from "./page";

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

  it("renders the current complete Truth-First reconciliation without legacy counters", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    const final = readFinalReconciliation();
    const section =
      html.match(
        /data-testid="wiki-truth-final-reconciliation"[\s\S]*?<\/section>/,
      )?.[0] || "";
    expect(final.rowsTotal).toBe(307);
    expect(final.rowsExpected).toBe(307);
    expect(final.complete).toBe(true);
    expect(final.acceptance?.complete).toBe(true);
    expect(final.acceptance?.crossLayerConflictRows).toEqual([]);
    expect(final.acceptance?.unprovenGreenRows).toEqual([]);
    expect(final.noMutationProof?.unchanged).toBe(true);
    expect(section).toContain('data-complete="1"');
    expect(section).toContain('data-cross-layer-conflicts="0"');
    expect(section).toContain('data-unproven-green="0"');
    expect(section).toContain('data-no-mutation="1"');
    expect(section).toContain(
      `>${final.counts?.truthColors?.UNKNOWN || 0}<`,
    );
    expect(html).not.toContain("Честно осталось серыми");
    expect(html).not.toContain("Цвет закрыт повторной проверкой");
    expect(html).not.toContain("Повторно проверено серых строк");
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

  it("renders the complete protected cannabis-law matrix as the primary ordered audit", () => {
    const html = renderToStaticMarkup(createElement(WikiTruthPageContent));
    const linkCounts = readCannabisMatrixLinkCounts();
    const matrix =
      html.match(
        /data-testid="cannabis-law-matrix-307"[\s\S]*?<\/section>/,
      )?.[0] || "";
    expect(linkCounts.direct).toBeGreaterThanOrEqual(532);
    expect(linkCounts.context).toBeGreaterThanOrEqual(159);
    expect(linkCounts.supplemental).toBeGreaterThanOrEqual(41);
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
