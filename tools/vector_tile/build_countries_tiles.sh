#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INPUT="${ROOT}/data/geojson/countries.geojson"
if [[ ! -f "${INPUT}" ]]; then
  INPUT="${ROOT}/data/geojson/ne_10m_admin_0_countries.geojson"
fi
OUT_DIR="${ROOT}/Artifacts/vector-tiles"
OUT_FILE="${OUT_DIR}/countries.mbtiles"

mkdir -p "${OUT_DIR}"

tippecanoe \
  -o "${OUT_FILE}" \
  -l countries \
  -zg \
  --no-feature-limit \
  --no-tile-size-limit \
  --generate-ids \
  --no-tiny-polygon-reduction \
  --detect-shared-borders \
  --buffer=8 \
  --simplify-only-low-zooms \
  --no-simplification-of-shared-nodes \
  --simplification=10 \
  --drop-fraction-as-needed \
  --extend-zooms-if-still-dropping \
  --maximum-tile-bytes=200000 \
  "${INPUT}"

echo "VECTOR_TILE_BUILD_OK=1 output=${OUT_FILE}"
