const BASE_LEGAL_COLORS = {
  LEGAL_OR_DECRIM: "#cde7cf",
  LIMITED_OR_MEDICAL: "#f4e9c2",
  ILLEGAL: "#ead0d1",
  UNKNOWN: "#d7dcdc"
} as const;

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function brighten(hex: string, factor: number) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const mix = (channel: number) => clampChannel(channel + (255 - channel) * factor);
  return `#${mix(red).toString(16).padStart(2, "0")}${mix(green).toString(16).padStart(2, "0")}${mix(blue)
    .toString(16)
    .padStart(2, "0")}`;
}

export function resolveLegalFillColor(mapCategory: string) {
  const color = BASE_LEGAL_COLORS[mapCategory as keyof typeof BASE_LEGAL_COLORS];
  if (!color) {
    throw new Error(`UNKNOWN_MAP_CATEGORY: ${mapCategory}`);
  }
  return color;
}

export function resolveLegalHoverColor(mapCategory: string) {
  return brighten(resolveLegalFillColor(mapCategory), 0.24);
}

export function resolveLegalFillOpacity(mapCategory: string) {
  switch (mapCategory) {
    case "LIMITED_OR_MEDICAL":
      return 0.56;
    case "LEGAL_OR_DECRIM":
      return 0.54;
    case "ILLEGAL":
      return 0.56;
    default:
      return 0.5;
  }
}

export function resolveLegalHoverOpacity(mapCategory: string) {
  return Math.max(0.34, resolveLegalFillOpacity(mapCategory) - 0.12);
}
