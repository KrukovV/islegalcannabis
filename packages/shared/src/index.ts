export type {
  ConfidenceLevel,
  ExtrasItem,
  ExtrasStatus,
  JurisdictionLawProfile,
  LocationMethod,
  LocationResolution,
  Product,
  ResultViewModel,
  ResultStatusLevel,
  RiskFlag,
  Source
} from "./types";
export type { Trip, TripEvent, TripPlan } from "./types";
export type { StatusLevel, StatusResult } from "./status";
export { computeStatus } from "./status";
export { API_CONTRACT_VERSION } from "./api/contract";
export { DATA_SCHEMA_VERSION } from "./data/schema";
export { getAppVersion } from "./version";
export { computeConfidence } from "./confidence/computeConfidence";
export { scoreUrl } from "./sources/trust";
export { riskTextMap, riskTextFor } from "./riskText";
export { EXTRAS_PRIORITY } from "./extras";
export {
  EXTRAS_CATALOG,
  type ExtrasCatalogItem,
  type ExtrasSeverity
} from "./extras/extrasCatalog";
export { STATUS_BANNERS } from "./copy/statusBanners";
export {
  haversineKm,
  nearestLegalCountry,
  nearestLegalState
} from "./geo/nearestLegal";
export type { GeoPoint, NearestCandidate, NearestResult } from "./geo/nearestLegal";
export * from "./slugMap";
export * from "./top25";
