import type {
  ExtrasItem,
  ExtrasStatus,
  JurisdictionLawProfile,
  ResultStatusLevel
} from "@islegal/shared";
import { EXTRAS_CATALOG, EXTRAS_PRIORITY } from "@islegal/shared";

export type ExtrasCard = {
  key: string;
  title: string;
  value: string;
  whyMatters: string;
  userActionHint: string;
  severityHint: "low" | "medium" | "high";
};

const EXTRAS_LABELS: Record<string, string> = {
  purchase: "Purchase",
  retail_shops: "Retail shops",
  edibles: "Edibles",
  vapes: "Vapes",
  concentrates: "Concentrates",
  cbd: "CBD",
  paraphernalia: "Paraphernalia",
  medical_card: "Medical card",
  home_grow_plants: "Home grow plants",
  social_clubs: "Social clubs",
  hemp: "Hemp",
  workplace: "Workplace",
  testing_dui: "Testing / DUI"
};

export function formatExtrasValue(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "allowed") return "Allowed";
  if (normalized === "restricted") return "Restricted";
  if (normalized === "illegal") return "Illegal";
  if (normalized === "unknown") return "Unknown";
  if (normalized.startsWith("up to")) return value;
  return value;
}

function sortRank(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.startsWith("up to")) return 2;
  if (normalized === "illegal") return 0;
  if (normalized === "restricted") return 1;
  if (normalized === "allowed") return 2;
  return 3;
}

function severityRank(level: "low" | "medium" | "high") {
  if (level === "high") return 0;
  if (level === "medium") return 1;
  return 2;
}

function pickWorstStatus(values: string[]) {
  const normalized = values.map((value) => value.toLowerCase());
  if (normalized.includes("illegal")) return "illegal";
  if (normalized.includes("restricted")) return "restricted";
  if (normalized.includes("allowed")) return "allowed";
  if (normalized.some((value) => value.startsWith("up to"))) {
    return normalized.find((value) => value.startsWith("up to")) ?? "allowed";
  }
  return "unknown";
}

function resolveExtrasCardValue(profile: JurisdictionLawProfile, key: string) {
  if (key === "public_use") {
    return profile.public_use ?? "unknown";
  }
  if (key === "driving") {
    const testing = profile.extras?.testing_dui;
    if (testing) return testing;
    return profile.risks.includes("driving") ? "restricted" : "unknown";
  }
  if (key === "purchase") {
    return profile.extras?.purchase ?? "unknown";
  }
  if (key === "home_grow") {
    const plantLimit = profile.extras?.home_grow_plants;
    if (plantLimit && plantLimit !== "unknown") return plantLimit;
    return profile.home_grow ?? "unknown";
  }
  if (key === "cbd") {
    return profile.extras?.cbd ?? "unknown";
  }
  if (key === "edibles_vapes") {
    const edibles = profile.extras?.edibles ?? "unknown";
    const vapes = profile.extras?.vapes ?? "unknown";
    return pickWorstStatus([edibles, vapes]);
  }
  return "unknown";
}

export function getExtrasStatus(
  profile: JurisdictionLawProfile,
  key: string
) {
  const raw = profile.extras?.[key as keyof JurisdictionLawProfile["extras"]];
  if (!raw) return "unknown";
  return String(raw);
}

export function buildExtrasItems(profile: JurisdictionLawProfile): ExtrasItem[] {
  const extras = profile.extras;
  if (!extras) return [];

  const priorityIndex = new Map(
    EXTRAS_PRIORITY.map((key, index) => [key, index])
  );

  const items = EXTRAS_PRIORITY.map((key) => {
    const raw = (extras as Record<string, string | undefined>)[key];
    const value = raw ?? "unknown";
    return {
      key,
      label: EXTRAS_LABELS[key] ?? key,
      value: formatExtrasValue(value),
      _rank: sortRank(value),
      _priority: priorityIndex.get(key) ?? 999
    };
  });

  items.sort((a, b) => {
    if (a._priority !== b._priority) return a._priority - b._priority;
    return a._rank - b._rank;
  });

  return items.map(({ _rank, _priority, ...item }) => {
    void _rank;
    void _priority;
    return item;
  });
}

export function extrasPreview(items: ExtrasItem[]) {
  return items.slice(0, 2);
}

export function buildExtrasCards(
  profile: JurisdictionLawProfile,
  limit = 3
): ExtrasCard[] {
  const cards = EXTRAS_CATALOG.map((entry, index) => {
    const rawValue = resolveExtrasCardValue(profile, entry.key);
    const value =
      typeof rawValue === "string" ? formatExtrasValue(rawValue) : "Unknown";
    return {
      key: entry.key,
      title: entry.title,
      value,
      whyMatters: entry.whyMatters,
      userActionHint: entry.userActionHint,
      severityHint: entry.severityHint,
      _rank: sortRank(String(rawValue ?? "unknown")),
      _severity: severityRank(entry.severityHint),
      _index: index
    };
  });

  cards.sort((a, b) => {
    if (a._severity !== b._severity) return a._severity - b._severity;
    if (a._rank !== b._rank) return a._rank - b._rank;
    return a._index - b._index;
  });

  return cards.slice(0, limit).map(({ _rank, _severity, _index, ...card }) => {
    void _rank;
    void _severity;
    void _index;
    return card;
  });
}

export function statusIconForExtras(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.startsWith("up to")) return "✅";
  const map: Record<ExtrasStatus, string> = {
    allowed: "✅",
    restricted: "⚠️",
    illegal: "⛔",
    unknown: "⚪"
  };
  return map[(normalized as ExtrasStatus) ?? "unknown"] ?? "⚪";
}

export function extrasStatusToLevel(value: string): ResultStatusLevel {
  const normalized = value.toLowerCase();
  if (normalized === "allowed") return "green";
  if (normalized === "restricted") return "yellow";
  if (normalized === "illegal") return "red";
  return "gray";
}

export function buildExtrasView(profile: JurisdictionLawProfile, paid: boolean) {
  const items = buildExtrasItems(profile);
  return {
    preview: paid ? undefined : extrasPreview(items),
    full: paid ? items : undefined
  };
}
