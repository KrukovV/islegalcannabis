export function parseWikiMainArticle(text) {
  const raw = String(text || "");
  const leadWS = (raw.match(/^\s*/) || [""])[0];
  const s = raw.slice(leadWS.length);
  const match = s.match(/^Main articles?:\s*/i);
  if (!match) return null;
  const rest = s.slice(match[0].length);
  const dotIndex = rest.indexOf(".");
  const newlineIndex = rest.search(/\r?\n/);
  const marker = rest.match(
    /\s+(?=(Production|Prohibited|Illegal|Decriminal|Legal|Allowed|Permitted|Medical|Enforced|Banned|Cultivation|Possession)\b)/i
  );
  let articlePart = "";
  let tail = "";
  const markerIndex = marker && marker.index !== undefined ? marker.index : -1;
  const cutCandidates = [dotIndex, newlineIndex, markerIndex].filter((i) => i !== -1);
  const cutIndex = cutCandidates.length ? Math.min(...cutCandidates) : -1;
  if (cutIndex !== -1) {
    articlePart = rest.slice(0, cutIndex).trim();
    tail = rest.slice(cutIndex);
  } else {
    articlePart = rest.trim();
    tail = "";
  }
  if (!articlePart) return null;
  const hasAnd = /\s+and\s+/i.test(articlePart);
  const titles = articlePart
    .split(/\s+and\s+|,/i)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!titles.length) return null;
  return {
    leadWS,
    prefix: match[0],
    titles,
    tail,
    hasAnd
  };
}

export function renderNotesFragments(text) {
  const parsed = parseWikiMainArticle(text);
  if (!parsed) return null;
  const parts = [];
  if (parsed.leadWS) {
    parts.push({ type: "text", value: parsed.leadWS });
  }
  parts.push({ type: "text", value: parsed.prefix });
  for (let i = 0; i < parsed.titles.length; i += 1) {
    const title = parsed.titles[i];
    const slug = encodeURIComponent(title.replace(/\s+/g, "_").trim());
    const href = `https://en.wikipedia.org/wiki/${slug}`;
    if (i > 0) {
      const sep = parsed.hasAnd && i === parsed.titles.length - 1 ? " and " : ", ";
      parts.push({ type: "text", value: sep });
    }
    parts.push({ type: "link", href, text: title });
  }
  if (parsed.tail) {
    parts.push({ type: "text", value: parsed.tail });
  }
  return parts;
}
