import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "isLegalCannabis",
  description: "Educational cannabis law summary by location.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/vendor/leaflet/leaflet.css" />
        <link rel="stylesheet" href="/vendor/leaflet/markercluster/MarkerCluster.css" />
        <link rel="stylesheet" href="/vendor/leaflet/markercluster/MarkerCluster.Default.css" />
      </head>
      <body>{children}</body>
      <Script src="/vendor/leaflet/leaflet.js" strategy="beforeInteractive" />
      <Script src="/vendor/leaflet/markercluster/leaflet.markercluster.js" strategy="beforeInteractive" />
    </html>
  );
}
