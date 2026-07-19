import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function request(url: string) {
  return new NextRequest(url, { headers: { "accept-language": "en" } });
}

describe("private truth audit routes", () => {
  it.each([
    "https://www.islegal.info/wiki-truth",
    "https://islegal.info/wiki-truth",
    "https://www.islegal.info/wiki-truth/row/BF",
    "https://www.islegal.info/trust-view"
  ])("returns 404 outside localhost for %s", (url) => {
    expect(proxy(request(url)).status).toBe(404);
  });

  it.each([
    "http://127.0.0.1:3000/wiki-truth",
    "http://localhost:3000/wiki-truth",
    "http://127.0.0.1:3000/trust-view"
  ])("allows the local audit route for %s", (url) => {
    expect(proxy(request(url)).status).toBe(200);
  });

  it("keeps the canonical production redirect for public routes", () => {
    const response = proxy(request("https://islegal.info/"));
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://www.islegal.info/");
  });
});
