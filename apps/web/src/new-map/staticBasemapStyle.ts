import type { StyleSpecification, VectorSourceSpecification } from "maplibre-gl";
import acceptedStyle from "./styles/positron.ab81337170d2.json";

// The approved 93-layer style and provider TileJSON delivery fields are pinned
// together. Native tile loading needs neither a style nor a descriptor request.
const carto = acceptedStyle.sources.carto;
const cartoSource: VectorSourceSpecification = {
  ...carto,
  type: "vector",
  bounds: [carto.bounds[0], carto.bounds[1], carto.bounds[2], carto.bounds[3]]
};
export const STATIC_BASEMAP_STYLE = {
  ...acceptedStyle,
  sources: { carto: cartoSource }
} as StyleSpecification;
