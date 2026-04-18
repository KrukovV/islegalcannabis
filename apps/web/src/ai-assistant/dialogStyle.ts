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

export function fallbackHumanized(location?: string | null, _intent?: string, language?: string) {
  if (language === "ru") {
  return [
    "Смотри, отвечу прямо:",
    "",
      `Ситуация зависит от ${location || "страны"}, но лучше не рисковать без понимания деталей.`
    ].join("\n");
  }
  return [
    "Let me answer this plainly:",
    "",
    `The situation depends on ${location || "the country"}, so it is better not to take risks without the details.`
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
  return styled;
}
