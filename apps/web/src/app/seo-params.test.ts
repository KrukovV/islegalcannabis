import { describe, expect, it } from "vitest";
import { TOP25 } from "@islegal/shared";
import { generateStaticParams as weedParams } from "./is-weed-legal-in-[slug]/page";
import { generateStaticParams as cannabisParams } from "./is-cannabis-legal-in-[slug]/page";

describe("SEO params coverage", () => {
  it("weed and cannabis pages cover TOP25", () => {
    expect(weedParams()).toHaveLength(TOP25.length);
    expect(cannabisParams()).toHaveLength(TOP25.length);
  });
});
