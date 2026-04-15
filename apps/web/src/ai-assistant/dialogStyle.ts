function pickDeterministic<T>(items: T[], seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return items[hash % items.length];
}

function startsWithOpener(text: string) {
  return /^(Смотри, как есть:|Разберём спокойно:|Если по факту:|Коротко и честно:|Here it is plainly:|Let's break it down calmly:|If we keep it factual:|Short and honest:)/.test(
    text
  );
}

function addOpener(text: string, intent?: string, language?: string) {
  const openers =
    language === "ru"
      ? ["Смотри, как есть:", "Разберём спокойно:", "Если по факту:", "Коротко и честно:"]
      : ["Here it is plainly:", "Let's break it down calmly:", "If we keep it factual:", "Short and honest:"];
  return `${pickDeterministic(openers, `${intent || "general"}|${text}`)}\n\n${text}`;
}

function hasFollowUp(text: string) {
  return /(\?\s*$|Хочешь|Показать|Разобрать|Продолжим|Want to|Show you|Go deeper|Keep going)/i.test(text);
}

function soften(text: string, language?: string) {
  const preservedWarning = "Crossing borders with cannabis is illegal in most countries.";
  const warningToken = "__BORDER_WARNING__";
  const safeText = text.replaceAll(preservedWarning, warningToken);
  if (language === "ru") {
    return safeText
      .replace(/\billegal\b/gi, "формально запрещено")
      .replace(/\bhigh risk\b/gi, "риск реально высокий")
      .replaceAll(warningToken, preservedWarning);
  }
  return safeText
    .replace(/\billegal\b/gi, "formally illegal")
    .replace(/\bhigh risk\b/gi, "the risk is genuinely high")
    .replaceAll(warningToken, preservedWarning);
}

function buildFollowUp(intent?: string, language?: string) {
  if (language === "ru") {
    if (intent === "legal") return "Хочешь сравнить с другой страной?";
    if (intent === "airport" || intent === "travel" || intent === "tourists") {
      return "Показать, где самые строгие аэропорты?";
    }
    if (intent === "culture") return "Разобрать глубже культуру или перейти к законам?";
    return "Продолжим?";
  }
  if (intent === "legal") return "Want to compare it with another country?";
  if (intent === "airport" || intent === "travel" || intent === "tourists") {
    return "Want me to show the strictest airports next?";
  }
  if (intent === "culture") return "Want to go deeper into the culture or switch to the law side?";
  return "Want to keep going?";
}

export function fallbackHumanized(location?: string | null, intent?: string, language?: string) {
  if (language === "ru") {
    return [
      "Смотри, отвечу прямо:",
      "",
      "Ситуация зависит от страны, но лучше не рисковать без понимания деталей.",
      "",
      buildFollowUp(intent, "ru").replace(/^Хочешь.*$/, `Хочешь — разберём ${location || "конкретную страну"} по факту?`)
    ].join("\n");
  }
  return [
    "Let me answer this plainly:",
    "",
    "The situation depends on the country, so it is better not to take risks without the details.",
    "",
    `Want me to break down ${location || "a specific country"} properly?`
  ].join("\n");
}

export function applyDialogStyle(text: string, intent?: string, language?: string) {
  if (!text) return text;
  let styled = text.trim();
  if (!styled) return styled;
  if (!startsWithOpener(styled)) {
    styled = addOpener(styled, intent, language);
  }
  styled = soften(styled, language);
  if (!hasFollowUp(styled)) {
    styled += `\n\n${buildFollowUp(intent, language)}`;
  }
  return styled;
}
