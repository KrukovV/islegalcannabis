import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import NewMapDeferredRuntime from "./_components/NewMapDeferredRuntime";
import "./globals.css";
import ServiceWorkerGuard from "@/plugins/serviceWorkerGuard";
import { NEW_MAP_WATER_COLOR } from "@/new-map/mapPalette";
import { getStaticCountriesAsset } from "@/new-map/staticCountries";

const NEW_MAP_COUNTRIES_URL = getStaticCountriesAsset().url;
const YANDEX_METRIKA_ID = 108419114;
const MS_VALIDATE_CONTENT = "8160A885E417B2396DD1C0633F13C70F";
const NEW_MAP_FIRST_VISUAL_EVENT = "new-map:first-visual-ready";
const YANDEX_METRIKA_INTERACTION_DELAY_MS = 1200;
const YANDEX_METRIKA_IDLE_FALLBACK_MS = 60000;

function isLocalHost(host: string) {
  const normalized = host.startsWith("[")
    ? host.slice(1, host.indexOf("]")).toLowerCase()
    : (host.split(":")[0]?.toLowerCase() || "");
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

export const metadata: Metadata = {
  metadataBase: new URL("https://www.islegal.info"),
  title: {
    default: "Is cannabis legal?",
    template: "%s | islegal.info"
  },
  description:
    "Cannabis legality by country and US states. Laws, enforcement, possession limits, and travel risks.",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  alternates: {
    canonical: "/"
  },
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

const NEW_MAP_PREFETCH_SCRIPT = `
(() => {
  const host = globalThis;
  const trace = host.__NEW_MAP_TRACE__ || {
    t0: performance.now(),
    marks: {},
    metrics: {}
  };
  trace.t0 = typeof trace.t0 === "number" ? trace.t0 : performance.now();
  trace.marks = trace.marks || {};
  trace.metrics = trace.metrics || {};
  host.__NEW_MAP_TRACE__ = trace;
  trace.marks.NM_T0_ROUTE_START = trace.marks.NM_T0_ROUTE_START || performance.now();
  if (host.__NEW_MAP_PREFETCH__) return;
  const loadJson = (url) =>
    fetch(url, { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  host.__NEW_MAP_PREFETCH__ = {
    countries: loadJson("${NEW_MAP_COUNTRIES_URL}")
  };
  Promise.allSettled([
    host.__NEW_MAP_PREFETCH__.countries
  ]).then(() => {
    trace.marks.NM_T1_HEAD_PREFETCH_READY = trace.marks.NM_T1_HEAD_PREFETCH_READY || performance.now();
  });
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const routeHeaders = await headers();
  const htmlLang = routeHeaders.get("x-route-locale") || "en";
  const showVercelAnalytics = !isLocalHost(routeHeaders.get("host") || "");
  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <head>
        <meta name="msvalidate.01" content={MS_VALIDATE_CONTENT} />
        <link
          rel="preconnect"
          href="https://basemaps.cartocdn.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://tiles.basemaps.cartocdn.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href={NEW_MAP_COUNTRIES_URL}
          as="fetch"
          crossOrigin="anonymous"
        />
        <script dangerouslySetInnerHTML={{ __html: NEW_MAP_PREFETCH_SCRIPT }} />
        <Script id="yandex-metrika" strategy="afterInteractive">
          {`
            (function(w,d){
              if (w.__ISLEGAL_METRIKA_BOOTSTRAPPED__) return;
              w.__ISLEGAL_METRIKA_BOOTSTRAPPED__ = true;
              var counterId = ${YANDEX_METRIKA_ID};
              var scriptUrl = "https://mc.yandex.ru/metrika/tag.js?id=" + counterId;
              var startTimer = 0;
              var started = false;

              function loadCounter() {
                if (started) return;
                started = true;
                w.dataLayer = w.dataLayer || [];
                (function(m,e,t,r,i,k,a){
                  m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                  m[i].l=1*new Date();
                  for (var j = 0; j < d.scripts.length; j++) {
                    if (d.scripts[j].src === r) return;
                  }
                  k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a);
                })(w,d,"script",scriptUrl,"ym");

                w.ym(counterId, "init", {
                  ssr: true,
                  webvisor: true,
                  clickmap: true,
                  ecommerce: "dataLayer",
                  referrer: d.referrer,
                  url: location.href,
                  accurateTrackBounce: true,
                  trackLinks: true
                });
              }

              function schedule(delay) {
                if (started) return;
                w.clearTimeout(startTimer);
                startTimer = w.setTimeout(function() {
                  if ("requestIdleCallback" in w) {
                    w.requestIdleCallback(loadCounter, { timeout: 2500 });
                  } else {
                    loadCounter();
                  }
                }, delay);
              }

              w.addEventListener("${NEW_MAP_FIRST_VISUAL_EVENT}", function() {
                w.__ISLEGAL_MAP_FIRST_VISUAL_READY__ = true;
              }, { once: true });
              w.addEventListener("load", function() {
                schedule(${YANDEX_METRIKA_IDLE_FALLBACK_MS});
              }, { once: true });
              ["pointerdown", "keydown", "touchstart", "wheel", "scroll"].forEach(function(type) {
                w.addEventListener(type, function() {
                  schedule(${YANDEX_METRIKA_INTERACTION_DELAY_MS});
                }, { once: true, passive: true });
              });
              if (w.__NEW_MAP_TRACE__ && w.__NEW_MAP_TRACE__.marks && w.__NEW_MAP_TRACE__.marks.NM_T7_FIRST_FILL_RENDERED) {
                w.__ISLEGAL_MAP_FIRST_VISUAL_READY__ = true;
              } else if (d.readyState === "complete") {
                schedule(${YANDEX_METRIKA_IDLE_FALLBACK_MS});
              }
            })(globalThis, globalThis["doc" + "ument"]);
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
        {showVercelAnalytics ? <Analytics /> : null}
      </body>
    </html>
  );
}
