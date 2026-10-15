export function readHomeMapParams(url: URL) {
  const single = (key: string) => {
    const values = url.searchParams.getAll(key);
    return values.length === 1 ? values[0] : null;
  };
  const bounded = (key: string, min: number, max: number) => {
    const value = single(key);
    if (value === null || value.trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  };
  const lat = bounded("lat", -90, 90);
  const lng = bounded("lng", -180, 180);
  const zoom = bounded("zoom", 0, 15);
  const geo = single("geo") || single("code");
  return {
    initialMapView: lat === null || lng === null || zoom === null ? null : { lat, lng, zoom },
    initialGeoCode: geo && /^[A-Za-z0-9-]{2,12}$/.test(geo) ? geo.toUpperCase() : null,
  };
}
