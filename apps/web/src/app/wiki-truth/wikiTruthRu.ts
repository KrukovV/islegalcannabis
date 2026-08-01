import type { WikiTruthCannabisLawRow } from "@/lib/wikiTruthCannabisLawMatrix";

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
  OFFICIAL_SOURCES_MISSING: "НЕТ ПРИВЯЗКИ ВЛАДЕЛЬЦА ОФИЦИАЛЬНОЙ ССЫЛКИ",
  STRONG_OFFICIAL: "СИЛЬНАЯ ОФИЦИАЛЬНАЯ ПРИВЯЗКА",
  WEAK_OFFICIAL: "СЛАБАЯ ОФИЦИАЛЬНАЯ ПРИВЯЗКА",
  GLOBAL_FALLBACK: "ГЛОБАЛЬНЫЙ РЕЗЕРВНЫЙ ИСТОЧНИК",
};

export function ruAuditValue(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text === "-") return "—";
  return EXACT_LABELS[text] || humanizeUnknownStatus(text);
}

function humanizeUnknownStatus(text: string) {
  const cleaned = text.trim();
  if (!cleaned) return "—";
  return cleaned
    .split(/[_;\s]+/)
    .filter(Boolean)
    .map((token) => {
      const normalized = token.toUpperCase();
      return STATUS_TERM_REWRITE[normalized] || normalized.toLowerCase();
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function ruOfficialStatusValue(
  value: string | null | undefined,
  kind: "recreational" | "medical" | "enforcement",
) {
  const parsed = parseOfficialStatusValue(value);
  const { clean, tokens } = parsed;

  if (!clean) return "не подтверждено";
  if (/UNCONFIRMED|UNASSESSED|NO_DIRECT|NO_PGA|NO_SPI|NO_ROW/.test(clean)) {
    return "не подтверждено";
  }

  if (kind === "recreational") {
    const startsWithIllegal =
      /^(ILLEGAL|GENERALLY_ILLEGAL|FORMALLY_ILLEGAL|CULTIVATION_ILLEGAL|NO_GENERAL_LEGAL_MARKET|NOT_LEGAL|NOT_GENERALLY_LEGAL|NOT_FULLY_LEGAL)/.test(
        clean,
      );
    if (
      !startsWithIllegal &&
      (hasOfficialToken(tokens, ["DECRIMINALIZED", "DECRIMINALISED"]) ||
        hasOfficialPhrase(clean, [
          "NOT_AN_OFFENCE",
          "NOT_AN_OFFENSE",
          "NON_CRIMINAL",
          "NONCRIMINAL",
          "NOT_UNLAWFUL",
          "NOT_A_CRIME",
        ]) ||
        clean.startsWith("POSSESSION_UP_TO_"))
    ) {
      return ruAuditValue("DECRIMINALIZED");
    }
    if (
      hasOfficialToken(tokens, [
        "ILLEGAL",
        "PROHIBITED",
        "PROHIBIT",
        "CRIMINAL",
        "FORBIDDEN",
        "PENAL",
        "TRAFFICKING",
        "UNLAWFUL",
        "BANNED",
        "PROSCRIPTION",
      ]) ||
      hasOfficialPhrase(clean, [
        "NOT_LEGAL",
        "NOT_GENERALLY_LEGAL",
        "NOT_FULLY_LEGAL",
        "NO_GENERAL_LEGAL_MARKET",
        "NO_GENERAL_ADULT_RETAIL_RIGHT",
        "NO_GENERAL_RETAIL_RIGHT",
        "NO_COMPREHENSIVE_POSSESSION",
        "NO_GENERAL_LEGAL",
        "ILLEGAL_OR_NOT",
      ])
    ) {
      return ruAuditValue("ILLEGAL");
    }
    if (
      hasOfficialToken(tokens, [
        "LIMITED",
        "LIMITATION",
        "LIMITING",
        "PERSONAL",
        "QUANTITY",
        "HOME",
        "GROW",
      ])
    ) {
      return ruAuditValue("LIMITED");
    }
    if (
      hasOfficialToken(tokens, [
        "LEGAL",
        "REGULATED",
        "PERMITTED",
        "PERMITS",
        "LICENSED",
        "AUTHORIZED",
        "AUTHORISED",
        "PERMIT",
        "OPEN",
        "ALLOW",
        "ALLOWS",
        "LAWFUL",
        "CANONICAL",
        "DEEMED",
      ]) ||
      hasOfficialPhrase(clean, ["ADULT_USE", "HOME_PLANTS_LAWFUL"])
    ) {
      if (
        hasOfficialPhrase(clean, [
          "NOT_LEGAL",
          "NOT_GENERALLY_LEGAL",
          "NOT_FULLY_LEGAL",
          "NO_GENERAL_LEGAL_MARKET",
          "NO_GENERAL_ADULT_RETAIL_RIGHT",
          "NO_GENERAL_RETAIL_RIGHT",
          "NO_GENERAL_LEGAL",
        ])
      ) {
        return ruAuditValue("ILLEGAL");
      }
      return ruAuditValue("LEGAL");
    }
    return "не ясно";
  }

  if (kind === "medical") {
    if (
      hasOfficialToken(tokens, ["NONE", "PROHIBITED"]) ||
      hasOfficialPhrase(clean, [
        "NO_PATIENT",
        "NO_ACCESS",
        "NONE_CONFIRMED",
        "NO_MEDICAL",
        "MEDICAL_USE_NOT",
      ])
    ) {
      return ruAuditValue("NONE");
    }
    if (
      hasOfficialToken(tokens, [
        "LIMITED",
        "LIMITATION",
        "LIMITING",
        "EXCEPTION",
        "SPECIAL",
        "NARROW",
        "SCOPE",
        "PRESCRIPTION",
        "PRESCRIBED",
        "SATIVEX",
      ]) ||
      hasOfficialPhrase(clean, ["SPECIAL_CASE", "NARROW_SCOPE", "ONLY_SCIENTIFIC", "ONLY_RESEARCH"])
    ) {
      return ruAuditValue("LIMITED");
    }
    if (
      hasOfficialToken(tokens, [
        "REGULATED",
        "PATIENT",
        "MEDICAL",
        "THERAPEUTIC",
        "DOCTOR",
        "HEALTH",
        "PROGRAM",
        "CARD",
        "ENROLMENT",
        "ENROLLMENT",
        "AUTHORISED",
        "AUTHORIZED",
        "LICENSED",
        "RESEARCH",
        "SCIENTIFIC",
      ]) ||
      hasOfficialPhrase(clean, ["AUTHORISED_PROGRAM", "AUTHORIZED_PROGRAM", "CANNABIS_AUTHORITY", "LICENSED_MEDICAL"])
    ) {
      return ruAuditValue("REGULATED");
    }
    return "не ясно";
  }

  if (
    hasOfficialToken(tokens, [
      "STRICT",
      "CRIMINAL",
      "MANDATORY",
      "FELONY",
      "PENAL",
      "IMPRISONMENT",
      "JAIL",
      "OFFENCE",
      "OFFENSE",
      "PUNISH",
      "PENALTY",
      "CONVICTION",
      "DETENTION",
      "CUSTODIAL",
    ]) ||
    hasOfficialPhrase(clean, ["VERY_STRICT", "NOT_SOFT", "UP_TO_SIX_MONTHS"])
  ) {
    return ruAuditValue("STRICT");
  }
  if (
    hasOfficialToken(tokens, [
      "SOFT",
      "MIXED",
      "ADMINISTRATIVE",
      "CIVIL",
      "PERMISSIVE",
      "DIVERSION",
      "DIRECTION",
      "TREATMENT",
      "DEFERRED",
      "MONITORING",
      "NONCUSTODIAL",
      "FINE",
    ]) ||
    hasOfficialPhrase(clean, ["NOT_STRICT", "FINE_ONLY", "PRESENCE_ONLY"])
  ) {
    return ruAuditValue("SOFT");
  }
  return "не ясно";
}

function parseOfficialStatusValue(value: string | null | undefined) {
  const text = String(value || "")
    .trim()
    .toUpperCase();
  const base = text.split(/[;\n]/)[0].trim();
  const clean = base
    .replace(/[^A-Z0-9_ ]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return {
    raw: String(value || "").trim(),
    base,
    clean,
    tokens: new Set(clean.split("_").filter(Boolean)),
  };
}

function hasOfficialToken(tokens: Set<string>, values: string[]) {
  return values.some((value) => tokens.has(value));
}

function hasOfficialPhrase(clean: string, values: string[]) {
  const wrapped = `_${clean}_`;
  return values.some((value) => wrapped.includes(`_${value}_`));
}

const DIFFERENCE_STATUS_PREFIXES = [
  {
    prefix: "MATCH_WITH_",
    render: (suffix: string) =>
      `СОВПАДЕНИЕ С${suffix ? `: ${humanizeDiffStatusTokenSequence(suffix)}` : ""}`,
  },
  {
    prefix: "MATCH_ON_",
    render: (suffix: string) =>
      `СОВПАДЕНИЕ ПО${suffix ? `: ${humanizeDiffStatusTokenSequence(suffix)}` : ""}`,
  },
  {
    prefix: "CONFLICT_PROJECT_",
    render: (suffix: string) =>
      `КОНФЛИКТ СТАТУСА ПРОЕКТА: ${humanizeDiffStatusTokenSequence(suffix || "статус")}`,
  },
  {
    prefix: "PROJECT_COLOR_MISMATCH",
    render: (suffix: string) =>
      `ЦВЕТОВОЙ КОНФЛИКТ ПРОЕКТА${suffix ? `: ${humanizeDiffStatusTokenSequence(suffix)}` : ""}`,
  },
  {
    prefix: "COLOR_RESOLVED",
    render: (suffix: string) =>
      `ЦВЕТОВОЙ РЕЗУЛЬТАТ ПОДТВЕРЖДЁН${suffix ? `: ${humanizeDiffStatusTokenSequence(suffix)}` : ""}`,
  },
  {
    prefix: "PROJECT_STATUS_MISMATCH",
    render: (suffix: string) =>
      `РАСХОЖДЕНИЕ СТАТУСА ПРОЕКТА${suffix ? `: ${humanizeDiffStatusTokenSequence(suffix)}` : ""}`,
  },
  {
    prefix: "PROJECT_MEDICAL_STATUS_MISMATCH",
    render: (suffix: string) =>
      `РАСХОЖДЕНИЕ МЕДИЦИНСКОГО СТАТУСА ПРОЕКТА: ${humanizeDiffStatusTokenSequence(suffix || "медицинский статус")}`,
  },
  {
    prefix: "PROJECT_MEDICAL_AND_ENFORCEMENT_SCOPE_REVIEW",
    render: () =>
      "ОБЗОР МЕДИЦИНСКОГО И ПРАВООСПРИМЕНИЯ ПО ПРОЕКТУ",
  },
  {
    prefix: "PROJECT_STATUS_REVIEW_CURRENT_JULY_2026",
    render: () => "ПРОВЕРКА ПРОЕКТНОГО СТАТУСА (июль 2026)",
  },
  {
    prefix: "TAXONOMY_REVIEW_REQUIRED",
    render: (suffix: string) =>
      `ТРЕБУЕТСЯ ПЕРЕСМОТР ТАКСОНОМИИ${suffix ? `: ${humanizeDiffStatusTokenSequence(suffix)}` : ""}`,
  },
  {
    prefix: "COLOR_RESOLVED",
    render: (suffix: string) =>
      `ЦВЕТ СОГЛАСОВАН${suffix ? `: ${humanizeDiffStatusTokenSequence(suffix)}` : ""}`,
  },
  {
    prefix: "OFFICIAL_CONTEXT_ONLY_MATCH_",
    render: (suffix: string) =>
      `ОФИЦИАЛЬНЫЙ КОНТЕКСТ ПОДТВЕРЖДАЕТСЯ: ${humanizeDiffStatusTokenSequence(suffix || "контекстный режим")}`,
  },
  {
    prefix: "OFFICIAL_CONTEXT_ONLY_",
    render: (suffix: string) =>
      `Только официальный контекст: ${humanizeDiffStatusTokenSequence(suffix || "контекст")}`,
  },
  {
    prefix: "NO_PROJECT_STATUS_COLOR_",
    render: () =>
      "НЕТ СТРОКИ ПРОЕКТА: официальная переоценка не заменяет карту",
  },
  {
    prefix: "NO_PROJECT_STATUS",
    render: (suffix: string) =>
      `НЕЙТРАЛЬНЫЙ ФОН (НЕТ СТАТУСА ПРОЕКТА)${suffix ? `: ${humanizeDiffStatusTokenSequence(suffix)}` : ""}`,
  },
  {
    prefix: "JURISDICTION_SCOPE_UNRESOLVED",
    render: (suffix: string) =>
      `ЮРИСДИКЦИЯ НЕ РАЗРЕШЕНА${suffix ? `: ${humanizeDiffStatusTokenSequence(suffix)}` : ""}`,
  },
  {
    prefix: "UNREVIEWED_CANDIDATE_EVIDENCE",
    render: () => "КАНДИДАТЫ ЕЩЕ НЕ ПРОСМОТРЕНЫ ВРУЧНУЮ",
  },
  {
    prefix: "OFFICIAL_LINK_COVERAGE_GAP",
    render: () => "ДАННЫХ НЕДОСТАТОЧНО, ЕСЛИ ТАКИЕ ССЫЛКИ НЕ ОТКРЫТЫ",
  },
  {
    prefix: "VISUAL_SOURCE_REVIEWED_STATUS_COMPARISON_PENDING",
    render: () => "Сравнение статусов проекта и официального источника ожидает финального подтверждения",
  },
  {
    prefix: "OFFICIAL_SOURCE_PENDING_VISUAL_REVIEW",
    render: () => "ОФИЦИАЛЬНЫЙ ИСТОЧНИК НАЙДЕН И ОЖИДАЕТ ВИЗУАЛЬНОЙ ПРОВЕРКИ",
  },
  {
    prefix: "OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW",
    render: () => "ОФИЦИАЛЬНЫЙ ИСТОЧНИК НАЙДЕН, ТРЕБУЕТ ВИЗУАЛЬНОЙ ПРОВЕРКИ",
  },
];

const STATUS_TERM_REWRITE: Record<string, string> = {
  MATCH: "СОВПАДЕНИЕ",
  WITH: "С",
  ON: "ПО",
  PROJECT: "ПРОЕКТНЫЙ",
  STATUS: "СТАТУС",
  MISMATCH: "РАСХОЖДЕНИЕ",
  CONFLICT: "КОНФЛИКТ",
  TAXONOMY: "ТАКСОНОМИЯ",
  REVIEW: "ПРОВЕРКА",
  REQUIRED: "ТРЕБУЕТСЯ",
  UNSPECIFIED: "НЕУТОЧНЁН",
  COLOR: "ЦВЕТ",
  RESOLVED: "СООТВЕТСТВИЕ",
  OFFICIAL: "ОФИЦИАЛЬНЫЙ",
  CONTEXT: "КОНТЕКСТ",
  ONLY: "ТОЛЬКО",
  DIRECT: "ПРЯМОЙ",
  CANDIDATE: "КАНДИДАТ",
  CLAIMANT: "ВЛАДЕЛЕЦ ОФИЦИАЛЬНОГО ЗАЯВЛЕНИЯ",
  NOTE: "УТОЧНЕНИЕ",
  CAVEAT: "С ОГРАНИЧЕНИЕМ",
  PATTERN: "ПАТТЕРН",
  CANNOT: "НЕ",
  NO: "НЕТ",
  NOT: "НЕ",
  FOUND: "НЕ НАЙДЕНО",
  GENERAL: "ОБЩИЙ",
  SCOPE: "ОБЛАСТЬ",
  RESTRICTED: "ОГРАНИЧЕННЫЙ",
  LIMITED: "ОГРАНИЧЕННЫЙ",
  REGULATED: "РЕГУЛИРУЕМЫЙ",
  LEGAL: "ЗАКОННЫЙ",
  ILLEGAL: "НЕЛЕГАЛЬНЫЙ",
  MEDICAL: "МЕДИЦИНСКИЙ",
  RECREATIONAL: "РЕКРЕАЦИОННЫЙ",
  ENFORCEMENT: "ПРИМЕНЕНИЕ",
  UNCONFIRMED: "НЕ ПОДТВЕРЖДЁН",
  VERIFIED: "ПОДТВЕРЖДЁН",
  HOST: "ДОСТУП",
  DEFERRED: "ОТЛОЖЕН",
  CURRENT: "ТЕКУЩИЙ",
  PREVIOUS: "ПРЕДЫДУЩИЙ",
  BLOCKED: "ЗАБЛОКИРОВАНО",
  TRUE: "ДА",
  FALSE: "НЕТ",
  OR: "ИЛИ",
  AND: "И",
  BY: "ПО",
  IN: "В",
  TO: "ДЛЯ",
  FROM: "ИЗ",
  FOR: "ДЛЯ",
  OF: "О",
  BUT: "НО",
  PLUS: "ПЛЮС",
  SUPPORTED: "ПОДДЕРЖАН",
  PAGE: "СТРАНИЦА",
  MANUAL: "РУЧНОЙ",
  AFTER: "ПОСЛЕ",
  VISUALLY: "ВРУЧНО",
  THROUGH: "ЧЕРЕЗ",
  VIA: "ЧЕРЕЗ",
  APPLICABILITY: "ПРИМЕНИМОСТЬ",
  LEGACY: "НАСЛЕДСТВЕННЫЙ",
  ACT: "АКТ",
  LAW: "ЗАКОН",
  TABLE: "ТАБЛИЦА",
  SOURCE: "ИСТОЧНИК",
  UNKNOWN: "НЕИЗВЕСТНО",
  UNSUPPORTED: "НЕ ПОДДЕРЖИВАЕТСЯ",
};

function humanizeDiffStatusTokenSequence(raw: string) {
  if (!raw) return "";
  return raw
    .split("_")
    .filter(Boolean)
    .map((token) => {
      const key = token.toUpperCase();
      return STATUS_TERM_REWRITE[key] || token.toLowerCase();
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function capitalizeSentence(text: string) {
  const value = text.trim();
  if (!value) return value;
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

export function ruAuditDifferenceStatus(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text === "-") return "—";
  if (EXACT_LABELS[text]) return EXACT_LABELS[text];
  const upperText = text.toUpperCase();
  const matchingPrefix = DIFFERENCE_STATUS_PREFIXES.find((item) =>
    upperText.startsWith(item.prefix),
  );
  if (matchingPrefix) {
    const suffix = text.slice(matchingPrefix.prefix.length);
    return matchingPrefix.render(suffix);
  }
  if (upperText.endsWith("_CODE")) return `код: ${text.toLowerCase()}`;
  return capitalizeSentence(
    humanizeDiffStatusTokenSequence(upperText),
  );
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
    rule:
      "Все 249 записей ISO2 сопоставляются с физическими строками таблицы стран Wikipedia.",
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
    rule:
      "Защищённый реестр ссылок (факт роста/сжатия учитывается отдельно). Этот счётчик не является GEO-покрытием и не заменяет coverage.",
  },
  OFFICIAL_GEO_COVERAGE: {
    title: "Покрытие GEO официальными ссылками",
    source: "Проекция SSOT official_link_ownership",
    rule:
      "Только эффективные официальные ссылки, совпавшие с владельцем GEO, и только для ISO-стран. Покрытие считается по отдельной вселенной official_link_ownership, не путая его с другими universes.",
  },
  DIAGNOSTICS: {
    title: "Диагностика",
    source: "Диагностика нормализации и парсера",
    rule: "Остатки парсера, пустые ISO и проблемы разрешения псевдонимов.",
  },
};

export const hasCyrillic = (text: string) => /[А-Яа-яЁё]/.test(text);

function normalizeProjectStatusTextValue(value: string | null | undefined) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "не указано";
  return normalized;
}

export function ruProjectStatusLine(
  status: WikiTruthCannabisLawRow["projectStatus"],
  missingLabel = "статус проекта отсутствует",
) {
  if (!status) {
    return missingLabel;
  }
  return `рекреационный=${ruAuditValue(
    normalizeProjectStatusTextValue(status.recreational),
  )}; медицинский=${ruAuditValue(
    normalizeProjectStatusTextValue(status.medical),
  )}; применение=${ruAuditValue(normalizeProjectStatusTextValue(status.enforcement))}`;
}

function plainCanonicalStatusLabel(value: string) {
  const normalized = String(value || "").trim().toLocaleUpperCase();
  const labels: Record<string, string> = {
    LEGAL: "легально",
    ILLEGAL: "нелегально",
    DECRIMINALIZED: "декриминализовано",
    LIMITED: "ограниченно",
    REGULATED: "регулируется",
    NONE: "нет",
    STRICT: "строгое",
    SOFT: "мягкое",
    MIXED: "смешанное",
    UNCONFIRMED: "не подтверждено",
    NOT_CONFIRMED: "не подтверждено",
    NOT_DIRECTLY_CONFIRMED: "не подтверждено",
    UNASSESSED: "не подтверждено",
    NO_DIRECT: "не подтверждено",
    NO_PGA: "не подтверждено",
    NO_SPI: "не подтверждено",
    UNKNOWN: "не ясно",
  };
  return labels[normalized] || humanizeUnknownStatus(normalized).toLocaleLowerCase();
}

function officialAxisDetail(
  clean: string,
  kind: "recreational" | "medical" | "enforcement",
) {
  if (!clean) return "";

  if (kind === "recreational") {
    if (/^ILLEGAL_WITH_STATE_TERRITORY_VARIATION/.test(clean)) {
      return "нелегально; есть различия между штатами/территориями";
    }
    if (/^LEGAL_WITH_LIMITS/.test(clean)) {
      return "легально с ограничениями";
    }
    if (/^POSSESSION_UP_TO_/.test(clean)) {
      return "ограниченно: действует порог личного количества";
    }
    if (/^DECRIMINALIZED/.test(clean)) {
      return "декриминализовано в указанном объёме";
    }
  }

  if (kind === "medical") {
    if (/^NO_CURRENT_PATIENT_ACCESS/.test(clean)) {
      return "нет: действующий пациентский доступ не найден";
    }
    if (/PRESCRIPTION.*CANNABIS|CANNABIS.*MEDICINE|SATIVEX/.test(clean)) {
      return "ограниченно: рецептурный препарат каннабиса";
    }
    if (/AUTHORI[ZS]ED_PROGRAM|LICENSED_MEDICAL|CANNABIS_AUTHORITY/.test(clean)) {
      return "регулируется: действует разрешённая медицинская программа";
    }
    if (/LICENSED_PRODUCTION_FOR_MEDICINAL|MEDICINAL_AND_SCIENTIFIC|MEDICAL_PURPOSE|MEDICINAL_DELIVERY/.test(clean)) {
      return "регулируется: лицензируемое медицинское или научное обращение";
    }
  }

  if (kind === "enforcement") {
    if (/CRIMINAL_FINE_OR_UP_TO_SIX_MONTHS.*SMALL_PERSONAL_QUANTITY/.test(clean)) {
      return "строгое: уголовный штраф или до шести месяцев за малое личное количество";
    }
    if (/PERSONAL_POSSESSION_CAN_CARRY_IMPRISONMENT_OR_ARREST/.test(clean)) {
      return "строгое: за личное хранение возможны арест или лишение свободы";
    }
    if (/FINE_ONLY|ADMINISTRATIVE|CIVIL/.test(clean)) {
      return "мягкое: без автоматического вывода о лишении свободы";
    }
    if (/REGULATED_WITH_OFFENCES/.test(clean)) {
      return "строгое вне лицензированного режима";
    }
    if (/STRICT|VERY_STRICT|PENALTY|PUNISH|IMPRISONMENT|RECLUSION|CUSTODIAL/.test(clean)) {
      return "строгое: предусмотрены уголовные или иные строгие санкции";
    }
  }

  return "";
}

function ruOfficialAxisText(
  value: string | null | undefined,
  kind: "recreational" | "medical" | "enforcement",
) {
  const summary = ruOfficialStatusValue(value, kind);
  const parsed = parseOfficialStatusValue(value);
  if (!parsed.raw || ["не подтверждено", "не ясно"].includes(summary)) {
    return summary;
  }
  const explicitDetail = officialAxisDetail(parsed.clean, kind);
  if (explicitDetail) return explicitDetail;
  return plainCanonicalStatusLabel(
    OFFICIAL_SUMMARY_TO_CANONICAL[String(summary || "").trim().toLocaleUpperCase()] ||
      summary,
  );
}

export function ruOfficialStatusLine(
  status: WikiTruthCannabisLawRow["officialStatus"],
  missingLabel = "официальный статус не подтверждён визуально",
) {
  if (!status) {
    return missingLabel;
  }
  return `рекреационный=${ruOfficialAxisText(
    status.recreational,
    "recreational",
  )}; медицинский=${ruOfficialAxisText(
    status.medical,
    "medical",
  )}; применение=${ruOfficialAxisText(status.enforcement, "enforcement")}`;
}

function normalizeComparisonValue(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "не указано";
  return normalized;
}

const OFFICIAL_SUMMARY_TO_CANONICAL: Record<string, string> = {
  "ЛЕГАЛЬНО": "LEGAL",
  "НЕЛЕГАЛЬНО": "ILLEGAL",
  "ДЕКРИМИНАЛИЗОВАНО": "DECRIMINALIZED",
  "ОГРАНИЧЕННО": "LIMITED",
  "РЕГУЛИРУЕТСЯ": "REGULATED",
  "НЕТ": "NONE",
  "СТРОГОЕ": "STRICT",
  "МЯГКОЕ": "SOFT",
  "СМЕШАННОЕ": "MIXED",
  "НЕ ПОДТВЕРЖДЕНО": "UNCONFIRMED",
  "НЕ ЯСНО": "UNKNOWN",
};

function canonicalProjectAxisValue(
  value: string,
  dimension: "recreational" | "medical" | "enforcement",
) {
  const normalized = normalizeProjectStatusTextValue(value);
  if (dimension === "medical" && normalized === "NO") return "NONE";
  if (dimension === "enforcement" && normalized === "NONE") return "NONE";
  return normalized;
}

function canonicalOfficialAxisValue(
  value: string | null | undefined,
  dimension: "recreational" | "medical" | "enforcement",
) {
  const summary = ruOfficialStatusValue(value, dimension)
    .trim()
    .toLocaleUpperCase();
  return OFFICIAL_SUMMARY_TO_CANONICAL[summary] || summary;
}

type StatusAxisDimension = "recreational" | "medical" | "enforcement";

const UNCOMPARABLE_OFFICIAL_AXIS_VALUES = new Set([
  "UNCONFIRMED",
  "NOT_CONFIRMED",
  "NOT_DIRECTLY_CONFIRMED",
  "UNASSESSED",
  "UNKNOWN",
  "NO_DIRECT",
  "NO_PGA",
  "NO_SPI",
  "НЕ ПОДТВЕРЖДЕНО",
  "НЕ ЯСНО",
]);

function isComparableOfficialAxisValue(value: string) {
  const normalized = String(value || "").trim().toLocaleUpperCase();
  return (
    Boolean(normalized) &&
    !UNCOMPARABLE_OFFICIAL_AXIS_VALUES.has(normalized) &&
    !normalized.includes("НЕ ПОДТВЕРЖД")
  );
}

function buildStatusAxisComparison(row: WikiTruthCannabisLawRow) {
  if (!row.projectStatus || !row.officialStatus) {
    return {
      comparable: false,
      deltas: [] as string[],
      unchangedAxes: [] as string[],
      unavailableAxes: [] as string[],
    };
  }

  const checks: Array<{
    dimension: StatusAxisDimension;
    label: string;
    project: string;
    official: string;
  }> = [
    {
      dimension: "recreational",
      label: "рекреационный",
      project: normalizeComparisonValue(row.projectStatus.recreational),
      official: normalizeComparisonValue(row.officialStatus.recreational),
    },
    {
      dimension: "medical",
      label: "медицинский",
      project: normalizeComparisonValue(row.projectStatus.medical),
      official: normalizeComparisonValue(row.officialStatus.medical),
    },
    {
      dimension: "enforcement",
      label: "применение",
      project: normalizeComparisonValue(row.projectStatus.enforcement),
      official: normalizeComparisonValue(row.officialStatus.enforcement),
    },
  ];

  const deltas: string[] = [];
  const unchangedAxes: string[] = [];
  const unavailableAxes: string[] = [];

  for (const item of checks) {
    const normalizedProject = canonicalProjectAxisValue(
      item.project,
      item.dimension,
    );
    const normalizedOfficial = canonicalOfficialAxisValue(
      item.official,
      item.dimension,
    );
    if (!isComparableOfficialAxisValue(normalizedOfficial)) {
      unavailableAxes.push(item.label);
      continue;
    }
    if (normalizedProject !== normalizedOfficial) {
      deltas.push(
        `${item.label}: проект — ${plainCanonicalStatusLabel(normalizedProject)}; официальный вывод — ${ruOfficialAxisText(item.official, item.dimension)}`,
      );
    } else {
      unchangedAxes.push(item.label);
    }
  }

  return {
    comparable: true,
    deltas,
    unchangedAxes,
    unavailableAxes,
  };
}

function summarizeStatusDeltas(row: WikiTruthCannabisLawRow): string {
  const comparison = buildStatusAxisComparison(row);
  if (!comparison.comparable) {
    return "Точное сравнение по осям невозможно: по одной из сторон не хватает подтверждённого статуса.";
  }

  if (!comparison.deltas.length) {
    const unavailableText = comparison.unavailableAxes.length
      ? ` Недостаточно официального вывода по осям: ${comparison.unavailableAxes.join(", ")}; они не объявляются расхождением.`
      : "";
    return `По подтверждённым статусным осям проект и официальный вывод не конфликтуют.${unavailableText}`;
  }

  const unchangedText = comparison.unchangedAxes.length
    ? ` Остальные подтверждённые оси не объявляются конфликтом: ${comparison.unchangedAxes.join(", ")}.`
    : "";

  return `Расхождение только по одинаковым подтверждённым статусным осям: ${comparison.deltas.join("; ")}.${unchangedText}`;
}

function buildCoverageReasonByType(coverage: WikiTruthCannabisLawRow["sourceCoverage"]) {
  if (coverage === "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW") {
    return "имеется визуальный разбор прямой официальной страницы";
  }
  if (coverage === "OFFICIAL_CONTEXT_ONLY") {
    return "подтверждён только контекстный статус по территории";
  }
  if (coverage === "NO_CANDIDATE_PAGE_FOUND") {
    return "прямая страница закона не подтверждена; использован только косвенный разбор";
  }
  if (coverage === "OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW") {
    return "официальный источник найден, ожидает визуальную подтверждающую проверку";
  }
  return "есть кандидаты или неполный статусный профиль для финального вывода";
}

function sourceCoverageText(coverage: WikiTruthCannabisLawRow["sourceCoverage"]) {
  switch (coverage) {
    case "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW":
      return "по визуально подтверждённой прямой официальной странице";
    case "OFFICIAL_CONTEXT_ONLY":
      return "только официальный контекст, без прямой страницы закона";
    case "NO_CANDIDATE_PAGE_FOUND":
      return "прямая страница закона не найдена";
    case "OFFICIAL_SOURCE_AWAITING_VISUAL_REVIEW":
      return "официальный источник найден, но визуальная проверка не завершена";
    case "CANDIDATE_LINKS_AWAITING_VISUAL_REVIEW":
      return "есть кандидаты; визуальный разбор ещё ожидается";
    default:
      return "контакт с официальным источником не подтверждён";
  }
}

function compactText(text: string, maxLength: number) {
  const value = String(text || "").trim();
  if (!value) return "—";
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, maxLength);
  const divider = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("; "),
    cut.lastIndexOf(", "),
  );
  if (divider > maxLength * 0.45) {
    return `${cut.slice(0, divider)}…`;
  }
  return `${cut}…`;
}

const STATUS_REASON_MAP: Record<string, string> = {
  MATCH: "официальный и проектный статусы в этой проверке согласуются;",
  MATCH_WITH_SCOPE_NOTE: "статус совпадает с оговоркой по сфере/зональности;",
  MATCH_WITH_MEDICAL_SCOPE_NOTE:
    "статус совпадает по базовым статусам с оговоркой по медицинской сфере;",
  PROJECT_STATUS_MISMATCH:
    "официальный разбор даёт иной правовой вывод, чем SSOT проекта;",
  PARSER_OR_TERM_INTERPRETATION_DIFFERENCE:
    "по тексту закона есть различие трактовки/парсинга; статусное слово не переносится автоматически;",
  COLOR_RESOLVED: "расхождение по цвету уже закрыто повторной проверкой;",
  NO_PROJECT_STATUS:
    "в SSOT проекта на этот GEO нет строки статуса; карта не окрашивает территорию и не переобновляется в обход нового визуального аудита;",
  COLOR_RESOLVED_LIMITED_OR_MEDICAL:
    "разбор подтверждает ограниченный (жёлтый) режим;",
  COLOR_RESOLVED_ILLEGAL: "разбор подтверждает запрещающий (красный) режим;",
  NO_PROJECT_STATUS_COLOR_RESOLVED:
    "статус проекта отсутствует, цвет подтверждён повторным визуальным разбором;",
  JURISDICTION_SCOPE_UNRESOLVED:
    "юрисдикционный спор по этому GEO не закрыт; статус карты не переносится автоматически;",
  UNREVIEWED_CANDIDATE_EVIDENCE:
    "есть кандидаты на источник, но визуальная сверка статуса не принята;",
  OFFICIAL_LINK_COVERAGE_GAP:
    "есть разрыв покрытия по официальным доказательствам;",
  OFFICIAL_CONTEXT_ONLY_STATUS_SUPPORTED_BUT_NO_DIRECT_CANNABIS_LAW_PAGE_FOUND_AFTER_MANUAL_REVIEW:
  "только официальный контекст подтверждён вручную, прямой страницы закона не найдено;",
  CLAIMANT_OR_TERRITORY_SCOPE_GAP:
  "есть claimant/юрисдикционный контекст, который не является применимым законом для этой строки.",
  NO_DIRECT_CANNABIS_PAGE_FOUND_AFTER_MANUAL_REVIEW:
    "выполнена ручная проверка и подтверждена только косвенная/контекстная база;"
};

function normalizeStatusReasonKey(raw: string) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\\s-]/g, "_");
}

export function ruDifferenceEvidenceSummary(
  row: WikiTruthCannabisLawRow,
  maxLength = 920,
) {
  const axisComparison = buildStatusAxisComparison(row);
  const statusDeltaText = summarizeStatusDeltas(row);
  const normalizedDifferenceStatus = normalizeStatusReasonKey(row.differenceStatus);
  const rawStatusReason =
    STATUS_REASON_MAP[normalizedDifferenceStatus] ||
    STATUS_REASON_MAP[
      normalizeStatusReasonKey(
        String(ruAuditDifferenceStatus(row.differenceStatus) || ""),
      )
    ] ||
    "по данным проекта и официального разбора есть расхождение по сути статуса;";
  const statusReason =
    /MISMATCH|CONFLICT/.test(normalizedDifferenceStatus) &&
    (!axisComparison.comparable || !axisComparison.deltas.length)
      ? "код расхождения сохранён как audit-сигнал, но основной вывод не объявляет конфликт без подтверждённой разницы по той же оси;"
      : rawStatusReason;
  const coverageText = sourceCoverageText(row.sourceCoverage);
  const detailText = `Официальный разбор подтверждён как: ${buildCoverageReasonByType(row.sourceCoverage)}. Подробный исходный анализ сохранён ниже как журнал и не переопределяет три статусных поля.`;
  const parserNotes =
    row.parserSignals.length
      ? ` Сработало ${row.parserSignals.length} сигнального сообщения парсера; его вывод не заменяет визуальную проверку.`
      : "";
  const base = `${statusDeltaText} ${statusReason} ${detailText} Источник подтверждения: ${compactText(coverageText, 120)}.${parserNotes}`;
  return base.length <= maxLength
    ? base
    : `${base.slice(0, maxLength)}…`;
}
