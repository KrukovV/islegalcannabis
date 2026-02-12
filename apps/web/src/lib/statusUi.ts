export type TruthLevel =
  | "OFFICIAL"
  | "WIKI_CORROBORATED"
  | "WIKI_ONLY"
  | "CONFLICT"
  | "UNKNOWN";

export type EffectiveStatus =
  | "Legal"
  | "Decrim"
  | "Illegal"
  | "Unenforced"
  | "Limited"
  | "Unknown";

type VerdictTone = "good" | "warn" | "bad" | "unknown";

type Verdict = {
  label: string;
  icon: string;
  tone: VerdictTone;
};

type TruthBadge = {
  icon: string;
  label: string;
};

function normalizeStatus(value: string | null | undefined): EffectiveStatus {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "legal") return "Legal";
  if (normalized === "decriminalized" || normalized === "decrim") return "Decrim";
  if (normalized === "illegal") return "Illegal";
  if (normalized === "unenforced") return "Unenforced";
  if (normalized === "limited") return "Limited";
  return "Unknown";
}

function canAssert(truthLevel: TruthLevel): boolean {
  return truthLevel === "OFFICIAL" || truthLevel === "WIKI_CORROBORATED";
}

export function statusLabelRu(value: string | null | undefined): string {
  const status = normalizeStatus(value);
  if (status === "Legal") return "Разрешено";
  if (status === "Decrim") return "Декриминализовано";
  if (status === "Illegal") return "Запрещено";
  if (status === "Unenforced") return "Ограниченно";
  if (status === "Limited") return "Только мед";
  return "Не подтверждено";
}

export function statusShortRu(value: string | null | undefined): string {
  const status = normalizeStatus(value);
  if (status === "Legal") return "Разрешено";
  if (status === "Decrim") return "Декрим";
  if (status === "Illegal") return "Запрещено";
  if (status === "Unenforced") return "Ограниченно";
  if (status === "Limited") return "Только мед";
  return "Не подтверждено";
}

export function statusVerdict(
  truthLevel: TruthLevel,
  effectiveStatus: string | null | undefined
): Verdict {
  const status = normalizeStatus(effectiveStatus);
  if (status === "Illegal") return { icon: "⛔", label: "Нельзя", tone: "bad" };
  if (status === "Legal") return { icon: "✅", label: "Можно", tone: "good" };
  if (status === "Decrim") return { icon: "✅", label: "Декрим", tone: "good" };
  if (status === "Limited" || status === "Unenforced") {
    return { icon: "⚠️", label: "Ограниченно", tone: "warn" };
  }
  if (!canAssert(truthLevel)) {
    return { icon: "⚠️", label: "Не подтверждено", tone: "unknown" };
  }
  return { icon: "⚠️", label: "Не подтверждено", tone: "unknown" };
}

export function statusColorKey(
  truthLevel: TruthLevel,
  effectiveStatus: string | null | undefined
): "green" | "yellow" | "red" | "gray" {
  if (!canAssert(truthLevel)) {
    return "gray";
  }
  const status = normalizeStatus(effectiveStatus);
  if (status === "Illegal") return "red";
  if (status === "Legal") return "green";
  if (status === "Decrim" || status === "Unenforced" || status === "Limited") return "yellow";
  return "gray";
}

export function statusWhyText(params: {
  truthLevel: TruthLevel;
  officialCount: number;
  truthReasons: string[];
}): string {
  const truthLevel = params.truthLevel || "WIKI_ONLY";
  const officialCount = Number.isFinite(params.officialCount) ? params.officialCount : 0;
  if (truthLevel === "OFFICIAL") {
    return "Источник: официальный override";
  }
  if (truthLevel === "WIKI_CORROBORATED") {
    return officialCount > 0
      ? "Источник: Wikipedia подтверждена официальными ссылками"
      : "Источник: Wikipedia (подтверждение отсутствует)";
  }
  if (truthLevel === "CONFLICT") {
    return "Конфликт источников, нужен официальный";
  }
  return officialCount > 0
    ? "Источник: только Wikipedia, официальные ссылки есть"
    : "Источник: только Wikipedia, официальных ссылок нет";
}

export function statusTruthBadge(truthLevel: TruthLevel): TruthBadge {
  if (truthLevel === "OFFICIAL") {
    return { icon: "🏛️", label: "OFFICIAL" };
  }
  if (truthLevel === "WIKI_CORROBORATED") {
    return { icon: "✅", label: "VERIFIED" };
  }
  if (truthLevel === "WIKI_ONLY") {
    return { icon: "📘", label: "WIKI" };
  }
  if (truthLevel === "CONFLICT") {
    return { icon: "⚠️", label: "CONFLICT" };
  }
  return { icon: "⚠️", label: "UNKNOWN" };
}

export function SSOTStatusText(params: {
  truthLevel: TruthLevel;
  recEffective: string | null | undefined;
  medEffective: string | null | undefined;
}): {
  verdictTitle: string;
  recText: string;
  medText: string;
  badgeText: string;
} {
  const recStatus = statusShortRu(params.recEffective);
  const medStatus = statusShortRu(params.medEffective);
  const canAssert = params.truthLevel === "OFFICIAL" || params.truthLevel === "WIKI_CORROBORATED";
  const recText = `Recreational: ${recStatus}`;
  const medText = `Medical: ${medStatus}`;
  const verdictTitle = canAssert ? "SSOT подтверждён" : "Требует подтверждения";
  const badgeText = canAssert ? "SSOT подтверждён" : "Требует подтверждения";
  return { verdictTitle, recText, medText, badgeText };
}
