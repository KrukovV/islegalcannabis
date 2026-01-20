#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEAFLET_DIR="${ROOT_DIR}/vendor/leaflet"
CLUSTER_DIR="${ROOT_DIR}/vendor/leaflet-markercluster"
PUBLIC_DIR="${ROOT_DIR}/apps/web/public/vendor/leaflet"

if [ ! -d "${LEAFLET_DIR}" ]; then
  echo "ERROR: Leaflet vendor directory not found at ${LEAFLET_DIR}"
  exit 1
fi

mkdir -p "${PUBLIC_DIR}/images" "${PUBLIC_DIR}/markercluster"

(cd "${LEAFLET_DIR}" && npm ci && npm run build)

cp "${LEAFLET_DIR}/dist/leaflet.js" "${PUBLIC_DIR}/leaflet.js"
cp "${LEAFLET_DIR}/dist/leaflet.css" "${PUBLIC_DIR}/leaflet.css"
cp -R "${LEAFLET_DIR}/dist/images/." "${PUBLIC_DIR}/images/"

if [ -d "${CLUSTER_DIR}" ]; then
  (cd "${CLUSTER_DIR}" && npm ci && npx jake)
  if [ -f "${CLUSTER_DIR}/dist/leaflet.markercluster.js" ]; then
    cp "${CLUSTER_DIR}/dist/leaflet.markercluster.js" "${PUBLIC_DIR}/markercluster/leaflet.markercluster.js"
    cp "${CLUSTER_DIR}/dist/MarkerCluster.css" "${PUBLIC_DIR}/markercluster/MarkerCluster.css"
    cp "${CLUSTER_DIR}/dist/MarkerCluster.Default.css" "${PUBLIC_DIR}/markercluster/MarkerCluster.Default.css"
  else
    echo "WARN: markercluster dist missing, skipping copy."
  fi
else
  echo "WARN: markercluster vendor not found, skipping."
fi

echo "LEAFLET_BUILD_OK=1"
