import { mapCategoryToColor, type MapCategory } from "@/lib/resultStatus";
import type {
  WikiTruthCannabisLawMatrix,
  WikiTruthCannabisLawRow,
} from "@/lib/wikiTruthCannabisLawMatrix";

export type WikiTruthColorValue = {
  category: MapCategory;
  color: string;
  label:
    | "Зелёный"
    | "Жёлтый"
    | "Красный"
    | "Серый — недостаточно данных"
    | "Серый — нет строки карты";
};

export type WikiTruthColorComparisonRow = {
  geo: string;
  territory: string;
  current: WikiTruthColorValue;
  official: WikiTruthColorValue;
  differs: boolean;
  comment: string;
  reauditResult: "COLOR_RESOLVED" | "HONEST_GREY_RETAINED" | null;
};

type MapColorRow = {
  geo: string;
  finalMapCategory?: string;
  mapCategory?: string;
};

function colorValue(
  category: MapCategory,
  missingMapRow = false,
): WikiTruthColorValue {
  const labels: Record<MapCategory, WikiTruthColorValue["label"]> = {
    LEGAL_OR_DECRIM: "Зелёный",
    LIMITED_OR_MEDICAL: "Жёлтый",
    ILLEGAL: "Красный",
    UNKNOWN: "Серый — недостаточно данных",
  };
  return {
    category,
    color: mapCategoryToColor(category),
    label: missingMapRow ? "Серый — нет строки карты" : labels[category],
  };
}

function normalizeCurrentCategory(row: MapColorRow | undefined): MapCategory {
  const value = String(
    row?.finalMapCategory || row?.mapCategory || "UNKNOWN",
  ).toUpperCase();
  return [
    "LEGAL_OR_DECRIM",
    "LIMITED_OR_MEDICAL",
    "ILLEGAL",
    "UNKNOWN",
  ].includes(value)
    ? (value as MapCategory)
    : "UNKNOWN";
}

function normalizeOfficialRecreational(
  value: string | null | undefined,
): "LEGAL" | "ILLEGAL" | null {
  const text = String(value || "")
    .trim()
    .toUpperCase();
  if (
    !text ||
    /^(UNCONFIRMED|NO_DIRECT|NO_SPI|NO_PGA|NOT_DIRECTLY_CONFIRMED)/.test(text)
  )
    return null;
  if (
    /^(LEGAL|POSSESSION_UP_TO|LIMITED_PERSONAL|DECRIMINALIZED_OR_LIMITED_|LEGAL_OR_DECRIMINALIZED)/.test(
      text,
    )
  )
    return "LEGAL";
  if (
    /^(ILLEGAL|NOT_LEGAL|NOT_GENERALLY_LEGAL|NOT_FULLY_LEGAL|FORMALLY_ILLEGAL|GENERALLY_ILLEGAL|CANNABIS_.*PROHIBITED|CULTIVATION_ILLEGAL|NO_GENERAL_LEGAL_MARKET)/.test(
      text,
    )
  )
    return "ILLEGAL";
  return null;
}

function normalizeOfficialMedical(
  value: string | null | undefined,
): "NONE" | "LIMITED" | "REGULATED" | null {
  const text = String(value || "")
    .trim()
    .toUpperCase();
  if (
    !text ||
    /^(UNCONFIRMED|CURRENT_STATUS_UNCONFIRMED|NO_DIRECT|NO_SPI|NO_PGA)/.test(
      text,
    )
  )
    return null;
  if (
    /^(REGULATED|AUTHORISED_PROGRAM|CANNABIS_AUTHORITY|PRESCRIPTION_AND_TREATMENT|MEDICAL_CANNABIS_LAWS|LICENSED_MEDICAL|LICENSED_PRODUCTION_FOR_MEDICINAL|MEDICAL_PURPOSE_AND_LICENSED)/.test(
      text,
    )
  )
    return "REGULATED";
  if (
    /^(LIMITED|FDA_APPROVED|DOCTOR_PRESCRIPTION|GENERAL_MEDICAL|MEDICAL_AND_SCIENTIFIC|STATUTORY_PRESCRIPTION|STATUTORY_TREATMENT|STATUTORY_AUTHORISED|USE_FOR_MEDICAL|CANNABIS_PLANT_IN_GROUP_I)/.test(
      text,
    )
  )
    return "LIMITED";
  if (
    /^(NONE|NO_PATIENT|NO_CURRENT_PATIENT|NO_MEDICAL|MEDICINAL_CANNABIS_IMPORT_PROHIBITED|TRANSITIONAL_SCHEME_EXPIRED)/.test(
      text,
    )
  )
    return "NONE";
  return null;
}

function normalizeOfficialEnforcement(
  value: string | null | undefined,
): "SOFT" | "STRICT" | null {
  const text = String(value || "")
    .trim()
    .toUpperCase();
  if (
    !text ||
    /^(UNCONFIRMED|UNASSESSED|NO_SPI|NO_PGA|GENERIC_DRUG_CONTEXT_ONLY)/.test(
      text,
    )
  )
    return null;
  if (
    /^(SOFT|MIXED|NOT_STRICT|FINE_ONLY|PUBLIC_SMOKING_SUMMARY_FINE)/.test(text)
  )
    return "SOFT";
  if (
    /^(STRICT|CRIMINAL|VERY_STRICT|PUNISHED|NOT_SOFT|REGULATED_WITH_OFFENCES)/.test(
      text,
    )
  )
    return "STRICT";
  return null;
}

export function deriveOfficialLawMapCategory(
  row: WikiTruthCannabisLawRow,
): MapCategory {
  const recreational = normalizeOfficialRecreational(
    row.officialStatus?.recreational,
  );
  const medical = normalizeOfficialMedical(row.officialStatus?.medical);
  const enforcement = normalizeOfficialEnforcement(
    row.officialStatus?.enforcement,
  );
  if (recreational === "LEGAL" || medical === "REGULATED")
    return "LEGAL_OR_DECRIM";
  if (
    recreational === "ILLEGAL" &&
    (medical === "LIMITED" || enforcement === "SOFT")
  )
    return "LIMITED_OR_MEDICAL";
  if (
    recreational === "ILLEGAL" &&
    medical === "NONE" &&
    enforcement === "STRICT"
  )
    return "ILLEGAL";
  return "UNKNOWN";
}

export function buildWikiTruthColorComparison(
  matrix: WikiTruthCannabisLawMatrix,
  mapRows: MapColorRow[],
): WikiTruthColorComparisonRow[] {
  const mapIndex = new Map(mapRows.map((row) => [row.geo.toUpperCase(), row]));
  return matrix.rows.map((row) => {
    const mapRow = mapIndex.get(row.geo.toUpperCase());
    const current = colorValue(normalizeCurrentCategory(mapRow), !mapRow);
    const official = colorValue(deriveOfficialLawMapCategory(row));
    let comment: string;
    if (!mapRow && official.category === "UNKNOWN") {
      comment =
        "В текущем map payload нет строки, а официальный материал не даёт полного статуса для цветового вывода.";
    } else if (!mapRow) {
      comment = `В текущем map payload нет строки. Проверенный официальный статус соответствует цвету «${official.label}».`;
    } else if (official.category === "UNKNOWN") {
      const reason =
        row.sourceCoverage === "OFFICIAL_CONTEXT_ONLY"
          ? "найден только официальный контекст"
          : row.sourceCoverage === "NO_CANDIDATE_PAGE_FOUND"
            ? "прямая страница закона не найдена"
            : "официальный статус подтверждён не полностью";
      comment = `Текущий цвет карты — «${current.label}»; правовой цвет оставлен серым: ${reason}.`;
    } else if (current.category === official.category) {
      comment = `Цвет совпадает: карта и проверенный официальный статус дают «${current.label}».`;
    } else {
      comment = `Расхождение: карта сейчас «${current.label}», а проверенный официальный статус даёт «${official.label}». Статус SSOT автоматически не изменён.`;
    }
    if (row.latestColorReaudit) {
      comment = `${comment} Повторная проверка: ${row.latestColorReaudit.reasonRu}`;
    }
    return {
      geo: row.geo,
      territory: row.territory,
      current,
      official,
      differs: current.category !== official.category,
      comment,
      reauditResult: row.latestColorReaudit?.result || null,
    };
  });
}
