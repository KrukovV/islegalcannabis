import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import NewMapDeferredRuntime from "./_components/NewMapDeferredRuntime";
import "./globals.css";
import ServiceWorkerGuard from "@/plugins/serviceWorkerGuard";
import { getBuildStamp } from "@/lib/buildStamp";

const NEW_MAP_STYLE_URL = "/api/new-map/basemap-style?v=20260331-host-header-same-origin";
const NEW_MAP_COUNTRIES_URL = "/api/new-map/countries";
const NEW_MAP_BUILD_VERSION = encodeURIComponent(getBuildStamp().buildId);
const NEW_MAP_CARD_INDEX_URL = `/new-map-card-index.json?v=${NEW_MAP_BUILD_VERSION}`;

export const metadata: Metadata = {
  title: "isLegalCannabis",
  description: "Educational cannabis law summary by location.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

const NEW_MAP_PREFETCH_SCRIPT = `
(() => {
  if (typeof window === "undefined") return;
  const trace = window.__NEW_MAP_TRACE__ || {
    t0: performance.now(),
    marks: {},
    metrics: {}
  };
  trace.t0 = typeof trace.t0 === "number" ? trace.t0 : performance.now();
  trace.marks = trace.marks || {};
  trace.metrics = trace.metrics || {};
  window.__NEW_MAP_TRACE__ = trace;
  trace.marks.NM_T0_ROUTE_START = trace.marks.NM_T0_ROUTE_START || performance.now();
  if (window.__NEW_MAP_PREFETCH__) return;
  const loadJson = (url) =>
    fetch(url, { cache: "force-cache", credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  window.__NEW_MAP_PREFETCH__ = {
    style: loadJson("${NEW_MAP_STYLE_URL}"),
    countries: loadJson("${NEW_MAP_COUNTRIES_URL}"),
    cardIndex: loadJson("${NEW_MAP_CARD_INDEX_URL}")
  };
  Promise.allSettled([
    window.__NEW_MAP_PREFETCH__.style,
    window.__NEW_MAP_PREFETCH__.countries,
    window.__NEW_MAP_PREFETCH__.cardIndex
  ]).then(() => {
    trace.marks.NM_T1_HEAD_PREFETCH_READY = trace.marks.NM_T1_HEAD_PREFETCH_READY || performance.now();
  });
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NEW_MAP_PREFETCH_SCRIPT }} />
      </head>
      <body>
        <ServiceWorkerGuard />
        <NewMapDeferredRuntime />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
