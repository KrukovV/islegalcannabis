import { NextResponse } from "next/server";

function colorForDomain(domain: string) {
  let hash = 0;
  for (const char of domain) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  const hue = hash % 360;
  return {
    background: `hsl(${hue} 72% 88%)`,
    foreground: `hsl(${hue} 62% 28%)`,
  };
}

function safeDomain(value: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.-]/g, "")
    .slice(0, 80);
}

export function GET(request: Request) {
  const domain = safeDomain(new URL(request.url).searchParams.get("domain"));
  const letter = (domain.match(/[a-z0-9]/)?.[0] || "?").toUpperCase();
  const { background, foreground } = colorForDomain(domain || "official-source");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" role="img" aria-label="${domain} favicon"><rect width="32" height="32" rx="7" fill="${background}"/><text x="16" y="21" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="16" font-weight="800" fill="${foreground}">${letter}</text></svg>`;

  return new NextResponse(svg, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}
