import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/extras", () => {
  it("returns extras for a known jurisdiction", async () => {
    const req = new Request("http://localhost/api/extras?country=US&region=CA");
    const res = await GET(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.id).toBe("US-CA");
    expect(typeof json.extras.public_use).toBe("string");
    expect(typeof json.extras.driving).toBe("string");
    expect(typeof json.extras.purchase).toBe("string");
    expect(typeof json.extras.home_grow).toBe("string");
    expect(typeof json.extras.cbd).toBe("string");
    expect(typeof json.extras.edibles).toBe("string");
  });
});
