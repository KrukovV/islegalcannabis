export function isCannabisWikiSource(url: string | null | undefined) {
  return /\/wiki\/Cannabis_in_/i.test(String(url || "").trim());
}

export function assertCannabisWikiSource(url: string | null | undefined) {
  if (!isCannabisWikiSource(url)) {
    throw new Error(`INVALID_SOURCE: only Cannabis_in_* allowed, got: ${String(url || "")}`);
  }
  return String(url || "").trim();
}
