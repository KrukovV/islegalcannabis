export function mapCheckError(code?: string) {
  switch (code) {
    case "RATE_LIMITED":
      return {
        title: "Too many requests",
        message: "Too many requests. Try again in a moment."
      };
    case "MISSING_COUNTRY":
    case "INVALID_COORDS":
      return {
        title: "Invalid location",
        message: "Invalid location parameters. Choose a location manually."
      };
    case "UNKNOWN_JURISDICTION":
      return {
        title: "Data not available",
        message: "We do not have data for that jurisdiction yet."
      };
    default:
      return {
        title: "Network error",
        message: "Can't reach server. Check your connection and try again."
      };
  }
}
