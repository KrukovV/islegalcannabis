import type { JurisdictionLawProfile } from "./types";

export type ExtrasLevel = "green" | "yellow" | "red";

export type ExtrasBreakdown = {
  key: string;
  title: string;
  level: ExtrasLevel;
  why: string;
};

function levelForValue(value: string): ExtrasLevel {
  if (value === "allowed") return "green";
  if (value === "restricted") return "yellow";
  if (value === "illegal") return "red";
  return "yellow";
}

function labelForValue(value: string): string {
  if (value === "allowed") return "allowed";
  if (value === "restricted") return "restricted";
  if (value === "illegal") return "illegal";
  return "unknown";
}

function extrasValue(
  profile: JurisdictionLawProfile,
  key: keyof NonNullable<JurisdictionLawProfile["extras"]>
): string {
  const value = profile.extras?.[key];
  return typeof value === "string" ? value : "unknown";
}

export function extrasFromProfile(
  profile: JurisdictionLawProfile
): ExtrasBreakdown[] {
  const items: ExtrasBreakdown[] = [];

  items.push({
    key: "public_use",
    title: "Public use",
    level: levelForValue(profile.public_use),
    why: `Public use: ${labelForValue(profile.public_use)}.`
  });

  const drivingIllegal = profile.risks.includes("driving");
  items.push({
    key: "driving",
    title: "Driving",
    level: drivingIllegal ? "red" : "green",
    why: drivingIllegal
      ? "Driving under the influence is illegal."
      : "Driving under the influence remains illegal."
  });

  items.push({
    key: "purchase",
    title: "Purchase",
    level: levelForValue(extrasValue(profile, "purchase")),
    why: `Purchase: ${labelForValue(extrasValue(profile, "purchase"))}.`
  });

  items.push({
    key: "home_grow",
    title: "Home grow",
    level: levelForValue(profile.home_grow ?? "unknown"),
    why: `Home grow: ${labelForValue(profile.home_grow ?? "unknown")}.`
  });

  items.push({
    key: "edibles",
    title: "Edibles",
    level: levelForValue(extrasValue(profile, "edibles")),
    why: `Edibles: ${labelForValue(extrasValue(profile, "edibles"))}.`
  });

  items.push({
    key: "vapes",
    title: "Vapes",
    level: levelForValue(extrasValue(profile, "vapes")),
    why: `Vapes: ${labelForValue(extrasValue(profile, "vapes"))}.`
  });

  items.push({
    key: "cbd",
    title: "CBD",
    level: levelForValue(extrasValue(profile, "cbd")),
    why: `CBD: ${labelForValue(extrasValue(profile, "cbd"))}.`
  });

  items.push({
    key: "cross_border",
    title: "Cross-border",
    level: "red",
    why: "Cross-border: illegal."
  });

  return items;
}
