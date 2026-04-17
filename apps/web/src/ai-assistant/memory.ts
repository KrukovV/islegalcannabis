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
  ts: number;
  last_used: number;
};

type MemoryStore = {
  items: MemoryItem[];
};

const DEFAULT_MEMORY_FILE = path.resolve(process.cwd(), "data/ai/memory.json");
const MAX_MEMORY_ITEMS = 100;

function getMemoryFile() {
  return process.env.AI_MEMORY_FILE || DEFAULT_MEMORY_FILE;
}

function ensureStoreDir(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

function matchQueryScore(query: string, candidate: string) {
  const left = tokenize(query);
  const right = new Set(tokenize(candidate));
  if (!left.length || !right.size) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(1, Math.min(left.length, right.size));
}

function loadStore(): MemoryStore {
  const file = getMemoryFile();
  if (!fs.existsSync(file)) return { items: [] };
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

function computeId(query: string, intent: string, location: string | undefined, answer: string) {
  return crypto
    .createHash("sha1")
    .update(`${normalizeText(query)}|${intent}|${location || ""}|${normalizeText(answer).slice(0, 160)}`)
    .digest("hex")
    .slice(0, 16);
}

function hasConcreteSignal(text: string) {
  return /[0-9]|legal|illegal|limited|medical|decriminal|risk|airport|border|customs|reggae|rastafari|marley|tosh|420|counterculture|cannabis|weed|ganja|закон|риск|границ|аэропорт|медицин|культур|регги/i.test(
    text
  );
}

function isGeneric(text: string) {
  const normalized = normalizeText(text);
  return (
    normalized.length < 60 ||
    /\b(generally|overall|in general|it depends|i don't know|cannot assist|request failed)\b/i.test(text) ||
    /в целом|зависит от ситуации|не знаю|модель не ответила|уточни вопрос/i.test(text)
  );
}

function isRepeat(answer: string, items: MemoryItem[]) {
  const normalized = normalizeText(answer).slice(0, 220);
  if (!normalized) return true;
  return items.some((item) => normalizeText(item.answer).slice(0, 220) === normalized);
}

export function cleanupMemory() {
  const store = loadStore();
  store.items = store.items
    .filter((item) => item.score > 0.5 && !isGeneric(item.answer))
    .sort((left, right) => right.score - left.score || right.last_used - left.last_used)
    .slice(0, MAX_MEMORY_ITEMS);
  saveStore(store);
}

export function loadMemory() {
  return loadStore().items;
}

export function getMemory(query: string, intent: string, location?: string) {
  const normalizedQuery = normalizeText(query).slice(0, 40);
  const normalizedLocation = String(location || "").trim().toUpperCase();
  if (!normalizedQuery) return null;
  const store = loadStore();
  const match = store.items
    .filter((item) => item.intent === intent)
    .filter((item) => !normalizedLocation || !item.location || item.location === normalizedLocation)
    .map((item) => ({ item, queryScore: matchQueryScore(query, item.query) }))
    .filter((entry) => entry.queryScore > 0 || normalizeText(entry.item.query).includes(normalizedQuery))
    .sort((left, right) => right.item.score + right.queryScore - (left.item.score + left.queryScore) || right.item.last_used - left.item.last_used)[0]?.item;
  if (!match) return null;
  const now = Date.now();
  match.last_used = now;
  saveStore(store);
  return match;
}

export function retrieveMemory(query: string, intent: string, location?: string, currentLocation?: string) {
  const memory = getMemory(query, intent, currentLocation || location);
  return memory ? [memory] : [];
}

export function scoreMemory(answer: string, continued: boolean) {
  if (isGeneric(answer) || !hasConcreteSignal(answer)) return 0;
  let score = 0;
  if (answer.length > 120) score += 0.4;
  if (continued) score += 0.4;
  if (!isGeneric(answer)) score += 0.2;
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
  store.items = store.items.filter((item) => item.score > 0.5 && !isGeneric(item.answer));
  if (!input.answer || input.answer.length < 100) {
    saveStore(store);
    return;
  }
  if (input.score < 0.6 || isGeneric(input.answer) || !hasConcreteSignal(input.answer) || isRepeat(input.answer, store.items)) {
    saveStore(store);
    return;
  }
  const location = String(input.location || "").trim().toUpperCase() || undefined;
  const id = computeId(input.query, input.intent, location, input.answer);
  const now = Date.now();
  const existing = store.items.find((item) => item.id === id);
  if (existing) {
    existing.score = Math.max(existing.score, input.score);
    existing.last_used = now;
  } else {
    store.items.push({
      id,
      query: input.query,
      intent: input.intent,
      location,
      answer: input.answer,
      score: input.score,
      ts: now,
      last_used: now
    });
  }
  store.items = store.items
    .sort((left, right) => right.score - left.score || right.last_used - left.last_used)
    .slice(0, MAX_MEMORY_ITEMS);
  saveStore(store);
}
