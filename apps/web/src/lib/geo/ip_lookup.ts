export type IpLookupResult = {
  ok: boolean;
  iso: string;
  state?: string;
  reason?: string;
};

export async function resolveIpLocation(): Promise<IpLookupResult> {
  try {
    const res = await fetch("/api/whereami");
    const data = await res.json();

    if (!res.ok || !data?.country) {
      return { ok: false, iso: "UNKNOWN", reason: "ip_lookup_failed" };
    }

    return {
      ok: true,
      iso: String(data.country).toUpperCase(),
      state: data.region ? String(data.region).toUpperCase() : undefined
    };
  } catch {
    return { ok: false, iso: "UNKNOWN", reason: "ip_lookup_failed" };
  }
}
