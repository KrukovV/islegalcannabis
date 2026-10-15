import { AsciiEngine } from "./ascii-engine";
import { ASCII_SCENARIOS } from "./ascii-scenarios/registry";
import { getGeoContext } from "./geo-store";

export function createAsciiEngine(canvas: HTMLCanvasElement) {
  return new AsciiEngine(canvas, ASCII_SCENARIOS, getGeoContext);
}
