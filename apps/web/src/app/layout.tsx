import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import NewMapDeferredRuntime from "./_components/NewMapDeferredRuntime";
import "./globals.css";
import ServiceWorkerGuard from "@/plugins/serviceWorkerGuard";
import { getBuildStamp } from "@/lib/buildStamp";
import { NEW_MAP_WATER_COLOR } from "@/new-map/mapPalette";

const NEW_MAP_STYLE_URL = "/api/new-map/basemap-style?v=20260331-host-header-same-origin";
const NEW_MAP_COUNTRIES_URL = "/api/new-map/countries";
const NEW_MAP_BUILD_VERSION = encodeURIComponent(getBuildStamp().buildId);
const NEW_MAP_CARD_INDEX_URL = `/api/new-map/card-index?v=${NEW_MAP_BUILD_VERSION}`;
const YANDEX_METRIKA_ID = 108419114;

export const metadata: Metadata = {
  title: "isLegalCannabis",
  description: "Educational cannabis law summary by location.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-master.png", sizes: "1024x1024", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
    fetch(url, { cache: "no-store", credentials: "same-origin" })
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
        <Script id="yandex-metrika" strategy="beforeInteractive">
          {`
            (function(m,e,t,r,i,k,a){
                m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                m[i].l=1*new Date();
                for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
                k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
            })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}', 'ym');

            ym(${YANDEX_METRIKA_ID}, 'init', {
              ssr: true,
              webvisor: true,
              clickmap: true,
              ecommerce: "dataLayer",
              referrer: document.referrer,
              url: location.href,
              accurateTrackBounce: true,
              trackLinks: true
            });
          `}
        </Script>
      </head>
      <body
        style={{
          background: NEW_MAP_WATER_COLOR,
          ["--new-map-water-color" as string]: NEW_MAP_WATER_COLOR
        }}
      >
        <noscript
          dangerouslySetInnerHTML={{
            __html: `<div><img src="https://mc.yandex.ru/watch/${YANDEX_METRIKA_ID}" style="position:absolute;left:-9999px" alt="" /></div>`
          }}
        />
        <ServiceWorkerGuard />
        <NewMapDeferredRuntime />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
