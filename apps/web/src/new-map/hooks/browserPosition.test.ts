import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireBrowserPosition } from "./browserPosition";

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function installNavigator(value: Navigator) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value
  });
}

function position(lat = 50.0755, lng = 14.4378): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy: 12,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({})
    },
    timestamp: Date.now(),
    toJSON: () => ({})
  } as GeolocationPosition;
}

function geoError(code: number, message: string) {
  return {
    code,
    message,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3
  } as GeolocationPositionError;
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
  } else {
    // @ts-expect-error test cleanup
    delete globalThis.navigator;
  }
});

describe("browserPosition", () => {
  it("returns the first successful high-accuracy position without fallback", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success(position());
    });
    installNavigator({
      geolocation: {
        getCurrentPosition,
        watchPosition: vi.fn(),
        clearWatch: vi.fn()
      },
      permissions: {
        query: vi.fn()
      }
    } as unknown as Navigator);

    const result = await acquireBrowserPosition();

    expect(result.coords.latitude).toBe(50.0755);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0]?.[2]).toMatchObject({
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 300000
    });
  });

  it("falls back to a low-accuracy retry after an initial timeout", async () => {
    const getCurrentPosition = vi
      .fn<(_success: PositionCallback, _error?: PositionErrorCallback, _options?: PositionOptions) => void>()
      .mockImplementationOnce((_success, error) => {
        error?.(geoError(3, "Timeout expired"));
      })
      .mockImplementationOnce((success) => {
        success(position(48.8566, 2.3522));
      });
    installNavigator({
      geolocation: {
        getCurrentPosition,
        watchPosition: vi.fn(),
        clearWatch: vi.fn()
      },
      permissions: {
        query: vi.fn()
      }
    } as unknown as Navigator);

    const result = await acquireBrowserPosition();

    expect(result.coords.latitude).toBe(48.8566);
    expect(result.coords.longitude).toBe(2.3522);
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(getCurrentPosition.mock.calls[1]?.[2]).toMatchObject({
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 600000
    });
  });

  it("falls back to low-accuracy watchPosition for transient browser failures when permission is granted", async () => {
    const getCurrentPosition = vi
      .fn<(_success: PositionCallback, _error?: PositionErrorCallback, _options?: PositionOptions) => void>()
      .mockImplementationOnce((_success, error) => {
        error?.(geoError(3, "Timeout expired"));
      })
      .mockImplementationOnce((_success, error) => {
        error?.(geoError(2, "Position unavailable"));
      });
    const watchPosition = vi.fn((success: PositionCallback) => {
      queueMicrotask(() => {
        success(position(40.7128, -74.006));
      });
      return 77;
    });
    const clearWatch = vi.fn();
    installNavigator({
      geolocation: {
        getCurrentPosition,
        watchPosition,
        clearWatch
      },
      permissions: {
        query: vi.fn().mockResolvedValue({ state: "granted" })
      }
    } as unknown as Navigator);

    const result = await acquireBrowserPosition();

    expect(result.coords.latitude).toBe(40.7128);
    expect(result.coords.longitude).toBe(-74.006);
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(watchPosition).toHaveBeenCalledTimes(1);
    expect(watchPosition.mock.calls[0]?.[2]).toMatchObject({
      enableHighAccuracy: false,
      timeout: 20000,
      maximumAge: 600000
    });
    expect(clearWatch).toHaveBeenCalledWith(77);
  });

  it("surfaces the second browser error when retries stay non-transient", async () => {
    const getCurrentPosition = vi
      .fn<(_success: PositionCallback, _error?: PositionErrorCallback) => void>()
      .mockImplementationOnce((_success, error) => {
        error?.(geoError(4, "Unknown failure"));
      });
    const watchPosition = vi.fn();
    installNavigator({
      geolocation: {
        getCurrentPosition,
        watchPosition,
        clearWatch: vi.fn()
      },
      permissions: {
        query: vi.fn().mockResolvedValue({ state: "denied" })
      }
    } as unknown as Navigator);

    await expect(acquireBrowserPosition()).rejects.toMatchObject({
      code: 4,
      message: "Unknown failure"
    });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("does not use watch fallback for a denied permission", async () => {
    const getCurrentPosition = vi
      .fn<(_success: PositionCallback, _error?: PositionErrorCallback, _options?: PositionOptions) => void>()
      .mockImplementationOnce((_success, error) => {
        error?.(geoError(3, "Timeout expired"));
      })
      .mockImplementationOnce((_success, error) => {
        error?.(geoError(1, "Permission denied"));
      });
    const watchPosition = vi.fn();
    installNavigator({
      geolocation: {
        getCurrentPosition,
        watchPosition,
        clearWatch: vi.fn()
      },
      permissions: {
        query: vi.fn().mockResolvedValue({ state: "denied" })
      }
    } as unknown as Navigator);

    await expect(acquireBrowserPosition()).rejects.toMatchObject({
      code: 1,
      message: "Permission denied"
    });
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(watchPosition).not.toHaveBeenCalled();
  });
});
