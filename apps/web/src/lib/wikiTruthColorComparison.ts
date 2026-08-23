import { mapCategoryToColor, type MapCategory } from "@/lib/resultStatus";
import {
  deriveOfficialTruthColor,
  normalizeOfficialTruthColorToMapCategory,
} from "@/lib/wikiTruthColorEngine";
import type {
  WikiTruthCannabisLawMatrix,
  WikiTruthCannabisLawRow,
} from "@/lib/wikiTruthCannabisLawMatrix";
import type { WikiTruthAuditRow } from "@/lib/wikiTruthAudit";
import {
  ruAuditDifferenceStatus,
  ruDifferenceEvidenceSummary,
  ruOfficialStatusLine,
  ruProjectStatusLine,
} from "@/app/wiki-truth/wikiTruthRu";

export type WikiTruthColorValue = {
  category: MapCategory;
  color: string;
  label:
    | "Зелёный"
    | "Жёлтый"
    | "Красный"
    | "Без цвета — не подтверждён официальным статусом"
    | "Без цвета — нет строки карты"
    | "Без цвета — нет статуса проекта";
};

export type WikiTruthColorComparisonRow = {
  geo: string;
  territory: string;
  current: WikiTruthColorValue;
  official: WikiTruthColorValue;
  differs: boolean;
  comment: string;
  reauditResult: "COLOR_RESOLVED" | "HONEST_GREY_RETAINED" | null;
  projectStatusSummary: string;
  officialStatusSummary: string;
  differenceStatusLabel: string;
  differenceReason: string;
  reauditReason?: string | null;
  revalidationAuditSummary: string;
  wikiMismatchStatus:
    | "WIKI_CORRECT"
    | "WIKI_OUTDATED"
    | "WIKI_OVERSIMPLIFIED"
    | "WIKI_WRONG"
    | "WIKI_MISSING";
  wikiMismatchStatusLabel: string;
  wikiMismatchReason: string;
};

type MapColorRow = {
  geo: string;
  finalMapCategory?: string;
  mapCategory?: string;
};

function colorValue(
  category: MapCategory,
  missingReason?: "PROJECT_STATUS" | "MAP_ROW",
): WikiTruthColorValue {
  const labels: Record<MapCategory, WikiTruthColorValue["label"]> = {
    LEGAL_OR_DECRIM: "Зелёный",
    LIMITED_OR_MEDICAL: "Жёлтый",
    ILLEGAL: "Красный",
    UNKNOWN: "Без цвета — не подтверждён официальным статусом",
  };

  return {
    category,
    color: mapCategoryToColor(category),
    label:
      missingReason === "PROJECT_STATUS"
      ? "Без цвета — нет статуса проекта"
      : missingReason === "MAP_ROW"
          ? "Без цвета — нет строки карты"
          : labels[category],
  };
}

function formatStatusSummary(
  source: "project" | "official",
  status:
    | {
        recreational: string;
        medical: string;
        enforcement: string | null;
      }
    | null,
) {
  if (!status) {
    return `${source === "project" ? "проект" : "официальный вывод"}: статус отсутствует`;
  }
  return `${source === "project" ? "проект" : "официальный вывод"}: ${
    source === "project"
      ? ruProjectStatusLine({
          recreational: status.recreational,
          medical: status.medical,
          enforcement: status.enforcement || "none",
        })
      : ruOfficialStatusLine(status)
  }`;
}

function truncateReason(text: string, maxLength: number) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, maxLength);
  const idx = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("; "),
    cut.lastIndexOf(", "),
  );
  return `${idx > maxLength * 0.4 ? cut.slice(0, idx) : cut}…`;
}

type OfficialStatusParsed = {
  raw: string;
  flat: string;
  tokens: Set<string>;
};

type TruthAxisStatus = "LEGAL" | "DECRIMINALIZED" | "LIMITED" | "REGULATED" | "PRESCRIPTION" | "PHARMACEUTICAL" | "ILLEGAL" | "NONE" | "UNENFORCED" | "UNKNOWN";
type TruthAxisPolarity = "POSITIVE" | "NEGATIVE" | "UNKNOWN";
type WikiMismatchAxisReason =
  | "MATCH"
  | "UNKNOWN"
  | "WIKI_MORE_RESTRICTIVE"
  | "WIKI_MORE_LIBERAL"
  | "DIFFERENT";

const WIKI_MISMATCH_LABEL: Record<
  WikiTruthColorComparisonRow["wikiMismatchStatus"],
  string
> = {
  WIKI_CORRECT: "WIKI CORRECT",
  WIKI_OUTDATED: "WIKI OUTDATED",
  WIKI_OVERSIMPLIFIED: "WIKI OVERSIMPLIFIED",
  WIKI_WRONG: "WIKI WRONG",
  WIKI_MISSING: "WIKI MISSING",
};

const WIKI_STATUS_TO_POLARITY: Record<TruthAxisStatus, TruthAxisPolarity> = {
  LEGAL: "POSITIVE",
  DECRIMINALIZED: "POSITIVE",
  LIMITED: "POSITIVE",
  REGULATED: "POSITIVE",
  PRESCRIPTION: "POSITIVE",
  PHARMACEUTICAL: "POSITIVE",
  UNENFORCED: "POSITIVE",
  ILLEGAL: "NEGATIVE",
  NONE: "NEGATIVE",
  UNKNOWN: "UNKNOWN",
};

function normalizeTruthAxisStatus(value: string | null | undefined): TruthAxisStatus {
  const raw = String(value || "").trim();
  if (!raw) return "UNKNOWN";
  const status = raw.replace(/[^A-Za-z]+/g, " ").trim().toUpperCase();
  if (
    !status ||
    status === "UNKNOWN" ||
    status === "UNCONFIRMED" ||
    status === "UNASSESSED" ||
    status === "MISSING" ||
    status === "NO_ROW" ||
    status === "NO_DIRECT" ||
    status === "NO_DIRECTLY_CONFIRMED" ||
    status === "NO_PGA" ||
    status === "NO_SPI"
  ) return "UNKNOWN";
  if (status === "LEGAL") return "LEGAL";
  if (status === "DECRIMINALIZED" || status === "DECRIM") return "DECRIMINALIZED";
  if (status === "LIMITED") return "LIMITED";
  if (status === "UNENFORCED") return "UNENFORCED";
  if (status === "REGULATED") return "REGULATED";
  if (status === "PRESCRIPTION_MEDICAL" || status === "PRESCRIPTION" || status === "PHARMACEUTICAL") return "PRESCRIPTION";
  if (status === "ILLEGAL") return "ILLEGAL";
  if (status === "NONE") return "NONE";
  return "UNKNOWN";
}

function truthAxisPolarity(value: string | null | undefined): TruthAxisPolarity {
  return WIKI_STATUS_TO_POLARITY[normalizeTruthAxisStatus(value)];
}

function deriveWikiMismatchRowStatus(
  auditRow?: Pick<
    WikiTruthAuditRow,
    "wikiRec" | "wikiMed" | "finalRec" | "finalMed" | "geoKey"
  > | null,
) {
  if (!auditRow) {
    return {
      status: "WIKI_MISSING" as const,
      statusLabel: WIKI_MISMATCH_LABEL.WIKI_MISSING,
      reason: "Нет строки SSOT-слоя, mismatch не рассчитан.",
    };
  }

  const recDelta = compareTruthAxis(
    auditRow.wikiRec,
    auditRow.finalRec,
  );
  const medDelta = compareTruthAxis(
    auditRow.wikiMed,
    auditRow.finalMed,
  );
  const hasRecMismatch = recDelta !== "MATCH";
  const hasMedMismatch = medDelta !== "MATCH";
  const recPolarity = truthAxisPolarity(auditRow.wikiRec);
  const finalRecPolarity = truthAxisPolarity(auditRow.finalRec);
  const medPolarity = truthAxisPolarity(auditRow.wikiMed);
  const finalMedPolarity = truthAxisPolarity(auditRow.finalMed);
  const isRecUnknown = recPolarity === "UNKNOWN";
  const isMedUnknown = medPolarity === "UNKNOWN";
  const isRecFinalUnknown = finalRecPolarity === "UNKNOWN";
  const isMedFinalUnknown = finalMedPolarity === "UNKNOWN";

  const isRecDataMissing = isRecUnknown || isRecFinalUnknown;
  const isMedDataMissing = isMedUnknown || isMedFinalUnknown;

  if (isRecDataMissing || isMedDataMissing) {
    return {
      status: "WIKI_MISSING" as const,
      statusLabel: WIKI_MISMATCH_LABEL.WIKI_MISSING,
      reason: "SSOT и wiki-слой не содержат верифицируемых осей статусов.",
    };
  }
  if (!hasRecMismatch && !hasMedMismatch) {
    return {
      status: "WIKI_CORRECT" as const,
      statusLabel: WIKI_MISMATCH_LABEL.WIKI_CORRECT,
      reason: "Wiki и SSOT согласуются по рекреационной и медицинской осям.",
    };
  }

  const recMoreRestrictive =
    recPolarity === "NEGATIVE" && finalRecPolarity === "POSITIVE";
  const medMoreRestrictive =
    medPolarity === "NEGATIVE" && finalMedPolarity === "POSITIVE";
  const recMoreLiberal =
    recPolarity === "POSITIVE" && finalRecPolarity === "NEGATIVE";
  const medMoreLiberal =
    medPolarity === "POSITIVE" && finalMedPolarity === "NEGATIVE";

  if (recMoreRestrictive || medMoreRestrictive) {
    return {
      status: "WIKI_OUTDATED" as const,
      statusLabel: WIKI_MISMATCH_LABEL.WIKI_OUTDATED,
      reason: truncateReason(
        `Wiki слишком консервативна относительно SSOT. ${recDelta}${medDelta ? ` | ${medDelta}` : ""}`,
        420,
      ),
    };
  }
  if (recMoreLiberal || medMoreLiberal) {
    return {
      status: "WIKI_WRONG" as const,
      statusLabel: WIKI_MISMATCH_LABEL.WIKI_WRONG,
      reason: truncateReason(
        `Wiki расширяет действующую правовую модель SSOT. ${recDelta}${medDelta ? ` | ${medDelta}` : ""}`,
        420,
      ),
    };
  }

  if (recDelta === "UNKNOWN" || medDelta === "UNKNOWN") {
    return {
      status: "WIKI_MISSING" as const,
      statusLabel: WIKI_MISMATCH_LABEL.WIKI_MISSING,
      reason: truncateReason(
        `В одной из осей недостаточно данных для объективного сравнения. ${recDelta}${medDelta ? ` | ${medDelta}` : ""}`,
        420,
      ),
    };
  }

  if (recDelta === "DIFFERENT" || medDelta === "DIFFERENT") {
    return {
      status: "WIKI_OVERSIMPLIFIED" as const,
      statusLabel: WIKI_MISMATCH_LABEL.WIKI_OVERSIMPLIFIED,
      reason: truncateReason(
        `Основание по сравнению сокращено или неоднозначно классифицируемо. ${recDelta}${medDelta ? ` | ${medDelta}` : ""}`,
        420,
      ),
    };
  }

  if (hasRecMismatch || hasMedMismatch) {
    return {
      status: "WIKI_WRONG" as const,
      statusLabel: WIKI_MISMATCH_LABEL.WIKI_WRONG,
      reason: truncateReason(
        `Неподтверждённая расхожесть по осям: ${recDelta}${medDelta ? ` | ${medDelta}` : ""}`,
        420,
      ),
    };
  }

  return {
    status: "WIKI_OVERSIMPLIFIED" as const,
    statusLabel: WIKI_MISMATCH_LABEL.WIKI_OVERSIMPLIFIED,
    reason: "Наблюдается ослабленная детализация wiki-слоя относительно SSOT.",
  };
}

function compareTruthAxis(
  wikiRaw: string,
  ssotRaw: string,
): WikiMismatchAxisReason {
  const wiki = truthAxisPolarity(wikiRaw);
  const ssot = truthAxisPolarity(ssotRaw);
  if (wiki === ssot && wiki !== "UNKNOWN" && ssot !== "UNKNOWN") return "MATCH";
  if (wiki === "UNKNOWN" && ssot === "UNKNOWN") return "MATCH";
  if (wiki === "UNKNOWN" || ssot === "UNKNOWN") {
    return "UNKNOWN";
  }
  if (wiki === "POSITIVE" && ssot === "NEGATIVE") return "WIKI_MORE_LIBERAL";
  if (wiki === "NEGATIVE" && ssot === "POSITIVE") return "WIKI_MORE_RESTRICTIVE";
  return "DIFFERENT";
}

function parseOfficialStatusText(
  value: string | null | undefined,
): OfficialStatusParsed | null {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  const flat = raw
    .replace(/;/g, " ")
    .replace(/[^A-Z0-9_ ]+/g, "_")
    .replace(/[\s_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!flat) return null;
  return {
    raw,
    flat: `_${flat}_`,
    tokens: new Set(flat.split("_").filter(Boolean)),
  };
}

function hasOfficialToken(status: OfficialStatusParsed | null, token: string) {
  return status?.tokens.has(token) ?? false;
}

function hasOfficialPhrase(status: OfficialStatusParsed | null, phrase: string) {
  if (!status) return false;
  return status.flat.includes(`_${phrase}_`);
}

function hasPatientSignal(status: OfficialStatusParsed | null) {
  return (
    hasOfficialToken(status, "PATIENT") ||
    hasOfficialToken(status, "PATIENTS") ||
    /_PATIENT/.test(status?.flat || "")
  );
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

function hasMedicalNoPatientAccess(parsed: OfficialStatusParsed | null): boolean {
  return !!(
    parsed &&
    (hasOfficialToken(parsed, "NONE") ||
      hasOfficialPhrase(parsed, "WITHOUT_PATIENT") ||
      hasOfficialPhrase(parsed, "WITHOUT_PATIENT_ACCESS") ||
      hasOfficialPhrase(parsed, "NO_PATIENT") ||
      hasOfficialPhrase(parsed, "NO_CURRENT_PATIENT") ||
      hasOfficialPhrase(parsed, "NO_MEDICAL") ||
      hasOfficialPhrase(parsed, "NO_PATIENT_ACCESS") ||
      hasOfficialPhrase(parsed, "NO_PATIENT_ACCESS_CONFIRMED") ||
      hasOfficialPhrase(parsed, "NO_PATIENT_ACCESS_NOT_CONFIRMED") ||
      hasOfficialPhrase(parsed, "NO_CURRENT_PATIENT_ACCESS") ||
      hasOfficialPhrase(parsed, "NO_DOMESTIC_PATIENT_ACCESS") ||
      hasOfficialPhrase(parsed, "NO_TERRITORY_WIDE_MEDICAL") ||
      hasOfficialPhrase(parsed, "NO_PATIENT_PROGRAM") ||
      hasOfficialPhrase(parsed, "NO_PATIENTS") ||
      hasOfficialPhrase(parsed, "NO_CANNABIS_PATIENT_PROGRAM") ||
      /_NO_[A-Z0-9_]*PATIENT/.test(parsed.flat) ||
      /_NO_[A-Z0-9_]*PATIENT_ACCESS/.test(parsed.flat) ||
      /_WITHOUT_[A-Z0-9_]*PATIENT/.test(parsed.flat) ||
      /_NOT_[A-Z0-9_]*PATIENT/.test(parsed.flat) ||
      hasOfficialToken(parsed, "NOT_PROVEN") ||
      hasOfficialPhrase(parsed, "PATIENT_ACCESS_PRODUCT_SCOPE_NOT_PROVEN") ||
      hasOfficialPhrase(parsed, "PATIENT_ACCESS_BREADTH_NOT_PROVEN") ||
      hasOfficialPhrase(parsed, "NONE_CONFIRMED_CANNABIS_PROGRAM") ||
      hasOfficialPhrase(parsed, "NONE_CONFIRMED_FOR_CANNABIS_PROGRAM") ||
      hasOfficialPhrase(parsed, "PATIENT_PROGRAM_NOT_CONFIRMED"))
  );
}

export function hasOperationalMedicalAccessEvidence(
  value: string | null | undefined,
): boolean {
  const parsed = parseOfficialStatusText(value);
  return hasOperationalPatientAccess(parsed);
}

function hasMedicalPatientAccessEvidence(parsed: OfficialStatusParsed | null): boolean {
  if (!parsed || hasMedicalNoPatientAccess(parsed)) return false;

  if (
    hasOfficialPhrase(parsed, "PATIENT_ACCESS") ||
    hasOfficialPhrase(parsed, "PATIENT_REGISTRY") ||
    hasOfficialPhrase(parsed, "PATIENT_IDENTIFICATION_CARD") ||
    hasOfficialPhrase(parsed, "QUALIFIED_PATIENT") ||
    hasOfficialPhrase(parsed, "REGULATED_PATIENT_ACCESS") ||
    hasOfficialPhrase(parsed, "PATIENT_IDENTIFICATION")
  ) {
    return true;
  }

  if (
    hasPatientSignal(parsed) &&
    (
      hasOfficialToken(parsed, "REGISTRY") ||
      hasOfficialToken(parsed, "CARD") ||
      hasOfficialToken(parsed, "CAREGIVER") ||
      hasOfficialToken(parsed, "PROGRAM") ||
      hasOfficialToken(parsed, "PROGRAMME") ||
      hasOfficialToken(parsed, "RECOMMENDATION") ||
      hasOfficialToken(parsed, "PHARMACY") ||
      hasOfficialToken(parsed, "DISPENSING") ||
      hasOfficialToken(parsed, "DISPENSARY") ||
      hasOfficialToken(parsed, "DOCTOR") ||
      hasOfficialToken(parsed, "DOCTORS") ||
      hasOfficialToken(parsed, "SPECIALIST") ||
      hasOfficialToken(parsed, "SPECIALISTS") ||
      hasOfficialToken(parsed, "QUALIFIED") ||
      hasOfficialToken(parsed, "QUALIFYING") ||
      hasOfficialPhrase(parsed, "OWN_PATIENT") ||
      hasOfficialPhrase(parsed, "OWN_PATIENTS")
    )
  ) {
    return true;
  }

  if (
    hasOfficialToken(parsed, "PRESCRIPTION") &&
    hasOfficialToken(parsed, "PHARMACY") &&
    (
      hasPatientSignal(parsed) ||
      hasOfficialToken(parsed, "SPECIALIST") ||
      hasOfficialToken(parsed, "SPECIALISTS") ||
      hasOfficialToken(parsed, "DOCTOR") ||
      hasOfficialToken(parsed, "DOCTORS") ||
      hasOfficialToken(parsed, "QUALIFYING")
    )
  ) {
    return true;
  }

  return false;
}

function hasOperationalPatientAccess(parsed: OfficialStatusParsed | null) {
  if (!parsed || hasMedicalNoPatientAccess(parsed)) return false;
  if (!hasMedicalPatientAccessEvidence(parsed)) return false;

  const hasProgramContext =
    hasPatientSignal(parsed) ||
    hasOfficialPhrase(parsed, "PATIENT_ACCESS") ||
    hasOfficialToken(parsed, "REGISTRY") ||
    hasOfficialToken(parsed, "CARD") ||
    hasOfficialToken(parsed, "PROGRAM") ||
    hasOfficialToken(parsed, "PROGRAMME") ||
    hasOfficialToken(parsed, "RECOMMENDATION") ||
    hasOfficialToken(parsed, "DISPENSARY") ||
    hasOfficialToken(parsed, "QUALIFIED") ||
    hasOfficialToken(parsed, "QUALIFYING") ||
    hasOfficialToken(parsed, "DOCTOR") ||
    hasOfficialToken(parsed, "PHARMACY") ||
    hasOfficialToken(parsed, "PRESCRIPTION");

  if (!hasProgramContext) {
    return false;
  }

  if (
    hasOfficialPhrase(parsed, "NOT_OPERATIONAL") ||
    hasOfficialPhrase(parsed, "NOT_COMMENCED") ||
    hasOfficialPhrase(parsed, "NOT_STARTED") ||
    hasOfficialPhrase(parsed, "IN_DEVELOPMENT") ||
    hasOfficialPhrase(parsed, "STILL_IN_DEVELOPMENT") ||
    hasOfficialPhrase(parsed, "PROGRAM_NOT_IN_FORCE") ||
    hasOfficialPhrase(parsed, "IMPLEMENTATION_SCOPE_UNCONFIRMED") ||
    hasOfficialPhrase(parsed, "IMPLEMENTATION_LIMITS") ||
    hasOfficialPhrase(parsed, "IMPLEMENTATION_IN_PROGRESS")
  ) {
    return false;
  }

  if (
    hasOfficialToken(parsed, "AUTHORIZED_PROGRAM") ||
    hasOfficialToken(parsed, "AUTHORISED_PROGRAM") ||
    hasOfficialPhrase(parsed, "CONFIRMED")
  ) {
    return true;
  }

  return hasOfficialPhrase(parsed, "REGULATED_ACCESS");
}

export function deriveOfficialLawMapCategory(
  row: WikiTruthCannabisLawRow,
): MapCategory {
  return normalizeOfficialTruthColorToMapCategory(
    deriveOfficialTruthColor({
      officialStatus: row.officialStatus,
      sourceCoverage: row.sourceCoverage,
      legalEvidenceText: [
        row.differenceDescription,
        row.reviewNotes,
        row.latestColorReaudit?.reasonRu,
        ...[
          ...row.directOfficialCannabisLawLinks,
          ...row.officialContextLinks,
          ...row.supplementalOfficialLinks,
          ...(row.freshSecondPassOfficialLinks || []),
        ].flatMap((link) => [
          // Revalidation metadata is intentionally excluded: HTTP/visual state
          // is audit metadata and cannot become a legal-truth input.
          link.title,
          link.note,
          link.visualReview,
          link.verification,
          link.sourceKind,
        ]),
      ]
        .filter(Boolean)
        .join(" "),
    }).color,
  );
}

export function summarizeOfficialEvidenceRevalidation(
  row: WikiTruthCannabisLawRow,
): string {
  const metadata = [
    ...row.directOfficialCannabisLawLinks,
    ...row.officialContextLinks,
    ...row.supplementalOfficialLinks,
    ...(row.freshSecondPassOfficialLinks || []),
  ].flatMap((link) => link.revalidation ? [link.revalidation] : []);
  if (!metadata.length) return "Revalidation metadata: отсутствует.";
  const states = new Map<string, number>();
  for (const entry of metadata) {
    // Older context-only evidence may predate the typed revalidation field.
    // Preserve it in the audit instead of allowing metadata-only incompleteness
    // to break the whole /wiki-truth view or influence legal derivation.
    const state = entry.revalidation_state || "ANNOTATED_CONTEXT_ONLY";
    states.set(
      state,
      (states.get(state) || 0) + 1,
    );
  }
  const lastChecked = metadata
    .map((entry) => entry.checked_at || "")
    .filter(Boolean)
    .sort()
    .at(-1) || "—";
  const stateSummary = [...states]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([state, count]) => `${state}=${count}`)
    .join(", ");
  return `Revalidation audit metadata: Last checked ${lastChecked}; source states ${stateSummary}.`;
}

export function buildWikiTruthColorComparison(
  matrix: WikiTruthCannabisLawMatrix,
  mapRows: MapColorRow[],
  auditRows: WikiTruthAuditRow[] = [],
  truthColorByGeo: ReadonlyMap<string, string> = new Map(),
): WikiTruthColorComparisonRow[] {
  const mapIndex = new Map(mapRows.map((row) => [row.geo.toUpperCase(), row]));
  const auditIndex = new Map(
    auditRows
      .filter((row) => row?.geoKey)
      .map((row) => [row.geoKey.toUpperCase(), row]),
  );
  return matrix.rows.map((row) => {
    const mapRow = mapIndex.get(row.geo.toUpperCase());
    const auditRow = auditIndex.get(row.geo.toUpperCase()) || null;
    const wikiMismatch = deriveWikiMismatchRowStatus(auditRow);
    const missingProjectStatus = row.projectStatus == null;
    const current = colorValue(
      missingProjectStatus ? "UNKNOWN" : normalizeCurrentCategory(mapRow),
      missingProjectStatus ? "PROJECT_STATUS" : !mapRow ? "MAP_ROW" : undefined,
    );
    const truthColor = String(
      truthColorByGeo.get(row.geo.toUpperCase()) || "",
    ).toUpperCase();
    const official = colorValue(
      truthColor
        ? normalizeOfficialTruthColorToMapCategory(truthColor)
        : deriveOfficialLawMapCategory(row),
    );
    const projectStatusSummary = formatStatusSummary("project", row.projectStatus);
    const officialStatusSummary = formatStatusSummary(
      "official",
      row.officialStatus,
    );
    const differenceStatusLabelByName = ruAuditDifferenceStatus(
      row.differenceStatus,
    );
    const differenceReason = truncateReason(
      ruDifferenceEvidenceSummary(row),
      360,
    );
    const revalidationAuditSummary = summarizeOfficialEvidenceRevalidation(row);
    let comment: string;
    const ssotImmutableNote =
      " Статус SSOT проекта не меняется автоматически. Это audit projection: SSOT-статусы и карта здесь не меняются.";
    const colorScopeNote =
      "Цвет является агрегатной трёхцветной категорией, а не отдельным рекреационным или медицинским статусом.";
    if (missingProjectStatus && official.category === "UNKNOWN") {
      comment =
        `В проекте нет строки правового статуса, поэтому текущая территория не окрашивается в карту; официальный материал также не даёт полного цветового вывода. ${colorScopeNote}` +
        ssotImmutableNote;
    } else if (missingProjectStatus) {
      comment =
        `Проектный статус отсутствует: текущая карта остаётся без цвета («${current.label}»), а официальный audit даёт агрегатный цвет «${official.label}». ${colorScopeNote}${ssotImmutableNote}`;
    } else if (!mapRow && official.category === "UNKNOWN") {
      comment =
        `В текущем map payload нет строки, а официальный материал не даёт полного статуса для цветового вывода. ${colorScopeNote}${ssotImmutableNote}`;
    } else if (!mapRow) {
      comment = `В текущем map payload нет строки. Проверенный официальный вывод даёт агрегатный цвет «${official.label}». ${colorScopeNote}${ssotImmutableNote}`;
    } else if (official.category === "UNKNOWN") {
      const reason =
        row.sourceCoverage === "OFFICIAL_CONTEXT_ONLY"
          ? "найден только официальный контекст"
          : row.sourceCoverage === "NO_CANDIDATE_PAGE_FOUND"
            ? "прямая страница закона не найдена"
            : "официальный статус подтверждён не полностью";
      comment = `Текущий цвет карты — «${current.label}»; официальный audit остаётся без цвета: ${reason}. ${colorScopeNote}${ssotImmutableNote}`;
    } else if (current.category === official.category) {
      comment = `Цвет совпадает как агрегатная категория: текущая карта и официальный audit дают «${current.label}». ${colorScopeNote} ${differenceReason}${ssotImmutableNote}`;
    } else {
      comment = `Цвет отличается как агрегатная категория: текущая карта «${current.label}», официальный audit «${official.label}». ${colorScopeNote} Причина: ${differenceStatusLabelByName}. ${differenceReason}${ssotImmutableNote}`;
    }
    return {
      geo: row.geo,
      territory: row.territory,
      current,
      official,
      wikiMismatchStatus: wikiMismatch.status,
      wikiMismatchStatusLabel: wikiMismatch.statusLabel,
      wikiMismatchReason: wikiMismatch.reason,
      differs: current.category !== official.category,
      comment,
      reauditResult: row.latestColorReaudit?.result || null,
      projectStatusSummary,
      officialStatusSummary,
      differenceStatusLabel: differenceStatusLabelByName,
      differenceReason,
      reauditReason: row.latestColorReaudit?.reasonRu || null,
      revalidationAuditSummary,
    };
  });
}
