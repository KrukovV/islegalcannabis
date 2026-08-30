import type {
  EncryptedPrivateEnvelope,
  PrivateEnvelopeDelivery,
  PrivateMessageState,
  PrivateTransport,
  PrivateTransportCapabilities,
} from "./domain";

async function payload<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { error?: { code?: string } };
  if (!response.ok) throw new Error(value.error?.code || `DM_HTTP_${response.status}`);
  return value;
}

export class InternetPrivateTransport implements PrivateTransport {
  capabilities(): PrivateTransportCapabilities {
    return {
      name: "NIP17_NIP44_NIP59_HTTP_RELAY_CANDIDATE",
      internet: true,
      nearby: false,
      offlineQueue: true,
      maxPayloadBytes: 64 * 1024,
      securityLabel: "CANDIDATE_E2E",
    };
  }

  async send(envelope: EncryptedPrivateEnvelope) {
    const result = await payload<{ ok: true; messageId: string; state: PrivateMessageState; duplicate: boolean }>(await fetch("/api/social/dm/relay/send", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    }));
    return { messageId: result.messageId, state: result.state, duplicate: result.duplicate };
  }

  async receive(deviceId: string) {
    return this.sync(deviceId);
  }

  subscribe(deviceId: string, onEnvelope: (_envelope: PrivateEnvelopeDelivery) => void) {
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        for (const envelope of await this.sync(deviceId)) onEnvelope(envelope);
      } catch {
        // Offline is a valid queued state. The next bounded poll reconciles it.
      } finally {
        if (active) window.setTimeout(poll, 2_000);
      }
    };
    window.setTimeout(poll, 0);
    return () => { active = false; };
  }

  async acknowledge(deviceId: string, messageId: string, state: "DELIVERED" | "READ") {
    await payload(await fetch("/api/social/dm/relay/ack", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, messageId, state }),
    }));
  }

  async sync(deviceId: string) {
    const url = new URL("/api/social/dm/relay/inbox", window.location.origin);
    url.searchParams.set("deviceId", deviceId);
    const result = await payload<{ ok: true; envelopes: PrivateEnvelopeDelivery[] }>(await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
    }));
    return result.envelopes;
  }

  async receipt(messageId: string, receiptToken: string) {
    return payload<{ ok: true; messageId: string; state: PrivateMessageState; expiresAt: string }>(await fetch("/api/social/dm/relay/receipt", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, receiptToken }),
    }));
  }
}
