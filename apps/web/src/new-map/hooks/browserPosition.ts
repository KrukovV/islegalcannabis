"use client";

type BrowserPositionResult =
  | { ok: true; position: GeolocationPosition }
  | { ok: false; error: Partial<GeolocationPositionError> & { code: number; message?: string } };
type BrowserPositionError = Extract<BrowserPositionResult, { ok: false }>["error"];

function isTransientGeoErrorCode(code: number | undefined) {
  return code === 2 || code === 3;
}

function normalizeGeoError(error: Partial<GeolocationPositionError> | null | undefined): BrowserPositionError {
  return {
    code: Number(error?.code || 2),
    message: error?.message
  };
}

function readBrowserPositionResult(options: PositionOptions): Promise<BrowserPositionResult> {
  return new Promise((resolve) => {
    globalThis.navigator.geolocation.getCurrentPosition(
      (position) => resolve({ ok: true, position }),
      (error) => resolve({ ok: false, error }),
      options
    );
  });
}

function watchBrowserPositionResult(
  options: PositionOptions,
  timeoutMs: number
): Promise<BrowserPositionResult> {
  return new Promise((resolve) => {
    let settled = false;
    let lastTransientError: BrowserPositionError | null = null;
    let watchId = 0;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    const finish = (result: BrowserPositionResult) => {
      if (settled) return;
      settled = true;
      globalThis.navigator.geolocation.clearWatch(watchId);
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      resolve(result);
    };
    watchId = globalThis.navigator.geolocation.watchPosition(
      (position) => {
        finish({ ok: true, position });
      },
      (error) => {
        const normalized = normalizeGeoError(error);
        if (normalized.code === 1) {
          finish({ ok: false, error: normalized });
          return;
        }
        if (isTransientGeoErrorCode(normalized.code)) {
          lastTransientError = normalized;
          return;
        }
        finish({ ok: false, error: normalized });
      },
      options
    );
    timeoutId = globalThis.setTimeout(() => {
      finish({
        ok: false,
        error: lastTransientError || {
          code: 3,
          message: "watch_timeout"
        }
      });
    }, timeoutMs);
  });
}

async function queryGeoPermissionState() {
  if (typeof globalThis.navigator === "undefined" || !globalThis.navigator.permissions?.query) {
    return "unsupported";
  }
  try {
    const status = await globalThis.navigator.permissions.query({
      name: "geolocation" as PermissionName
    });
    return status.state;
  } catch {
    return "unsupported";
  }
}

function shouldRetryWithWatch(
  result: BrowserPositionResult,
  permission: Awaited<ReturnType<typeof queryGeoPermissionState>>
) {
  if (result.ok) return false;
  if (isTransientGeoErrorCode(result.error?.code)) return true;
  return result.error?.code === 1 && permission === "granted";
}

export async function acquireBrowserPosition(timeoutMs = 15_000) {
  const firstAttempt = await readBrowserPositionResult({
    enableHighAccuracy: true,
    timeout: Math.min(timeoutMs, 8_000),
    maximumAge: 300_000
  });
  if (firstAttempt.ok) {
    return firstAttempt.position;
  }

  const secondAttempt =
    firstAttempt.error?.code === 3
      ? await readBrowserPositionResult({
          enableHighAccuracy: false,
          timeout: timeoutMs,
          maximumAge: 600_000
        })
      : firstAttempt;
  if (secondAttempt.ok) {
    return secondAttempt.position;
  }

  const permission = await queryGeoPermissionState();
  if (shouldRetryWithWatch(secondAttempt, permission)) {
    const watchTimeoutMs = Math.max(timeoutMs, 20_000);
    const watchAttempt = await watchBrowserPositionResult(
      {
        enableHighAccuracy: false,
        timeout: watchTimeoutMs,
        maximumAge: 600_000
      },
      watchTimeoutMs
    );
    if (watchAttempt.ok) {
      return watchAttempt.position;
    }
    throw watchAttempt.error || secondAttempt.error || firstAttempt.error;
  }

  throw secondAttempt.error || firstAttempt.error;
}
