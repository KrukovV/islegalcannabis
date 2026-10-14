import type { StyleSpecification, VectorSourceSpecification } from "maplibre-gl";
import acceptedStyle from "./styles/positron.9e07dd691d25.json";

// Keep the approved93-layer presentation. The compatible provider descriptor
// selects its maintained dataset; pinning its dated tile URL would freeze it.
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
