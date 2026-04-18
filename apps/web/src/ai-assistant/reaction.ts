export function buildReaction(input: string, type: string) {
  const q = String(input || "").toLowerCase();

  if (type === "greeting") {
    return "Все норм 🙂";
  }

  if (type === "intent") {
    if (q.includes("yo") || q.includes("wazz") || q.includes("sup")) return "Got you.";
    if (q.includes("bro") || q.includes("бро")) return "Смотри, по факту:";
    return "Вот что рядом:";
  }

  return "";
}
