"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SocialRuntimeConfig } from "@/social/runtimeConfig";
import type { EncryptedPrivateEnvelope, PrivateMessageState } from "@/dm/domain";
import { transitionPrivateMessage } from "@/dm/domain";
import { InternetPrivateTransport } from "@/dm/internetTransport";
import {
  createDmDeviceRegistration,
  createDmGiftWrapFanout,
  createDmSubmissionAuthorization,
  unwrapDmGiftWrap,
} from "@/dm/nip17Candidate";
import {
  clearDeviceBinding,
  clearLocalDmMessages,
  deleteLocalDmConversation,
  deleteLocalDmMessage,
  getOrCreateMessagingIdentity,
  listLocalDmMessages,
  loadDeviceBinding,
  rotateMessagingIdentity,
  saveDeviceBinding,
  saveLocalDmMessage,
  type DmDeviceBinding,
  type LocalDmMessage,
} from "@/dm/vault";
import styles from "./TruthMapSocialPanel.module.css";

type Identity = { userId: string; displayName: string };
type Device = { id: string; publicKey: string; label: string; status: "ACTIVE" | "REVOKED" };
type Recipient = { displayName: string; deviceId: string; publicKey: string; label: string };
type ApiError = { error?: { code?: string } };

async function responsePayload<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & ApiError;
  if (!response.ok) throw new Error(payload.error?.code || `DM_HTTP_${response.status}`);
  return payload;
}

function receiptToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function nextState(current: PrivateMessageState, target: PrivateMessageState) {
  if (current === target) return current;
  if (target === "TRANSPORT_ACCEPTED") return transitionPrivateMessage(current, target);
  if (target === "DELIVERED") {
    const accepted = current === "QUEUED" ? transitionPrivateMessage(current, "TRANSPORT_ACCEPTED") : current;
    return transitionPrivateMessage(accepted, "DELIVERED");
  }
  if (target === "READ") {
    const accepted = current === "QUEUED" ? transitionPrivateMessage(current, "TRANSPORT_ACCEPTED") : current;
    const delivered = accepted === "TRANSPORT_ACCEPTED" ? transitionPrivateMessage(accepted, "DELIVERED") : accepted;
    return transitionPrivateMessage(delivered, "READ");
  }
  return transitionPrivateMessage(current, target);
}

const RECEIPT_STATE_RANK: Partial<Record<PrivateMessageState, number>> = {
  TRANSPORT_ACCEPTED: 1,
  DELIVERED: 2,
  READ: 3,
};

function friendlyStatus(status: string) {
  if (status === "DM_DEVICE_INITIALIZING") return "Подготавливаем личные сообщения…";
  if (status === "DM_DEVICE_READY") return "Можно отправить личное сообщение.";
  if (status.startsWith("DM_RECIPIENT_READY:")) return "Получатель найден. Можно писать сообщение.";
  if (status === "DM_RECIPIENT_NOT_FOUND") return "Получатель не найден.";
  if (status === "DM_CIPHERTEXT_TRANSPORT_ACCEPTED") return "Личное сообщение отправлено.";
  if (status === "DM_MESSAGE_DECRYPTED_AND_READ") return "Новое личное сообщение прочитано.";
  if (status === "DM_CONVERSATION_DELETED_LOCALLY") return "Переписка удалена с этого устройства.";
  if (status === "DM_LOCAL_HISTORY_CLEARED") return "История личных сообщений очищена на этом устройстве.";
  if (status === "DM_DEVICE_REVOKED_RELOAD_TO_ROTATE") return "Это устройство отозвано. Перезагрузите страницу, чтобы создать новое.";
  if (status === "DM_DISABLED") return "Личные сообщения сейчас недоступны.";
  return status.startsWith("DM_") ? "Личным сообщениям требуется внимание." : status;
}

function activeDeviceLabel(count: number) {
  if (count === 1) return "1 активное устройство";
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) return `${count} активных устройства`;
  return `${count} активных устройств`;
}

function messageStateLabel(state: PrivateMessageState) {
  if (state === "READ") return "ПРОЧИТАНО";
  if (state === "DELIVERED") return "ДОСТАВЛЕНО";
  if (state === "TRANSPORT_ACCEPTED") return "ОТПРАВЛЕНО";
  if (state === "QUEUED") return "В ОЧЕРЕДИ";
  if (state === "FAILED_RETRYABLE") return "ТРЕБУЕТ ПОВТОРА";
  if (state === "FAILED_PERMANENT") return "НЕ ОТПРАВЛЕНО";
  if (state === "EXPIRED") return "СРОК ИСТЁК";
  return "СОЗДАНО";
}

async function serverDevices() {
  return responsePayload<{ ok: true; devices: Device[] }>(await fetch("/api/social/dm/devices", {
    cache: "no-store",
    credentials: "same-origin",
  }));
}

async function registerDevice(identity: Identity) {
  let messagingIdentity = await getOrCreateMessagingIdentity();
  const binding = await loadDeviceBinding();
  const devices = await serverDevices();
  const activeBinding = binding?.ownerUserId === identity.userId
    ? devices.devices.find((device) => device.id === binding.deviceId && device.publicKey === binding.publicKey && device.status === "ACTIVE")
    : null;
  if (activeBinding) return { ...binding, label: activeBinding.label } as DmDeviceBinding;
  if (binding) messagingIdentity = await rotateMessagingIdentity();

  const challengePayload = await responsePayload<{ ok: true; challenge: string }>(await fetch("/api/social/dm/devices/challenge", {
    cache: "no-store",
    credentials: "same-origin",
  }));
  const label = `Устройство браузера · ${new Date().toISOString().slice(0, 10)}`;
  const registered = await responsePayload<{ ok: true; device: Device }>(await fetch("/api/social/dm/devices", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challenge: challengePayload.challenge,
      registrationEvent: createDmDeviceRegistration(messagingIdentity.privateKey, challengePayload.challenge),
      label,
    }),
  }));
  const nextBinding = {
    ownerUserId: identity.userId,
    deviceId: registered.device.id,
    publicKey: registered.device.publicKey,
    label: registered.device.label,
  };
  await saveDeviceBinding(nextBinding);
  return nextBinding;
}

export default function PrivateDmPanel({ config, identity }: { config: SocialRuntimeConfig; identity: Identity }) {
  const transport = useMemo(() => new InternetPrivateTransport(), []);
  const [device, setDevice] = useState<DmDeviceBinding | null>(null);
  const [messages, setMessages] = useState<LocalDmMessage[]>([]);
  const [recipientName, setRecipientName] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState(config.dmEnabled ? "DM_DEVICE_INITIALIZING" : "DM_DISABLED");
  const [busy, setBusy] = useState(false);

  const reloadMessages = useCallback(async () => {
    const local = await listLocalDmMessages();
    const now = Date.now();
    for (const message of local) {
      if (new Date(message.expiresAt).getTime() > now) continue;
      if (!["QUEUED", "TRANSPORT_ACCEPTED", "DELIVERED", "FAILED_RETRYABLE"].includes(message.state)) continue;
      await saveLocalDmMessage({ ...message, state: transitionPrivateMessage(message.state, "EXPIRED") });
      message.state = "EXPIRED";
    }
    setMessages(local);
  }, []);

  useEffect(() => {
    if (!config.dmEnabled) return;
    let active = true;
    const initialize = async () => {
      try {
        const binding = await registerDevice(identity);
        if (!active) return;
        setDevice(binding);
        await reloadMessages();
        if (active) setStatus("DM_DEVICE_READY");
      } catch (error) {
        if (active) setStatus(error instanceof Error ? error.message : "DM_DEVICE_INITIALIZATION_FAILED");
      }
    };
    void initialize();
    return () => { active = false; };
  }, [config.dmEnabled, identity, reloadMessages]);

  const receiveEnvelope = useCallback(async (delivery: { messageId: string; giftWrap: unknown }) => {
    if (!device) return;
    try {
      const messagingIdentity = await getOrCreateMessagingIdentity();
      const unwrapped = unwrapDmGiftWrap(delivery.giftWrap, messagingIdentity.privateKey, delivery.messageId);
      const existing = (await listLocalDmMessages()).find((message) => message.messageId === unwrapped.messageId);
      if (!existing) {
        const senderUrl = new URL("/api/social/dm/recipients", window.location.origin);
        senderUrl.searchParams.set("publicKey", unwrapped.senderPublicKey);
        const senderPayload = await responsePayload<{ ok: true; sender: { displayName: string } | null }>(await fetch(senderUrl, {
          cache: "no-store",
          credentials: "same-origin",
        }));
        await saveLocalDmMessage({
          messageId: unwrapped.messageId,
          peerPublicKey: unwrapped.senderPublicKey,
          peerDisplayName: senderPayload.sender?.displayName || `Участник-${unwrapped.senderPublicKey.slice(0, 8)}`,
          direction: "RECEIVED",
          content: unwrapped.content,
          createdAt: unwrapped.createdAt,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
          state: "DELIVERED",
        });
      }
      await transport.acknowledge(device.deviceId, unwrapped.messageId, "DELIVERED");
      await transport.acknowledge(device.deviceId, unwrapped.messageId, "READ");
      const current = (await listLocalDmMessages()).find((message) => message.messageId === unwrapped.messageId);
      if (current && current.state !== "READ") await saveLocalDmMessage({ ...current, state: "READ" });
      await reloadMessages();
      setStatus("DM_MESSAGE_DECRYPTED_AND_READ");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "DM_DECRYPTION_FAILED");
    }
  }, [device, reloadMessages, transport]);

  useEffect(() => {
    if (!device || !config.dmEnabled) return;
    return transport.subscribe(device.deviceId, (delivery) => { void receiveEnvelope(delivery); });
  }, [config.dmEnabled, device, receiveEnvelope, transport]);

  useEffect(() => {
    if (!config.dmEnabled) return;
    const reconcile = async () => {
      const local = await listLocalDmMessages();
      let changed = false;
      for (const message of local) {
        const receipts = message.receiptTokens || (message.receiptToken ? [{ recipientDeviceId: "legacy", token: message.receiptToken }] : []);
        if (message.direction !== "SENT" || receipts.length === 0 || !["TRANSPORT_ACCEPTED", "DELIVERED"].includes(message.state)) continue;
        let strongest = message.state;
        for (const receiptReference of receipts) {
          try {
            const receipt = await transport.receipt(message.messageId, receiptReference.token);
            if ((RECEIPT_STATE_RANK[receipt.state] || 0) > (RECEIPT_STATE_RANK[strongest] || 0)) strongest = receipt.state;
          } catch {
            // A bounded relay receipt may be temporarily unavailable; preserve local queued truth.
          }
        }
        if (strongest !== message.state) {
          await saveLocalDmMessage({ ...message, state: nextState(message.state, strongest) });
          changed = true;
        }
      }
      if (changed) await reloadMessages();
    };
    const timer = window.setInterval(() => { void reconcile(); }, 3_000);
    return () => window.clearInterval(timer);
  }, [config.dmEnabled, reloadMessages, transport]);

  const lookupRecipient = async () => {
    setBusy(true);
    try {
      const url = new URL("/api/social/dm/recipients", window.location.origin);
      url.searchParams.set("displayName", recipientName);
      const payload = await responsePayload<{ ok: true; recipients: Recipient[] }>(await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
      }));
      setRecipients(payload.recipients);
      setStatus(payload.recipients.length ? `DM_RECIPIENT_READY:${payload.recipients.length}_DEVICES` : "DM_RECIPIENT_NOT_FOUND");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "DM_RECIPIENT_LOOKUP_FAILED");
    } finally {
      setBusy(false);
    }
  };

  const transmit = async (envelopes: EncryptedPrivateEnvelope[], local: LocalDmMessage) => {
    let pending = { ...local, state: transitionPrivateMessage(local.state, "QUEUED") };
    await saveLocalDmMessage(pending);
    const failed: EncryptedPrivateEnvelope[] = [];
    try {
      for (const envelope of envelopes) {
        try {
          await transport.send(envelope);
        } catch {
          failed.push(envelope);
        }
      }
      if (failed.length > 0) throw new Error("DM_SEND_FAILED_RETRYABLE");
      pending = { ...pending, state: nextState(pending.state, "TRANSPORT_ACCEPTED"), pendingEnvelope: undefined, pendingEnvelopes: undefined };
      await saveLocalDmMessage(pending);
      return pending.state;
    } catch (error) {
      const retryCount = (pending.retryCount || 0) + 1;
      await saveLocalDmMessage({
        ...pending,
        state: transitionPrivateMessage(pending.state, retryCount >= 5 ? "FAILED_PERMANENT" : "FAILED_RETRYABLE"),
        pendingEnvelope: undefined,
        pendingEnvelopes: failed.length > 0 ? failed : envelopes,
        retryCount,
      });
      throw error;
    }
  };

  const sendMessage = async () => {
    if (!device || recipients.length === 0 || !draft.trim()) return;
    setBusy(true);
    const content = draft.trim();
    try {
      const messagingIdentity = await getOrCreateMessagingIdentity();
      const wrapped = createDmGiftWrapFanout(messagingIdentity.privateKey, recipients.map((recipient) => recipient.publicKey), content);
      const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 - 60) * 1_000).toISOString();
      const tokens = new Map(recipients.map((recipient) => [recipient.deviceId, receiptToken()]));
      let local: LocalDmMessage = {
        messageId: wrapped.messageId,
        peerPublicKey: recipients[0].publicKey,
        peerDisplayName: recipients[0].displayName,
        direction: "SENT",
        content,
        createdAt: new Date().toISOString(),
        expiresAt,
        state: "CREATED",
        receiptTokens: recipients.map((recipient) => ({ recipientDeviceId: recipient.deviceId, token: tokens.get(recipient.deviceId)! })),
      };
      await saveLocalDmMessage(local);
      local = { ...local, state: transitionPrivateMessage(local.state, "ENCRYPTED") };
      await saveLocalDmMessage(local);
      const envelopes = recipients.map((recipient) => {
        const giftWrap = wrapped.envelopes.find((candidate) => candidate.recipientPublicKey === recipient.publicKey)?.giftWrap;
        if (!giftWrap) throw new Error("DM_FANOUT_ENVELOPE_MISSING");
        return {
          messageId: wrapped.messageId,
          recipientDeviceId: recipient.deviceId,
          recipientPublicKey: recipient.publicKey,
          giftWrap,
          receiptToken: tokens.get(recipient.deviceId)!,
          senderDeviceId: device.deviceId,
          submissionAuthorization: createDmSubmissionAuthorization(messagingIdentity.privateKey, wrapped.messageId, recipient.publicKey),
          expiresAt,
        } satisfies EncryptedPrivateEnvelope;
      });
      await transmit(envelopes, local);
      setDraft("");
      setStatus("DM_CIPHERTEXT_TRANSPORT_ACCEPTED");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "DM_SEND_FAILED_RETRYABLE");
    } finally {
      await reloadMessages();
      setBusy(false);
    }
  };

  const retryMessage = async (message: LocalDmMessage) => {
    const pendingEnvelopes = message.pendingEnvelopes || (message.pendingEnvelope ? [message.pendingEnvelope] : []);
    if (pendingEnvelopes.length === 0 || message.state !== "FAILED_RETRYABLE") return;
    setBusy(true);
    try {
      if (new Date(message.expiresAt).getTime() <= Date.now()) {
        await saveLocalDmMessage({ ...message, state: transitionPrivateMessage(message.state, "EXPIRED") });
        setStatus("DM_MESSAGE_EXPIRED");
        return;
      }
      if ((message.retryCount || 0) >= 5) {
        await saveLocalDmMessage({ ...message, state: transitionPrivateMessage(message.state, "FAILED_PERMANENT") });
        setStatus("DM_RETRY_BUDGET_EXHAUSTED");
        return;
      }
      await transmit(pendingEnvelopes, message);
      setStatus("DM_RETRY_TRANSPORT_ACCEPTED");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "DM_RETRY_FAILED");
    } finally {
      await reloadMessages();
      setBusy(false);
    }
  };

  const revokeCurrentDevice = async () => {
    if (!device) return;
    setBusy(true);
    try {
      await responsePayload(await fetch(`/api/social/dm/devices/${device.deviceId}`, {
        method: "DELETE",
        credentials: "same-origin",
      }));
      await clearDeviceBinding();
      setDevice(null);
      setStatus("DM_DEVICE_REVOKED_RELOAD_TO_ROTATE");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "DM_DEVICE_REVOCATION_FAILED");
    } finally {
      setBusy(false);
    }
  };

  const removeLocalMessage = async (messageId: string) => {
    await deleteLocalDmMessage(messageId);
    await reloadMessages();
    setStatus("DM_MESSAGE_DELETED_LOCALLY");
  };

  const removeLocalConversation = async () => {
    await deleteLocalDmConversation(recipients.map((recipient) => recipient.publicKey));
    await reloadMessages();
    setStatus("DM_CONVERSATION_DELETED_LOCALLY");
  };

  const clearLocalHistory = async () => {
    await clearLocalDmMessages();
    await reloadMessages();
    setStatus("DM_LOCAL_HISTORY_CLEARED");
  };

  if (!config.dmEnabled) {
    return <p className={styles.status}>Личные сообщения отключены.<span className={styles.srOnly} data-testid="truth-map-dm-status">DM_DISABLED</span></p>;
  }

  return (
    <section className={styles.dmPanel} data-testid="truth-map-dm" data-dm-status={device ? "ACTIVE" : "INITIALIZING"}>
      <div className={styles.dmHeader}>
        <div>
          <div className={styles.eyebrow}>Личные сообщения · эксперимент</div>
          <strong>Напишите личное сообщение</strong>
        </div>
        <span className={styles.dmSecurityBadge}>Шифруется здесь</span>
      </div>
      <p className={styles.dmIntro}>Сообщение шифруется в этом браузере. Контекст карты или GEO не прикладывается.</p>
      <div className={styles.dmComposerBox}>
        <div className={styles.dmComposerHeading}>Новое сообщение</div>
        <label className={styles.dmField}>
          <span>Псевдоним получателя</span>
          <div className={styles.dmRecipientRow}>
            <input
              value={recipientName}
              onChange={(event) => { setRecipientName(event.target.value); setRecipients([]); }}
              placeholder="Введите точный псевдоним"
              maxLength={40}
              data-testid="truth-map-dm-recipient"
            />
            <button type="button" disabled={busy || !device || recipientName.trim().length < 2} onClick={() => void lookupRecipient()} data-testid="truth-map-dm-lookup">Найти</button>
          </div>
        </label>
        {recipients.length ? <p className={styles.dmRecipientReady} data-testid="truth-map-dm-recipient-ready">Кому: {recipients[0].displayName} · {activeDeviceLabel(recipients.length)}</p> : null}
        <label className={styles.dmField}>
          <span>Сообщение</span>
          <textarea
            rows={2}
            maxLength={8_000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Напишите личное сообщение"
            data-testid="truth-map-dm-composer"
          />
        </label>
        <button className={styles.send} type="button" disabled={busy || !device || recipients.length === 0 || !draft.trim()} onClick={() => void sendMessage()} data-testid="truth-map-dm-send">Отправить лично</button>
      </div>
      <details className={styles.dmManagement}>
        <summary>Приватность и устройство</summary>
        <div className={styles.dmManagementContent}>
          <p>Это экспериментальный локальный вариант, не утверждённый как production-защищённый мессенджер. Реле хранит только зашифрованный конверт доставки и ограниченные данные о доставке — не текст сообщения.</p>
          <p className={styles.deviceLine} data-testid="truth-map-dm-device">
            {device ? `${device.label} · ${device.publicKey.slice(0, 12)}…` : "Подготавливаем отдельный ключ сообщений…"}
          </p>
          <div className={styles.dmManagementActions}>
            <button type="button" disabled={!device || busy} onClick={() => void revokeCurrentDevice()}>Отозвать это устройство</button>
            <button type="button" disabled={busy || recipients.length === 0} onClick={() => void removeLocalConversation()}>Удалить эту переписку с устройства</button>
            <button type="button" disabled={busy || messages.length === 0} onClick={() => void clearLocalHistory()}>Очистить историю личных сообщений на устройстве</button>
          </div>
        </div>
      </details>
      <div className={styles.dmMessages} data-testid="truth-map-dm-messages">
        {messages.map((message) => (
          <article key={message.messageId} className={message.direction === "SENT" ? styles.dmSent : styles.dmReceived} data-message-state={message.state}>
            <strong>{message.direction === "SENT" ? `Кому: ${message.peerDisplayName}` : `От: ${message.peerDisplayName}`}</strong>
            <p>{message.content}</p>
            <span>{messageStateLabel(message.state)} · {new Date(message.createdAt).toLocaleTimeString("ru-RU")}</span>
            <button type="button" disabled={busy} onClick={() => void removeLocalMessage(message.messageId)}>Удалить с устройства</button>
            {message.state === "FAILED_RETRYABLE"
              ? <button type="button" disabled={busy} onClick={() => void retryMessage(message)}>Повторить отправку</button>
              : null}
          </article>
        ))}
        {messages.length === 0 ? <p>На этом устройстве пока нет личных сообщений.</p> : null}
      </div>
      <p className={styles.dmStatus} aria-live="polite">
        {friendlyStatus(status)}
        <span className={styles.srOnly} data-testid="truth-map-dm-status">{status}</span>
      </p>
    </section>
  );
}
