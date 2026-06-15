import NewMapClientEntry from "@/app/new-map/NewMapClientEntry";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import type { CountryPageData } from "@/lib/countryPageStorage";
import type { SeoLocale } from "@/lib/seo/i18n";

type CountryMapClientProps = {
  countriesUrl: string;
  visibleStamp: string;
  runtimeIdentity: RuntimeIdentity;
  initialGeoCode?: string | null;
  seoCountryData?: CountryPageData | null;
  seoCountryIndex?: Record<string, CountryPageData>;
  locale?: SeoLocale;
};

export default function CountryMapClient(props: CountryMapClientProps) {
  return <NewMapClientEntry {...props} />;
}
