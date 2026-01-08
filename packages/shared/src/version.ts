export const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

export function getAppVersion() {
  return APP_VERSION;
}
