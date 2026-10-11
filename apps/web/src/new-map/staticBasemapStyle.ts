import type { StyleSpecification } from "maplibre-gl";
import acceptedStyle from "./styles/positron.227fe978a37b.json";

// Byte-for-byte snapshot of the production-approved Carto style returned by
// /api/new-map/basemap-style. Public first paint has no style HTTP dependency.
export const STATIC_BASEMAP_STYLE = acceptedStyle as StyleSpecification;
