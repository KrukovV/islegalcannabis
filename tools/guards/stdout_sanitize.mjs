export const BANNED_STDOUT_PATTERNS = [
  /Implement \{feature\}/i,
  /context left/i,
  /for shortcuts/i
];

export function sanitizeLines(lines) {
  const list = Array.isArray(lines) ? lines : [];
  return list.filter(
    (line) => !BANNED_STDOUT_PATTERNS.some((pattern) => pattern.test(String(line)))
  );
}

export function sanitizeText(text) {
  const raw = String(text ?? "");
  const lines = raw.split(/\r?\n/);
  return sanitizeLines(lines).join("\n");
}
