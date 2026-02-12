export const BANNED_STDOUT_PATTERNS = [
  /Implement \{feature\}/i,
  /context left/i,
  /for shortcuts/i,
  /›\s*Write tests/i,
  /@filename/i
];

export function sanitizeLines(lines) {
  const list = Array.isArray(lines) ? lines : [];
  return list.filter(
    (line) => !BANNED_STDOUT_PATTERNS.some((pattern) => pattern.test(String(line)))
  );
}

export function sanitizeWithCount(text) {
  const raw = String(text ?? "");
  const lines = raw.split(/\r?\n/);
  const sanitizedLines = sanitizeLines(lines);
  const removed = lines.length - sanitizedLines.length;
  return { text: sanitizedLines.join("\n"), removed: Math.max(0, removed) };
}

export function sanitizeText(text) {
  const sanitized = sanitizeWithCount(text);
  return sanitized.text;
}
