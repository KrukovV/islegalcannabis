import {
  mapCategoryToColor,
  mapCategoryToHoverColor,
  type MapCategory
} from "@/lib/resultStatus";

export function resolveLegalFillColor(mapCategory: MapCategory) {
  return mapCategoryToColor(mapCategory);
}

export function resolveLegalHoverColor(mapCategory: MapCategory) {
  return mapCategoryToHoverColor(mapCategory);
}

export function resolveLegalFillOpacity(mapCategory: MapCategory) {
  switch (mapCategory) {
    case "LEGAL_OR_DECRIM":
      return 0.54;
    case "LIMITED_OR_MEDICAL":
      return 0.56;
    case "ILLEGAL":
      return 0.56;
    case "UNKNOWN":
      return 0.5;
    default:
      throw new Error(`UNKNOWN_MAP_CATEGORY_OPACITY: ${mapCategory}`);
  }
}

export function resolveLegalHoverOpacity(mapCategory: MapCategory) {
  return Math.max(0.34, resolveLegalFillOpacity(mapCategory) - 0.12);
}
