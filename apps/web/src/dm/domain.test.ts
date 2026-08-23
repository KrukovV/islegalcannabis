import { describe, expect, it, vi } from "vitest";
import type { PrivateTransport } from "./domain";
import { transitionPrivateMessage, TransportRouter } from "./domain";

function transport(internet: boolean): PrivateTransport {
  return {
    capabilities: () => ({
      name: internet ? "internet" : "nearby",
      internet,
      nearby: !internet,
      offlineQueue: true,
      maxPayloadBytes: 64 * 1024,
      securityLabel: "CANDIDATE_E2E",
    }),
    send: vi.fn(),
    receive: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    acknowledge: vi.fn(),
    sync: vi.fn(),
  };
}

describe("private-message domain", () => {
  it("accepts the governed lifecycle and rejects skipped or terminal transitions", () => {
    expect(transitionPrivateMessage("CREATED", "ENCRYPTED")).toBe("ENCRYPTED");
    expect(transitionPrivateMessage("ENCRYPTED", "QUEUED")).toBe("QUEUED");
    expect(transitionPrivateMessage("QUEUED", "TRANSPORT_ACCEPTED")).toBe("TRANSPORT_ACCEPTED");
    expect(transitionPrivateMessage("TRANSPORT_ACCEPTED", "DELIVERED")).toBe("DELIVERED");
    expect(transitionPrivateMessage("DELIVERED", "READ")).toBe("READ");
    expect(() => transitionPrivateMessage("CREATED", "READ")).toThrow("DM_STATE_TRANSITION_INVALID:CREATED:READ");
    expect(() => transitionPrivateMessage("READ", "QUEUED")).toThrow("DM_STATE_TRANSITION_INVALID:READ:QUEUED");
  });

  it("routes the candidate only to an Internet-capable private transport", () => {
    const nearby = transport(false);
    const internet = transport(true);
    expect(new TransportRouter([nearby, internet]).select()).toBe(internet);
    expect(() => new TransportRouter([nearby]).select()).toThrow("DM_PRIVATE_TRANSPORT_UNAVAILABLE");
  });
});
