import { NEW_MAP_WATER_COLOR } from "@/new-map/mapPalette";

const UPSTREAM_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const UPSTREAM_TILEJSON_URL = "https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json";
const SUBTLE_BOUNDARY = "rgba(198, 208, 215, 0.18)";
const STATIC_MAP_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
const SAME_ORIGIN_GLYPHS_PATH = "/api/new-map/basemap-glyph/{fontstack}/{range}.pbf";
const SAME_ORIGIN_SPRITE_PATH = "/api/new-map/basemap-sprite/sprite";

export const revalidate = 86400;
export const dynamic = "force-dynamic";

function requestOrigin(request: Request) {
  const fallback = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || fallback.host;
  const protocol = request.headers.get("x-forwarded-proto") || fallback.protocol.replace(/:$/u, "");
  return `${protocol}://${host}`;
}

export async function GET(request: Request) {
  const [styleResponse, tilejsonResponse] = await Promise.all([
    fetch(UPSTREAM_STYLE_URL, {
      headers: {
        accept: "application/json"
      },
      next: { revalidate: 86400 }
    }),
    fetch(UPSTREAM_TILEJSON_URL, {
      headers: {
        accept: "application/json"
      },
      next: { revalidate: 86400 }
    })
  ]);

  if (!styleResponse.ok) {
    return new Response(`basemap_style_fetch_failed:${styleResponse.status}`, { status: 502 });
  }
  if (!tilejsonResponse.ok) {
    return new Response(`basemap_source_fetch_failed:${tilejsonResponse.status}`, { status: 502 });
  }

  const [style, tilejson] = await Promise.all([
    styleResponse.json(),
    tilejsonResponse.json()
  ]);
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
    const tilejsonSource = tilejson && typeof tilejson === "object" ? tilejson as Record<string, unknown> : {};
    sources.carto = {
      ...sources.carto,
      ...(typeof tilejsonSource.attribution === "string" ? { attribution: tilejsonSource.attribution } : {}),
      ...(Array.isArray(tilejsonSource.bounds) ? { bounds: tilejsonSource.bounds } : {}),
      ...(typeof tilejsonSource.minzoom === "number" ? { minzoom: tilejsonSource.minzoom } : {}),
      ...(typeof tilejsonSource.maxzoom === "number" ? { maxzoom: tilejsonSource.maxzoom } : {}),
      ...(typeof tilejsonSource.scheme === "string" ? { scheme: tilejsonSource.scheme } : {}),
      tiles: ["/api/new-map/basemap-tile/{z}/{x}/{y}"]
    };
    delete (sources.carto as Record<string, unknown>).url;
  }
  if (style && typeof style === "object") {
    const origin = requestOrigin(request);
    style.glyphs = `${origin}${SAME_ORIGIN_GLYPHS_PATH}`;
    style.sprite = `${origin}${SAME_ORIGIN_SPRITE_PATH}`;
  }

  return Response.json(style, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": STATIC_MAP_CACHE,
      "Vary": "Host"
    }
  });
}
