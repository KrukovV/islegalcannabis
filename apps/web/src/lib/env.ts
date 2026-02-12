export function isMapEnabled() {
  return process.env.MAP_ENABLED === "1" && !isCi();
}

export function isCi() {
  return process.env.CI === "true" || process.env.VERCEL === "1";
}
