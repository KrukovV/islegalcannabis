import type { Metadata } from "next";
import NewMapClientEntry from "./NewMapClientEntry";
import { NEW_MAP_RUNTIME_IDENTITY, NEW_MAP_VISIBLE_STAMP } from "./runtimeConfig";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default function NewMapPage() {
  return (
    <NewMapClientEntry
      countriesUrl="/api/new-map/countries"
      visibleStamp={NEW_MAP_VISIBLE_STAMP}
      runtimeIdentity={NEW_MAP_RUNTIME_IDENTITY}
    />
  );
}
