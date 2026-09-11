import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH;
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function request(host: string, body: unknown) {
  return new Request(`${host.startsWith("127") ? "http" : "https"}://${host}/api/truth-map/b2b/correction-request`, {
    method: "POST",
    headers: { host, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("local correction request API", () => {
  it("appends one untrusted candidate receipt locally and exposes no automatic promotion", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-route-"));
    tempDirs.push(directory);
    const inbox = path.join(directory, "requests.jsonl");
    process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH = inbox;
    const response = await POST(request("127.0.0.1:3000", {
      geo: "US-AK",
      organization: "Example applicant",
      sourceUrl: "https://example.gov/licence/ak-1",
      licenceReference: "AK-1"
    }));
    expect(response.status).toBe(202);
    const receipt = await response.json();
    expect(receipt.candidate.geo).toBe("US-AK");
    expect(receipt.review.state).toBe("PENDING_INDEPENDENT_REVIEW");
    expect(receipt.outcome).toEqual(expect.objectContaining({ legalTruthChanged: false, storeTruthChanged: false, coordinateChanged: false, leafChanged: false }));
    expect(fs.readFileSync(inbox, "utf8").trim()).toBe(JSON.stringify(receipt));
  });

  it("rejects invalid evidence and production hosts without writing an inbox", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-route-"));
    tempDirs.push(directory);
    const inbox = path.join(directory, "requests.jsonl");
    process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH = inbox;
    expect((await POST(request("127.0.0.1:3000", { geo: "MN", organization: "Org", sourceUrl: "http://example.gov", note: "Evidence" }))).status).toBe(400);
    expect((await POST(request("www.islegal.info", { geo: "MN", organization: "Org", sourceUrl: "https://example.gov", note: "Evidence" }))).status).toBe(404);
    expect(fs.existsSync(inbox)).toBe(false);
  });
});
