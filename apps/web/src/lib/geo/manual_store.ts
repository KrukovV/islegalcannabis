export type ManualGeoSelection = {
  iso: string;
  state?: string;
  ts: string;
};

const MANUAL_KEY = "geo.manual";

export function loadManualSelection(): ManualGeoSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MANUAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ManualGeoSelection;
    if (!parsed?.iso) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveManualSelection(input: {
  iso: string;
  state?: string;
}): ManualGeoSelection {
  const entry: ManualGeoSelection = {
    iso: input.iso.toUpperCase(),
    state: input.state?.toUpperCase(),
    ts: new Date().toISOString()
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(MANUAL_KEY, JSON.stringify(entry));
    } catch {
      // Ignore storage failures.
    }
  }
  return entry;
}

export function clearManualSelection() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(MANUAL_KEY);
  } catch {
    // Ignore storage failures.
  }
}
