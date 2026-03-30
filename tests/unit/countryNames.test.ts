import { describe, expect, it } from "vitest";
import {
  getBilingualLabel,
  getCountryMetaByIso2,
  getDisplayName,
  getEnglishName,
  getLocalName
} from "@/lib/countryNames";

describe("countryNames SSOT resolver", () => {
  it("resolves RU and KZ through the vendored mledoze snapshot", () => {
    expect(getEnglishName("RU")).toBe("Russia");
    expect(getLocalName("RU")).toBe("Россия");
    expect(getBilingualLabel("RU")).toBe("Russia / Россия");

    expect(getEnglishName("KZ")).toBe("Kazakhstan");
    expect(getLocalName("KZ")).toBe("Қазақстан");
    expect(getBilingualLabel("KZ")).toBe("Kazakhstan / Қазақстан");
  });

  it("resolves CN and JP bilingual names from the SSOT snapshot", () => {
    expect(getBilingualLabel("CN")).toBe("China / 中国");
    expect(getBilingualLabel("JP")).toBe("Japan / 日本");
  });

  it("uses the SSOT common name for Christmas Island instead of raw ISO", () => {
    expect(getDisplayName("CX")).toBe("Christmas Island");
    expect(getCountryMetaByIso2("CX")?.commonName).toBe("Christmas Island");
  });
});
