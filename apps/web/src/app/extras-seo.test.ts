import { describe, expect, it } from "vitest";
import { TOP25 } from "@islegal/shared";
import { generateStaticParams as cbdParams } from "./is-cbd-legal-in-[slug]/page";
import { generateStaticParams as ediblesParams } from "./are-edibles-legal-in-[slug]/page";
import { generateStaticParams as vapesParams } from "./are-vapes-legal-in-[slug]/page";
import { generateStaticParams as concentratesParams } from "./are-concentrates-legal-in-[slug]/page";

describe("Extras SEO pages", () => {
  it("generateStaticParams covers TOP25", () => {
    expect(cbdParams()).toHaveLength(TOP25.length);
    expect(ediblesParams()).toHaveLength(TOP25.length);
    expect(vapesParams()).toHaveLength(TOP25.length);
    expect(concentratesParams()).toHaveLength(TOP25.length);
  });
});
