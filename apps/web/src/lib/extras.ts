import type { ExtrasItem, ExtrasStatus, JurisdictionLawProfile } from "@islegal/shared";

const EXTRAS_LABELS: { key: string; label: string }[] = [
  { key: "purchase", label: "Purchase" },
  { key: "retail_shops", label: "Retail shops" },
  { key: "edibles", label: "Edibles" },
  { key: "vapes", label: "Vapes" },
  { key: "concentrates", label: "Concentrates" },
  { key: "cbd", label: "CBD" },
  { key: "paraphernalia", label: "Paraphernalia" },
  { key: "medical_card", label: "Medical card" },
  { key: "home_grow_plants", label: "Home grow plants" },
  { key: "social_clubs", label: "Social clubs" },
  { key: "hemp", label: "Hemp" },
  { key: "workplace", label: "Workplace" },
  { key: "testing_dui", label: "Testing / DUI" }
];

function formatStatus(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "allowed") return "Allowed";
  if (normalized === "restricted") return "Restricted";
  if (normalized === "illegal") return "Illegal";
  if (normalized === "unknown") return "Unknown";
  if (normalized.startsWith("up to")) return value;
  return value;
}

export function buildExtrasItems(profile: JurisdictionLawProfile): ExtrasItem[] {
  const extras = profile.extras;
  if (!extras) return [];

  return EXTRAS_LABELS.map((entry) => {
    const raw = (extras as Record<string, string | undefined>)[entry.key];
    const value = raw ?? "unknown";
    return {
      key: entry.key,
      label: entry.label,
      value: formatStatus(value)
    };
  });
}

export function extrasPreview(items: ExtrasItem[]) {
  return items.slice(0, 2);
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

export function buildExtrasView(profile: JurisdictionLawProfile, paid: boolean) {
  const items = buildExtrasItems(profile);
  return {
    preview: paid ? undefined : extrasPreview(items),
    full: paid ? items : undefined
  };
}
