import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import CheckErrorCard from "./CheckErrorCard";
import { mapCheckError } from "@/lib/ui/checkErrors";

describe("CheckErrorCard", () => {
  it("renders rate limit message", () => {
    const mapped = mapCheckError("RATE_LIMITED");
    const html = renderToStaticMarkup(
      createElement(CheckErrorCard, {
        title: mapped.title,
        message: mapped.message,
        requestId: "abcd1234",
        retryHref: "/check?country=DE"
      })
    );
    expect(html).toContain("Too many requests");
    expect(html).toContain("Try again in a moment");
  });

  it("renders invalid location message", () => {
    const mapped = mapCheckError("MISSING_COUNTRY");
    const html = renderToStaticMarkup(
      createElement(CheckErrorCard, {
        title: mapped.title,
        message: mapped.message,
        requestId: "abcd1234",
        retryHref: "/check"
      })
    );
    expect(html).toContain("Invalid location");
    expect(html).toContain("Choose a location manually");
  });
});
