import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type MemoryItem = {
  id: string;
  query: string;
  intent: string;
  location?: string;
  answer: string;
  score: number;
  used: number;
  ts: number;
  last_used: number;
};

type MemoryStore = {
  items: MemoryItem[];
};

const DEFAULT_MEMORY_FILE = path.resolve(process.cwd(), "data/ai/memory.json");
const MAX_MEMORY_ITEMS = 200;

function getMemoryFile() {
  return process.env.AI_MEMORY_FILE || DEFAULT_MEMORY_FILE;
}

function ensureStoreDir(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function normalizeQuery(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeQuery(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function loadStore(): MemoryStore {
  const file = getMemoryFile();
  if (!fs.existsSync(file)) {
    return { items: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as MemoryStore;
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch {
    return { items: [] };
  }
}

function saveStore(store: MemoryStore) {
  const file = getMemoryFile();
  ensureStoreDir(file);
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

function matchQueryScore(query: string, candidate: string) {
  const left = tokenize(query);
  const right = new Set(tokenize(candidate));
  if (!left.length || !right.size) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(left.length, right.size);
}

function computeId(query: string, intent: string, location: string | undefined, answer: string) {
  return crypto
    .createHash("sha1")
    .update(`${normalizeQuery(query)}|${intent}|${location || ""}|${normalizeQuery(answer).slice(0, 200)}`)
    .digest("hex")
    .slice(0, 16);
}

export function loadMemory() {
  return loadStore().items;
}

export function retrieveMemory(query: string, intent: string, location?: string, currentLocation?: string) {
  const store = loadStore();
  const normalizedLocation = String(location || "").trim().toUpperCase();
  const normalizedCurrentLocation = String(currentLocation || location || "").trim().toUpperCase();
  const matches = store.items
    .map((item) => {
      if (item.intent !== intent) return null;
      if (normalizedLocation && String(item.location || "").toUpperCase() !== normalizedLocation) return null;
      if (normalizedCurrentLocation && String(item.location || "").toUpperCase() !== normalizedCurrentLocation) return null;
      const queryScore = matchQueryScore(query, item.query);
      if (!queryScore && !normalizeQuery(query).includes(normalizeQuery(item.query))) return null;
      const score = item.score + queryScore + Math.min(item.used * 0.05, 0.3);
      return { item, score };
    })
    .filter(Boolean)
    .sort((left, right) => right!.score - left!.score)
    .slice(0, 3) as Array<{ item: MemoryItem; score: number }>;

  if (matches.length) {
    const now = Date.now();
    const touched = new Set(matches.map((entry) => entry.item.id));
    for (const item of store.items) {
      if (!touched.has(item.id)) continue;
      item.used += 1;
      item.last_used = now;
    }
    saveStore(store);
  }

  return matches.map((entry) => entry.item);
}

export function scoreMemory(answer: string, hasFollowUp: boolean, reused: boolean) {
  let score = 0;
  if (answer.length > 120) score += 0.3;
  if (hasFollowUp) score += 0.5;
  if (reused) score += 0.2;
  return Number(score.toFixed(2));
}

export function saveMemory(input: {
  query: string;
  intent: string;
  location?: string;
  answer: string;
  score: number;
}) {
  const store = loadStore();
  const location = String(input.location || "").trim().toUpperCase() || undefined;
  const id = computeId(input.query, input.intent, location, input.answer);
  const now = Date.now();
  const existing = store.items.find((item) => item.id === id);
  if (existing) {
    existing.answer = input.answer;
    existing.score = Math.max(existing.score, input.score);
    existing.used += 1;
    existing.ts = existing.ts || now;
    existing.last_used = now;
  } else {
    store.items.push({
      id,
      query: input.query,
      intent: input.intent,
      location,
      answer: input.answer,
      score: input.score,
      used: 0,
      ts: now,
      last_used: now
    });
  }
  store.items.sort((left, right) => {
    const scoreDelta = right.score - left.score;
    if (scoreDelta !== 0) return scoreDelta;
    return right.last_used - left.last_used;
  });
  if (store.items.length > MAX_MEMORY_ITEMS) {
    store.items.splice(MAX_MEMORY_ITEMS);
  }
  saveStore(store);
}
