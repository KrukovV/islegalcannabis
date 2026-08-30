export type WikiTruthGoalRequirement = {
  id: string;
  status: string;
  completionImpact: string;
  reason: string;
};

export type WikiTruthGoalAcceptanceView = {
  generatedAt: string;
  localOnly: boolean;
  nonMutating: boolean;
  legal: Record<string, number | string>;
  store: Record<string, number | string>;
  map: Record<string, number | string | boolean>;
  production: Record<string, boolean>;
  requirements: WikiTruthGoalRequirement[];
  completionBlockers: WikiTruthGoalRequirement[];
  goalAchieved: boolean;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "MISSING") {
  const result = String(value || "").trim();
  return result || fallback;
}

function scalarRecord(value: unknown): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const [key, item] of Object.entries(record(value))) {
    if (typeof item === "boolean") out[key] = item;
    else if (typeof item === "number" && Number.isFinite(item)) out[key] = item;
    else out[key] = text(item);
  }
  return out;
}

function numberStringRecord(value: unknown): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const [key, item] of Object.entries(record(value))) {
    if (typeof item === "number" && Number.isFinite(item)) out[key] = item;
    else out[key] = text(item);
  }
  return out;
}

function requirements(value: unknown): WikiTruthGoalRequirement[] {
  return Array.isArray(value) ? value.map((item) => {
    const row = record(item);
    return {
      id: text(row.id),
      status: text(row.status),
      completionImpact: text(row.completion_impact),
      reason: text(row.reason),
    };
  }).filter((item) => item.id !== "MISSING") : [];
}

export const emptyWikiTruthGoalAcceptance: WikiTruthGoalAcceptanceView = {
  generatedAt: "",
  localOnly: true,
  nonMutating: true,
  legal: {},
  store: {},
  map: {},
  production: {},
  requirements: [],
  completionBlockers: [],
  goalAchieved: false,
};

export function normalizeWikiTruthGoalAcceptance(payload: unknown): WikiTruthGoalAcceptanceView {
  const value = record(payload);
  return {
    generatedAt: text(value.generated_at, ""),
    localOnly: value.local_only === true,
    nonMutating: value.non_mutating === true,
    legal: numberStringRecord(value.legal),
    store: numberStringRecord(value.store),
    map: scalarRecord(value.map),
    production: scalarRecord(value.production) as Record<string, boolean>,
    requirements: requirements(value.requirements),
    completionBlockers: requirements(value.completion_blockers),
    goalAchieved: value.GOAL_ACHIEVED === true,
  };
}
