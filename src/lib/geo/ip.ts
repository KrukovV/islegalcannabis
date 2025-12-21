export type IpResolveResult = { country: "US"; region: "CA"; method: "ip" };

function isLocalIp(ip: string) {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.16.")
  );
}

export function resolveIpToJurisdiction(ip: string | null): IpResolveResult {
  if (!ip || isLocalIp(ip)) {
    return { country: "US", region: "CA", method: "ip" };
  }

  // TODO: Replace stub with a real IP geolocation provider.
  return { country: "US", region: "CA", method: "ip" };
}
