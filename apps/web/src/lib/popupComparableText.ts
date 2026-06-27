import type { CountryCardEntry } from "@/new-map/map.types";
import { getCannabisProfileCardSections } from "@/lib/cannabisProfile";
import { sanitizeEvidenceQuoteText } from "@/lib/text/sanitizeEvidenceQuoteText";

function normalizeText(value: string) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function pushUnique(target: string[], seen: Set<string>, value: string) {
  const normalized = normalizeText(sanitizeEvidenceQuoteText(value));
  if (!normalized) return;
  const key = normalized.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  target.push(normalized);
}

export function collectPopupComparableText(entry: CountryCardEntry) {
  const items: string[] = [];
  const seen = new Set<string>();

  for (const reason of [...entry.panel.critical, ...entry.panel.info, ...entry.panel.why]) {
    pushUnique(items, seen, reason.text);
  }

  for (const section of getCannabisProfileCardSections(entry.cannabisProfile)) {
    for (const item of section.items) {
      pushUnique(items, seen, item);
    }
  }

  return items;
}
