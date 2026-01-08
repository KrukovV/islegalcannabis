export type GeoErrorResult = {
  message: string;
  showManual: boolean;
};

export function mapGeoError(code?: number): GeoErrorResult {
  if (code === 1) {
    return {
      message: "Location permission denied. Choose manually.",
      showManual: true
    };
  }
  return {
    message: "We couldn't verify your GPS location. Please choose manually.",
    showManual: true
  };
}
