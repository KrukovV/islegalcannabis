import type { Product, Trip, TripEvent, TripPlan } from "@islegal/shared";

type TripStoreState = {
  trip: Trip | null;
  events: TripEvent[];
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type AddEventResult = {
  added: boolean;
  reason?:
    | "inactive"
    | "ended"
    | "limit_reached"
    | "duplicate_jurisdiction";
  locked?: boolean;
};

const STORAGE_KEY = "tripStore:v1";
const memoryStore = new Map<string, string>();

const PRODUCT_DAYS: Record<Product, number> = {
  TRIP_PASS_7_DAYS: 7,
  TRIP_PASS_14_DAYS: 14
};

function getStorage(): StorageLike {
  if (typeof window === "undefined" || !window.localStorage) {
    return {
      getItem: (key) => memoryStore.get(key) ?? null,
      setItem: (key, value) => {
        memoryStore.set(key, value);
      }
    };
  }
  return window.localStorage;
}

function nowIso() {
  return new Date().toISOString();
}

function toMs(iso: string) {
  return new Date(iso).getTime();
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function readState(): TripStoreState {
  const storage = getStorage();
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return { trip: null, events: [] };
  }
  try {
    const parsed = JSON.parse(raw) as TripStoreState;
    return {
      trip: parsed.trip ?? null,
      events: Array.isArray(parsed.events) ? parsed.events : []
    };
  } catch {
    return { trip: null, events: [] };
  }
}

function writeState(state: TripStoreState) {
  const storage = getStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function computeEndsAt(startedAt: string, days: number) {
  return new Date(toMs(startedAt) + days * 24 * 60 * 60 * 1000).toISOString();
}

function deriveLimits(plan: TripPlan, days?: number) {
  if (plan === "trip_pass") {
    const maxDays = days && days > 0 ? days : 7;
    return { maxDays, maxEvents: 500 };
  }
  return { maxDays: 1, maxEvents: 5 };
}

function enforceTripExpiry(state: TripStoreState): TripStoreState {
  if (!state.trip || !state.trip.isActive) {
    return state;
  }

  if (state.trip.plan === "trip_pass" && state.trip.endsAt) {
    if (Date.now() > toMs(state.trip.endsAt)) {
      state.trip = { ...state.trip, isActive: false };
    }
  }
  return state;
}

export function resetTripStoreForTests() {
  memoryStore.clear();
}

export function startTrip(plan: TripPlan, days?: number): Trip {
  const { maxDays, maxEvents } = deriveLimits(plan, days);
  const startedAt = nowIso();
  const trip: Trip = {
    id: createId("trip"),
    startedAt,
    endsAt: plan === "trip_pass" ? computeEndsAt(startedAt, maxDays) : null,
    isActive: true,
    plan,
    maxDays,
    maxEvents
  };

  const state = readState();
  writeState({ ...state, trip });
  return trip;
}

export function startTripPass(days: number): Trip {
  return startTrip("trip_pass", days);
}

export function startTripPassFromProduct(product: Product): Trip {
  return startTrip("trip_pass", PRODUCT_DAYS[product]);
}

export function stopTrip(): Trip | null {
  const state = readState();
  if (!state.trip) return null;
  const trip = { ...state.trip, isActive: false };
  writeState({ ...state, trip });
  return trip;
}

export function getActiveTrip(): Trip | null {
  const state = enforceTripExpiry(readState());
  writeState(state);
  if (!state.trip?.isActive) {
    return null;
  }
  return state.trip;
}

export function listEvents(tripId: string, limit?: number): TripEvent[] {
  const state = readState();
  const events = state.events.filter((event) => event.tripId === tripId);
  if (typeof limit === "number") {
    return events.slice(0, limit);
  }
  return events;
}

export function purgeOld() {
  const state = enforceTripExpiry(readState());
  if (!state.trip) {
    return;
  }
  const { trip } = state;
  const now = Date.now();
  const windowStart =
    trip.plan === "free"
      ? now - trip.maxDays * 24 * 60 * 60 * 1000
      : toMs(trip.startedAt);
  const filtered = state.events.filter((event) => {
    if (event.tripId !== trip.id) {
      return true;
    }
    return toMs(event.ts) >= windowStart;
  });
  const trimmed = filtered.filter((event) => event.tripId !== trip.id);
  const tripEvents = filtered.filter((event) => event.tripId === trip.id);

  const capped =
    tripEvents.length > trip.maxEvents
      ? tripEvents.slice(-trip.maxEvents)
      : tripEvents;

  writeState({ ...state, events: [...trimmed, ...capped] });
}

export function addEvent(
  payload: Omit<TripEvent, "id" | "tripId" | "ts">,
  ts?: string
): AddEventResult {
  const state = enforceTripExpiry(readState());
  if (!state.trip || !state.trip.isActive) {
    writeState(state);
    return { added: false, reason: "inactive" };
  }

  const trip = state.trip;
  const now = Date.now();
  const nowIsoValue = ts ?? nowIso();

  if (trip.plan === "trip_pass" && trip.endsAt && now > toMs(trip.endsAt)) {
    writeState({ ...state, trip: { ...trip, isActive: false } });
    return { added: false, reason: "ended" };
  }

  const tripEvents = state.events.filter((event) => event.tripId === trip.id);
  const lastEvent = tripEvents[tripEvents.length - 1];

  if (lastEvent && lastEvent.jurisdictionKey === payload.jurisdictionKey) {
    return { added: false, reason: "duplicate_jurisdiction" };
  }

  const ageMs = now - toMs(trip.startedAt);
  const maxAgeMs = trip.maxDays * 24 * 60 * 60 * 1000;
  if (trip.plan === "free" && ageMs > maxAgeMs) {
    writeState({ ...state, trip: { ...trip, isActive: false } });
    return { added: false, reason: "limit_reached", locked: true };
  }

  if (trip.plan === "free" && tripEvents.length >= trip.maxEvents) {
    writeState({ ...state, trip: { ...trip, isActive: false } });
    return { added: false, reason: "limit_reached", locked: true };
  }

  const event: TripEvent = {
    ...payload,
    id: createId("event"),
    tripId: trip.id,
    ts: nowIsoValue
  };
  writeState({ ...state, events: [...state.events, event] });
  purgeOld();
  return { added: true };
}

export function getTripSummary() {
  const state = enforceTripExpiry(readState());
  if (!state.trip) {
    return { trip: null, events: [] };
  }

  const events = state.events.filter((event) => event.tripId === state.trip?.id);
  return { trip: state.trip, events };
}

export function formatRemaining(trip: Trip): string | null {
  if (!trip.endsAt) return null;
  const diffMs = toMs(trip.endsAt) - Date.now();
  if (diffMs <= 0) return "ended";
  const hours = Math.ceil(diffMs / (60 * 60 * 1000));
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.ceil(hours / 24);
  return `${days}d`;
}
