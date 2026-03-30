export type ColorMode = "light" | "dark" | "system";
export type ColorKey = "green" | "yellow" | "red" | "gray";
export type ThemeStatus = "Legal" | "Decrim" | "Illegal" | "Unenforced" | "Limited" | "Unknown";

export type StatusThemeToken = {
  icon: string;
  colorKey: ColorKey;
  colorHex: string;
  labelRu: string;
  shortRu: string;
  labelEn: string;
};

export const COLOR_KEY_HEX: Record<ColorKey, string> = {
  green: "#3AAE6B",
  yellow: "#E4B94A",
  red: "#D05C5C",
  gray: "#9B9B9B"
};

export const STATUS_MAP: Record<ThemeStatus, StatusThemeToken> = {
  Legal: {
    icon: "✅",
    colorKey: "green",
    colorHex: COLOR_KEY_HEX.green,
    labelRu: "Разрешено",
    shortRu: "Разрешено",
    labelEn: "Legal"
  },
  Limited: {
    icon: "⚠️",
    colorKey: "yellow",
    colorHex: COLOR_KEY_HEX.yellow,
    labelRu: "Только мед",
    shortRu: "Только мед",
    labelEn: "Medical only"
  },
  Decrim: {
    icon: "✅",
    colorKey: "yellow",
    colorHex: COLOR_KEY_HEX.yellow,
    labelRu: "Декриминализовано",
    shortRu: "Декрим",
    labelEn: "Decriminalized"
  },
  Illegal: {
    icon: "⛔",
    colorKey: "red",
    colorHex: COLOR_KEY_HEX.red,
    labelRu: "Запрещено",
    shortRu: "Запрещено",
    labelEn: "Illegal"
  },
  Unenforced: {
    icon: "⚠️",
    colorKey: "yellow",
    colorHex: COLOR_KEY_HEX.yellow,
    labelRu: "Ограниченно",
    shortRu: "Ограниченно",
    labelEn: "Unenforced"
  },
  Unknown: {
    icon: "⚠️",
    colorKey: "gray",
    colorHex: COLOR_KEY_HEX.gray,
    labelRu: "Не подтверждено",
    shortRu: "Не подтверждено",
    labelEn: "Unknown"
  }
};

export function resolveColorMode(): ColorMode {
  const raw =
    process.env.NEXT_PUBLIC_COLOR_MODE ||
    process.env.COLOR_MODE ||
    process.env.THEME_MODE ||
    "system";
  if (raw === "light" || raw === "dark" || raw === "system") {
    return raw;
  }
  return "system";
}

export function resolveMapBase(resolvedMode?: "light" | "dark"): "light" | "dark" {
  const base = process.env.NEXT_PUBLIC_MAP_BASE;
  if (base === "dark" || base === "light") {
    return base;
  }
  return resolvedMode === "dark" ? "dark" : "light";
}
