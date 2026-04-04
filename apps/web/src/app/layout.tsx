import type { Metadata } from "next";
import GeoInit from "./_components/GeoInit";
import "./globals.css";
import RuntimeMiddleware from "@/plugins/runtimeMiddleware";
import BuildWatcher from "@/plugins/buildWatcher";
import ServiceWorkerGuard from "@/plugins/serviceWorkerGuard";

export const metadata: Metadata = {
  title: "isLegalCannabis",
  description: "Educational cannabis law summary by location.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.png", type: "image/png" }
    ]
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head />
      <body>
        <RuntimeMiddleware />
        <ServiceWorkerGuard />
        <BuildWatcher />
        <GeoInit />
        {children}
      </body>
    </html>
  );
}
