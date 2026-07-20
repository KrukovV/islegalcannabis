import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { WikiTruthPageContent } from "./page";

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
    const matrix =
      html.match(
        /data-testid="cannabis-law-matrix-307"[\s\S]*?<\/section>/,
      )?.[0] || "";
    expect(matrix).toContain(
      "Ручная проверка официальных законов о каннабисе: все 307 территорий",
    );
    expect(matrix).toContain("Опубликованных прямых официальных URL");
    expect(matrix).toContain(">531<");
    expect(matrix).toContain("Опубликованных официальных контекстных URL");
    expect(matrix).toContain(">143<");
    expect(matrix).toContain("GEO с опубликованным официальным URL");
    expect(matrix).toContain(">307 / 307<");
    expect(matrix).toContain("Повторно проверено серых строк");
    expect(matrix).toContain(">39<");
    expect(matrix).toContain("Цвет закрыт повторной проверкой");
    expect(matrix).toContain(">37<");
    expect(matrix).toContain("Честно осталось серыми");
    expect(matrix).toContain(">2<");
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
    expect((table.match(/data-reaudit-result="COLOR_RESOLVED"/g) || []).length).toBe(37);
    expect((table.match(/data-reaudit-result="HONEST_GREY_RETAINED"/g) || []).length).toBe(2);
    expect((table.match(/data-official-color="UNKNOWN"/g) || []).length).toBe(2);
    expect(table).toContain("#cde7cf");
    expect(table).toContain("#f4e9c2");
    expect(table).toContain("#ead0d1");
    expect(table).toContain("#d7dcdc");
    expect(table).toContain("Статус SSOT автоматически не изменён");
  });
});
