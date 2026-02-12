import { statusLabelRu, statusShortRu, statusTruthBadge, type TruthLevel } from "./statusUi";

export type SSOTExplainInput = {
  truthLevel: TruthLevel;
  officialLinksCount?: number;
  recEffective?: string | null;
  medEffective?: string | null;
  reasons?: string[];
};

export type SSOTExplainOutput = {
  recStatusRu: string;
  medStatusRu: string;
  recStatusShort: string;
  medStatusShort: string;
  reliabilityText: string;
  whyText: string;
  nextStepText: string;
  basisText: string;
  truthBadgeLabel: string;
  truthBadgeIcon: string;
};

function reliabilityFromTruth(truthLevel: TruthLevel): string {
  if (truthLevel === "OFFICIAL") return "Высокая";
  if (truthLevel === "WIKI_CORROBORATED") return "Почти высокая";
  if (truthLevel === "WIKI_ONLY") return "Средняя";
  return "Низкая";
}

function whyFromTruth(truthLevel: TruthLevel, officialCount: number): string {
  if (truthLevel === "OFFICIAL") return "Есть официальные источники (allowlist).";
  if (truthLevel === "WIKI_CORROBORATED") {
    return "Wikipedia подтверждена источниками из allowlist.";
  }
  if (truthLevel === "CONFLICT") return "Источники конфликтуют/пусто — нужна проверка.";
  if (truthLevel === "UNKNOWN") return "Недостаточно подтверждений.";
  return officialCount > 0
    ? "Основано на Wikipedia; официальные ссылки есть."
    : "Основано на Wikipedia; официальных ссылок нет.";
}

function nextStepFromTruth(truthLevel: TruthLevel): string {
  if (truthLevel === "OFFICIAL" || truthLevel === "WIKI_CORROBORATED") return "";
  if (truthLevel === "CONFLICT") return "Нужны официальные источники (allowlist).";
  if (truthLevel === "UNKNOWN") return "Нужны подтверждённые источники.";
  return "Нужны официальные источники (allowlist).";
}

function basisFromTruth(truthLevel: TruthLevel): string {
  if (truthLevel === "OFFICIAL") return "Official allowlist";
  if (truthLevel === "WIKI_CORROBORATED") return "Wikipedia + allowlist";
  if (truthLevel === "WIKI_ONLY") return "Wikipedia";
  return "Mixed";
}

export function explainSSOT(input: SSOTExplainInput): SSOTExplainOutput {
  const truthLevel = input.truthLevel || "WIKI_ONLY";
  const officialCount = Number.isFinite(input.officialLinksCount)
    ? Number(input.officialLinksCount)
    : 0;
  const recStatusRu = statusLabelRu(input.recEffective);
  const medStatusRu = statusLabelRu(input.medEffective);
  const recStatusShort = statusShortRu(input.recEffective);
  const medStatusShort = statusShortRu(input.medEffective);
  const reliabilityText = reliabilityFromTruth(truthLevel);
  const whyText = whyFromTruth(truthLevel, officialCount);
  const nextStepText = nextStepFromTruth(truthLevel);
  const basisText = basisFromTruth(truthLevel);
  const badge = statusTruthBadge(truthLevel);
  return {
    recStatusRu,
    medStatusRu,
    recStatusShort,
    medStatusShort,
    reliabilityText,
    whyText,
    nextStepText,
    basisText,
    truthBadgeLabel: badge.label,
    truthBadgeIcon: badge.icon
  };
}
