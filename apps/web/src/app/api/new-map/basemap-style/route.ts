import { getPublicOrigin } from "../_lib/publicOrigin";
import { NEW_MAP_WATER_COLOR } from "@/new-map/mapPalette";

const UPSTREAM_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const SUBTLE_BOUNDARY = "rgba(198, 208, 215, 0.18)";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const response = await fetch(UPSTREAM_STYLE_URL, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return new Response(`basemap_style_fetch_failed:${response.status}`, { status: 502 });
  }

  const style = await response.json();
  const origin = getPublicOrigin(request);
  if (style && typeof style === "object" && Array.isArray(style.layers)) {
    delete (style as Record<string, unknown>).light;
    delete (style as Record<string, unknown>).fog;
    delete (style as Record<string, unknown>).sky;
    delete (style as Record<string, unknown>).terrain;
    for (const layer of style.layers as Array<{ id?: string; type?: string; paint?: Record<string, unknown> }>) {
      if (layer.paint && typeof layer.paint === "object") {
        for (const key of Object.keys(layer.paint)) {
          if (/color-adjust/i.test(key)) {
            delete layer.paint[key];
          }
        }
      }
      if (!layer?.paint || typeof layer.paint !== "object") continue;
      if (layer.type === "background") {
        layer.paint = {
          ...layer.paint,
          "background-color": NEW_MAP_WATER_COLOR
        };
        continue;
      }
      if (layer.id === "water" && layer.type === "fill") {
        layer.paint = {
          ...layer.paint,
          "fill-color": NEW_MAP_WATER_COLOR,
          "fill-antialias": false
        };
        continue;
      }
      if (layer.id === "boundary_country_outline" && layer.type === "line") {
        layer.paint = {
          ...layer.paint,
          "line-color": SUBTLE_BOUNDARY,
          "line-opacity": 0.18
        };
        continue;
      }
      if (layer.id === "boundary_country_inner" && layer.type === "line") {
        layer.paint = {
          ...layer.paint,
          "line-color": "rgba(141, 154, 168, 0.2)",
          "line-opacity": 0.2
        };
      }
    }
  }
  const sources = style && typeof style === "object" ? style.sources : null;
  if (sources && typeof sources === "object" && sources.carto && typeof sources.carto === "object") {
    sources.carto = {
      ...sources.carto,
      url: `${origin}/api/new-map/basemap-source`
    };
  }

  return Response.json(style, {
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate"
    }
  });
}
