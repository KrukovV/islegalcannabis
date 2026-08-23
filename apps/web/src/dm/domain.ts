export const PRIVATE_MESSAGE_STATES = [
  "CREATED",
  "ENCRYPTED",
  "QUEUED",
  "TRANSPORT_ACCEPTED",
  "DELIVERED",
  "READ",
  "FAILED_RETRYABLE",
  "FAILED_PERMANENT",
  "EXPIRED",
] as const;

export type PrivateMessageState = (typeof PRIVATE_MESSAGE_STATES)[number];

export type PrivateConversation = {
  id: string;
  peerMessagingPublicKey: string;
  peerDisplayName: string;
  createdAt: string;
};

export type PrivateMessageMetadata = {
  messageId: string;
  conversationId: string;
  direction: "SENT" | "RECEIVED";
  state: PrivateMessageState;
  createdAt: string;
  expiresAt: string;
};

export type EncryptedPrivateEnvelope = {
  messageId: string;
  recipientDeviceId: string;
  recipientPublicKey: string;
  giftWrap: unknown;
  receiptToken: string;
  senderDeviceId: string;
  submissionAuthorization: unknown;
  expiresAt: string;
};

export type PrivateTransportCapabilities = {
  name: string;
  internet: boolean;
  nearby: boolean;
  offlineQueue: boolean;
  maxPayloadBytes: number;
  securityLabel: "CANDIDATE_E2E" | "SECURITY_REVIEWED";
};

export type PrivateEnvelopeDelivery = {
  messageId: string;
  recipientDeviceId: string;
  giftWrap: unknown;
  status: "TRANSPORT_ACCEPTED" | "DELIVERED" | "READ";
  expiresAt: string;
};

export interface PrivateTransport {
  capabilities(): PrivateTransportCapabilities;
  send(_envelope: EncryptedPrivateEnvelope): Promise<{ messageId: string; state: PrivateMessageState; duplicate: boolean }>;
  receive(_deviceId: string): Promise<PrivateEnvelopeDelivery[]>;
  subscribe(_deviceId: string, _onEnvelope: (_envelope: PrivateEnvelopeDelivery) => void): () => void;
  acknowledge(_deviceId: string, _messageId: string, _state: "DELIVERED" | "READ"): Promise<void>;
  sync(_deviceId: string): Promise<PrivateEnvelopeDelivery[]>;
}

const ALLOWED_TRANSITIONS: Record<PrivateMessageState, PrivateMessageState[]> = {
  CREATED: ["ENCRYPTED", "FAILED_PERMANENT"],
  ENCRYPTED: ["QUEUED", "FAILED_PERMANENT"],
  QUEUED: ["TRANSPORT_ACCEPTED", "FAILED_RETRYABLE", "FAILED_PERMANENT", "EXPIRED"],
  TRANSPORT_ACCEPTED: ["DELIVERED", "FAILED_RETRYABLE", "FAILED_PERMANENT", "EXPIRED"],
  DELIVERED: ["READ", "EXPIRED"],
  READ: [],
  FAILED_RETRYABLE: ["QUEUED", "FAILED_PERMANENT", "EXPIRED"],
  FAILED_PERMANENT: [],
  EXPIRED: [],
};

export function transitionPrivateMessage(current: PrivateMessageState, next: PrivateMessageState) {
  if (current === next) return next;
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    throw new Error(`DM_STATE_TRANSITION_INVALID:${current}:${next}`);
  }
  return next;
}

export class TransportRouter {
  private readonly transports: PrivateTransport[];

  constructor(transports: PrivateTransport[]) {
    this.transports = transports;
  }

  select() {
    const available = this.transports.find((transport) => transport.capabilities().internet);
    if (!available) throw new Error("DM_PRIVATE_TRANSPORT_UNAVAILABLE");
    return available;
  }
}
