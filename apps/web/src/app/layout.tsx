import type { Metadata } from "next";
import Script from "next/script";
import GeoInit from "./_components/GeoInit";
import "./globals.css";
import { isMapEnabled } from "@/lib/env";

export const metadata: Metadata = {
  title: "isLegalCannabis",
  description: "Educational cannabis law summary by location.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const mapEnabled = isMapEnabled();
  return (
    <html lang="en">
      <head>
        {mapEnabled ? (
          <>
            <link rel="stylesheet" href="/vendor/leaflet/leaflet.css" />
            <link rel="stylesheet" href="/vendor/leaflet/markercluster/MarkerCluster.css" />
            <link rel="stylesheet" href="/vendor/leaflet/markercluster/MarkerCluster.Default.css" />
          </>
        ) : null}
      </head>
      <body>
        <GeoInit />
        {children}
      </body>
      {mapEnabled ? (
        <>
          <Script src="/vendor/leaflet/leaflet.js" strategy="beforeInteractive" />
          <Script src="/vendor/leaflet/markercluster/leaflet.markercluster.js" strategy="beforeInteractive" />
        </>
      ) : null}
    </html>
  );
}
