import { describe, expect, it } from "vitest";
import { GET } from "./route";
import fs from "node:fs";
import path from "node:path";

const STATUS_LEVELS = new Set(["green", "yellow", "red", "gray"]);

describe("GET /api/check contract", () => {
  it("returns known profile for US-CA", async () => {
    const req = new Request("http://localhost/api/check?country=US&region=CA");
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.profile?.id).toBe("US-CA");
    expect(json.profile?.sources?.length).toBeGreaterThan(0);
    expect(json.profile?.updated_at).toBeTruthy();
    expect(STATUS_LEVELS.has(json.status?.level)).toBe(true);
    expect(json.iso_meta?.alpha2).toBe("US");
    expect(json.iso_meta?.flag).toBe("🇺🇸");
    expect(Array.isArray(json.verify_links)).toBe(true);
    expect("machine_verified" in (json.profile ?? {})).toBe(true);
    expect(json.verification?.level).toBeTruthy();
    expect(json.verification_level).toBeTruthy();
    expect(Array.isArray(json.verification?.verify_links)).toBe(true);
    if (json.verify_status !== undefined) {
      expect(["verified", "pending"].includes(json.verify_status)).toBe(true);
    }
    if (json.evidence_kind !== undefined) {
      expect(["law", "non_law"].includes(json.evidence_kind)).toBe(true);
    }
  });

  it("returns known profile for DE", async () => {
    const req = new Request("http://localhost/api/check?country=DE");
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.profile?.id).toBe("DE");
    expect(json.profile?.sources?.length).toBeGreaterThan(0);
    expect(json.profile?.updated_at).toBeTruthy();
    expect(STATUS_LEVELS.has(json.status?.level)).toBe(true);
  });

  it("surfaces machine verified evidence when available", async () => {
    const mvPath = path.join(
      process.cwd(),
      "data",
      "legal_ssot",
      "machine_verified.json"
    );
    const backup = fs.existsSync(mvPath) ? fs.readFileSync(mvPath, "utf8") : null;
    fs.mkdirSync(path.dirname(mvPath), { recursive: true });
    const payload = {
      generated_at: "2026-01-20T00:00:00.000Z",
      entries: {
        DE: {
          iso2: "DE",
          status_recreational: "illegal",
          status_medical: "legal",
          medical_allowed: true,
          confidence: "low",
          official_source_ok: true,
          evidence_kind: "law",
          source_url: "https://www.gesetze-im-internet.de/",
          snapshot_path: "data/source_snapshots/DE/2026-01-20/example.html",
          retrieved_at: "2026-01-20T00:00:00.000Z",
          evidence: [
            {
              type: "html_anchor",
              anchor: "Section 1",
              quote: "Medical cannabis is permitted.",
              snapshot_path: "data/source_snapshots/DE/2026-01-20/example.html"
            }
          ]
        }
      }
    };
    fs.writeFileSync(mvPath, JSON.stringify(payload, null, 2) + "\n");
    try {
      const req = new Request("http://localhost/api/check?country=DE");
      const res = await GET(req);
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(Array.isArray(json.profile?.machine_verified?.evidence)).toBe(true);
      expect(json.profile?.machine_verified?.evidence?.length).toBeGreaterThan(0);
      expect(json.verification?.level).toBe("machine_verified");
      expect(json.verification?.evidence_count).toBeGreaterThan(0);
      expect(Array.isArray(json.verification?.verify_links)).toBe(true);
    } finally {
      if (backup === null) {
        fs.unlinkSync(mvPath);
      } else {
        fs.writeFileSync(mvPath, backup);
      }
    }
  });

  it("prefers manual when gps/ip data is present", async () => {
    const req = new Request(
      "http://localhost/api/check?country=US&region=CA&method=manual&approxLat=34.05&approxLon=-118.24"
    );
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.viewModel?.location?.method).toBe("manual");
    expect(json.iso_meta?.alpha2).toBe("US");
  });

  it("prefers gps when manual is missing", async () => {
    const req = new Request(
      "http://localhost/api/check?country=US&region=CA&method=gps&approxLat=34.05&approxLon=-118.24"
    );
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.viewModel?.location?.method).toBe("gps");
  });

  it("falls back to ip when manual and gps are missing", async () => {
    const req = new Request(
      "http://localhost/api/check?country=US&region=CA&method=ip"
    );
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.viewModel?.location?.method).toBe("ip");
  });

  it("returns BAD_REQUEST for invalid country", async () => {
    const req = new Request("http://localhost/api/check?country=ZZ");
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("BAD_REQUEST");
  });

  it("includes offline fallback meta when enabled", async () => {
    const fallbackPath = path.join(
      process.cwd(),
      "data",
      "fallback",
      "legal_fallback.json"
    );
    const fallbackDir = path.dirname(fallbackPath);
    const backup = fs.existsSync(fallbackPath)
      ? fs.readFileSync(fallbackPath, "utf8")
      : null;
    fs.mkdirSync(fallbackDir, { recursive: true });
    fs.writeFileSync(
      fallbackPath,
      JSON.stringify(
        {
          generated_at: "2026-01-10T00:00:00Z",
          source: "offline_fallback",
          countries: {
            US: {
              status_recreational: "illegal",
              status_medical: "allowed",
              sources: ["https://www.congress.gov/"],
              confidence: "low",
              notes: "pulled from verified local SSOT"
            }
          }
        },
        null,
        2
      ) + "\n"
    );

    const prevEnv = process.env.OFFLINE_FALLBACK;
    process.env.OFFLINE_FALLBACK = "1";
    const req = new Request("http://localhost/api/check?country=US&region=CA");
    const res = await GET(req);
    const json = await res.json();
    process.env.OFFLINE_FALLBACK = prevEnv;

    expect(json.viewModel?.meta?.offlineFallback).toBe(true);
    expect(Array.isArray(json.viewModel?.meta?.offlineFallbackSources)).toBe(true);
    expect(json.viewModel?.meta?.offlineFallbackSources?.[0]?.url).toContain(
      "congress.gov"
    );

    if (backup === null) {
      fs.unlinkSync(fallbackPath);
    } else {
      fs.writeFileSync(fallbackPath, backup);
    }
  });
});
