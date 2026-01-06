const VERIFICATION_WINDOW_MS = 5 * 60 * 60 * 1000;

type HeaderSnapshot = {
  etag?: string | null;
  lastModified?: string | null;
  contentLength?: string | null;
};

const verificationByKey = new Map<string, string>();
const sourceCache = new Map<string, HeaderSnapshot>();

function normalizeHeader(value: string | null) {
  if (!value) return null;
  return String(value).trim();
}

function detectHeaderChange(previous?: HeaderSnapshot, next?: HeaderSnapshot) {
  if (!previous || !next) return false;
  return (
    previous.etag !== next.etag ||
    previous.lastModified !== next.lastModified ||
    previous.contentLength !== next.contentLength
  );
}

async function fetchHeaders(url: string) {
  let response: Response | null = null;
  try {
    response = await fetch(url, { method: "HEAD" });
  } catch {
    response = null;
  }

  if (!response || !response.ok) {
    try {
      response = await fetch(url, { method: "GET" });
    } catch {
      response = null;
    }
  }

  if (!response || !response.ok) {
    return { ok: false as const };
  }

  return {
    ok: true as const,
    etag: normalizeHeader(response.headers.get("etag")),
    lastModified: normalizeHeader(response.headers.get("last-modified")),
    contentLength: normalizeHeader(response.headers.get("content-length"))
  };
}

function toMs(value: string) {
  return new Date(value).getTime();
}

export function resetVerificationCacheForTests() {
  verificationByKey.clear();
  sourceCache.clear();
}

export function setVerificationTimestampForTests(
  jurisdictionKey: string,
  iso: string
) {
  verificationByKey.set(jurisdictionKey, iso);
}

export async function verifyJurisdictionFreshness(
  jurisdictionKey: string,
  sources: { url: string }[],
  now = new Date(),
  fetchFn: typeof fetchHeaders = fetchHeaders
) {
  const cached = verificationByKey.get(jurisdictionKey);
  if (cached && now.getTime() - toMs(cached) < VERIFICATION_WINDOW_MS) {
    return { fresh: true, needsReview: false, lastVerifiedAt: cached };
  }

  if (!sources.length) {
    return { fresh: false, needsReview: true, lastVerifiedAt: cached ?? null };
  }

  let hadFailure = false;
  let hasChange = false;

  for (const source of sources) {
    const url = source.url;
    const previous = sourceCache.get(url);
    const result = await fetchFn(url);
    if (!result.ok) {
      hadFailure = true;
      continue;
    }

    const next = {
      etag: result.etag,
      lastModified: result.lastModified,
      contentLength: result.contentLength
    };
    if (detectHeaderChange(previous, next)) {
      hasChange = true;
    }
    sourceCache.set(url, next);
  }

  if (hadFailure || hasChange) {
    return { fresh: false, needsReview: true, lastVerifiedAt: cached ?? null };
  }

  const nowIso = now.toISOString();
  verificationByKey.set(jurisdictionKey, nowIso);
  return { fresh: true, needsReview: false, lastVerifiedAt: nowIso };
}

export { VERIFICATION_WINDOW_MS };
