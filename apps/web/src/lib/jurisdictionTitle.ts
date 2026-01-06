import { TOP25 } from "@islegal/shared";

const displayByKey = new Map(
  TOP25.map((entry) => [entry.jurisdictionKey, entry])
);

export function titleForJurisdiction(input: {
  country: string;
  region?: string;
}): string {
  const key = input.region ? `${input.country}-${input.region}` : input.country;
  const entry = displayByKey.get(key);
  if (entry) {
    if (entry.country === "US" && entry.region) {
      return `${entry.displayName}, US`;
    }
    return entry.displayName;
  }
  if (input.country === "US" && input.region) {
    return `${input.region}, US`;
  }
  return key;
}
