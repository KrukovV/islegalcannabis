import NewMapClientEntry from "./NewMapClientEntry";
import { NEW_MAP_RUNTIME_IDENTITY, NEW_MAP_VISIBLE_STAMP } from "./runtimeConfig";

export const dynamic = "force-static";

export default function NewMapPage() {
  return (
    <NewMapClientEntry
      countriesUrl="/api/new-map/countries"
      visibleStamp={NEW_MAP_VISIBLE_STAMP}
      runtimeIdentity={NEW_MAP_RUNTIME_IDENTITY}
    />
  );
}
