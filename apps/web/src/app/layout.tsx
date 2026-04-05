import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import GeoInit from "./_components/GeoInit";
import "./globals.css";
import RuntimeMiddleware from "@/plugins/runtimeMiddleware";
import BuildWatcher from "@/plugins/buildWatcher";
import ServiceWorkerGuard from "@/plugins/serviceWorkerGuard";

const NEW_MAP_STYLE_URL = "/api/new-map/basemap-style?v=20260331-host-header-same-origin";
const NEW_MAP_COUNTRIES_URL = "/api/new-map/countries";

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
  if (typeof window === "undefined" || window.__NEW_MAP_PREFETCH__) return;
  const loadJson = (url) =>
    fetch(url, { cache: "force-cache", credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  window.__NEW_MAP_PREFETCH__ = {
    style: loadJson("${NEW_MAP_STYLE_URL}"),
    countries: loadJson("${NEW_MAP_COUNTRIES_URL}")
  };
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
        <RuntimeMiddleware />
        <ServiceWorkerGuard />
        <BuildWatcher />
        <GeoInit />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
