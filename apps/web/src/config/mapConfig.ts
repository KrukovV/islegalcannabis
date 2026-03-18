export const MAP_GEOMETRY_SOURCE: "geojson" | "vector" = "geojson";

export const MAP_VECTOR_TILE_SOURCE_LAYER = "countries";
export const MAP_VECTOR_TILE_SOURCE_ID = "countries";

export const MAP_VECTOR_TILE_SOURCE = {
  type: "vector" as const,
  tiles: ["https://YOUR_TILE_SERVER/{z}/{x}/{y}.pbf"],
  minzoom: 0,
  maxzoom: 6
};
