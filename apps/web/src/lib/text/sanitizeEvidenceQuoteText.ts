export function sanitizeEvidenceQuoteText(input: string) {
  let text = String(input || "")
    .replace(/style\s*=\s*"(?:[^"\\]|\\.)*"\s*\|/gi, " ")
    .replace(/style\s*=\s*'(?:[^'\\]|\\.)*'\s*\|/gi, " ")
    .replace(/<gallery[\s\S]*?<\/gallery>/gi, " ")
    .replace(/\{\|[\s\S]*?\|\}/g, " ")
    .replace(/\{\{[^}]+\}\}/g, " ")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^/>]*\/>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/\[\[(?:File|Image|Media|Category):[^\]]+\]\]/gi, " ")
    .replace(/\[\s*https?:\/\/[^\s\]]+\s+([^\]]+)\]/gi, "$1")
    .replace(/\bhttps?:\/\/[^\s<>()]+/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/^(?:[^.!?]{0,160}\]\]\s*)+/i, "")
    .replace(/[^.!?]*\|\d{2,4}x\d{2,4}px\]\]/gi, " ")
    .replace(/\]\]+/g, " ")
    .replace(/\[\[+/g, " ")
    .replace(/\[[0-9]+\]/g, " ")
    .replace(/\bCategory:[^.]+/gi, " ")
    .replace(/(?:^|\s)\*+\s+/g, " ")
    .replace(/(^|\s)\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  text = text.replace(
    /^(?:History|Culture|Legality|Enforcement|Products|Traditional use|Local names?|Further reading|See also|External links|Bibliography|References)\.\s*/i,
    ""
  );

  const appendixIndex = text.search(/\b(?:Further reading|See also|External links|Bibliography|References)\b/i);
  if (appendixIndex === 0) return "";
  if (appendixIndex > 0) text = text.slice(0, appendixIndex).trim();

  return text
    .replace(/^(?:[\],;:.\s-]|\[)+/, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.?!]){2,}/g, "$1")
    .trim();
}
