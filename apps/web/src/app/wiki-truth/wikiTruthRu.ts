const EXACT_LABELS: Record<string, string> = {
  yes: "да",
  no: "нет",
  none: "нет",
  strong: "сильный",
  weak: "слабый",
  fallback: "резервный",
  unknown: "не определено",
  country: "страна",
  state: "штат",
  multi_geo: "несколько GEO",
  global: "глобальная",
  LEGAL: "ЛЕГАЛЬНО",
  ILLEGAL: "НЕЛЕГАЛЬНО",
  DECRIMINALIZED: "ДЕКРИМИНАЛИЗОВАНО",
  LIMITED: "ОГРАНИЧЕННО",
  REGULATED: "РЕГУЛИРУЕТСЯ",
  NONE: "НЕТ",
  STRICT: "СТРОГОЕ",
  SOFT: "МЯГКОЕ",
  MIXED: "СМЕШАННОЕ",
  UNKNOWN: "НЕ ОПРЕДЕЛЕНО",
  HIGH: "ВЫСОКАЯ",
  MEDIUM: "СРЕДНЯЯ",
  LOW: "НИЗКАЯ",
  MATCH: "СОВПАДЕНИЕ",
  MATCH_WITH_SCOPE_NOTE: "СОВПАДЕНИЕ С УТОЧНЕНИЕМ ОБЛАСТИ",
  MATCH_WITH_MEDICAL_SCOPE_NOTE: "СОВПАДЕНИЕ С УТОЧНЕНИЕМ МЕДИЦИНСКОЙ ОБЛАСТИ",
  PROJECT_STATUS_MISMATCH: "РАСХОЖДЕНИЕ СО СТАТУСОМ ПРОЕКТА",
  PARSER_OR_TERM_INTERPRETATION_DIFFERENCE:
    "РАЗЛИЧИЕ ПАРСЕРА ИЛИ ТРАКТОВКИ ТЕРМИНА",
  REAL_LAW_CHANGE_OR_SCOPE_MISMATCH:
    "РЕАЛЬНОЕ ИЗМЕНЕНИЕ ЗАКОНА ИЛИ РАСХОЖДЕНИЕ ОБЛАСТИ",
  VISUALLY_REVIEWED: "ПРОСМОТРЕНО ВРУЧНУЮ",
  VISUALLY_CONFIRMED: "ПОДТВЕРЖДЕНО ВРУЧНУЮ",
  NOT_VISUALLY_CONFIRMED: "НЕ ПОДТВЕРЖДЕНО ВРУЧНУЮ",
  STRONG_OFFICIAL: "СИЛЬНАЯ ОФИЦИАЛЬНАЯ ПРИВЯЗКА",
  WEAK_OFFICIAL: "СЛАБАЯ ОФИЦИАЛЬНАЯ ПРИВЯЗКА",
  GLOBAL_FALLBACK: "ГЛОБАЛЬНЫЙ РЕЗЕРВНЫЙ ИСТОЧНИК",
};

export function ruAuditValue(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text === "-") return "—";
  return EXACT_LABELS[text] || text;
}

export function ruBoolean(value: boolean) {
  return value ? "да" : "нет";
}

export const SUMMARY_LABELS: Record<
  string,
  { title: string; source: string; rule: string }
> = {
  WIKI_COUNTRIES: {
    title: "Строки стран Wikipedia",
    source: "Таблица законности по странам в Wikipedia",
    rule: "Только физически присутствующие строки таблицы стран Wikipedia.",
  },
  ISO_COUNTRIES: {
    title: "Проверка стран ISO",
    source: "Вселенная стран ISO2",
    rule: "Все страны ISO; территории исключены.",
  },
  REF_SSOT: {
    title: "Покрытие справочника SSOT",
    source: "Вселенная ALL_GEO / справочник SSOT",
    rule: "Все поддерживаемые GEO: страны, территории и штаты США.",
  },
  US_STATES: {
    title: "Покрытие штатов США",
    source: "Вселенная штатов США",
    rule: "Только строки US-XX из отдельной проверки штатов США.",
  },
  OFFICIAL_REGISTRY: {
    title: "Официальный реестр",
    source: "Защищённый официальный реестр SSOT",
    rule: "Все защищённые строки реестра; этот счётчик не является GEO-покрытием.",
  },
  OFFICIAL_GEO_COVERAGE: {
    title: "Покрытие GEO официальными ссылками",
    source: "Проекция SSOT official_link_ownership",
    rule: "Только эффективные официальные ссылки, совпавшие с владельцем GEO.",
  },
  DIAGNOSTICS: {
    title: "Диагностика",
    source: "Диагностика нормализации и парсера",
    rule: "Остатки парсера, пустые ISO и проблемы разрешения псевдонимов.",
  },
};
