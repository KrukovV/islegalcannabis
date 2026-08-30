import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { PrivateMessageState } from "./domain";

const DM_VAULT_DATABASE = "islegal-private-messaging-v1";
const DM_VAULT_VERSION = 1;
const KEY_STORE = "key_material";
const MESSAGE_STORE = "encrypted_messages";
const PLATFORM_KEY_ID = "platform-aes-gcm-v1";
const MESSAGING_KEY_ID = "nostr-messaging-key-v1";
const DEVICE_BINDING_ID = "active-device-v1";

type EncryptedValue = {
  iv: string;
  ciphertext: string;
};

type StoredMessagingKey = EncryptedValue & {
  id: typeof MESSAGING_KEY_ID;
  publicKey: string;
};

export type DmDeviceBinding = {
  ownerUserId: string;
  deviceId: string;
  publicKey: string;
  label: string;
};

export type LocalDmMessage = {
  messageId: string;
  peerPublicKey: string;
  peerDisplayName: string;
  direction: "SENT" | "RECEIVED";
  content: string;
  createdAt: string;
  expiresAt: string;
  state: PrivateMessageState;
  receiptToken?: string;
  receiptTokens?: Array<{ recipientDeviceId: string; token: string }>;
  pendingEnvelope?: import("./domain").EncryptedPrivateEnvelope;
  pendingEnvelopes?: import("./domain").EncryptedPrivateEnvelope[];
  retryCount?: number;
};

type StoredLocalMessage = EncryptedValue & {
  id: string;
  updatedAt: string;
};

let databasePromise: Promise<IDBDatabase> | null = null;
let platformKeyPromise: Promise<CryptoKey> | null = null;
let messagingIdentityPromise: Promise<{ privateKey: Uint8Array; publicKey: string }> | null = null;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("DM_VAULT_REQUEST_FAILED"));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("DM_VAULT_TRANSACTION_ABORTED"));
    transaction.onerror = () => reject(transaction.error || new Error("DM_VAULT_TRANSACTION_FAILED"));
  });
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DM_VAULT_DATABASE, DM_VAULT_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(KEY_STORE)) database.createObjectStore(KEY_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(MESSAGE_STORE)) database.createObjectStore(MESSAGE_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error("DM_VAULT_OPEN_FAILED"));
    };
  });
  return databasePromise;
}

async function keyStoreGet<T>(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(KEY_STORE, "readonly");
  return requestValue(transaction.objectStore(KEY_STORE).get(id)) as Promise<T | undefined>;
}

async function keyStorePut(value: object) {
  const database = await openDatabase();
  const transaction = database.transaction(KEY_STORE, "readwrite");
  transaction.objectStore(KEY_STORE).put(value);
  await transactionComplete(transaction);
}

async function platformKey() {
  if (!platformKeyPromise) {
    platformKeyPromise = (async () => {
      const stored = await keyStoreGet<{ id: string; key: CryptoKey }>(PLATFORM_KEY_ID);
      if (stored?.key) return stored.key;
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await keyStorePut({ id: PLATFORM_KEY_ID, key });
      return key;
    })().catch((error) => {
      platformKeyPromise = null;
      throw error;
    });
  }
  return platformKeyPromise;
}

async function encryptValue(value: unknown): Promise<EncryptedValue> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await platformKey(), encoded);
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

async function decryptValue<T>(value: EncryptedValue) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(value.iv) },
    await platformKey(),
    fromBase64(value.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export function getOrCreateMessagingIdentity() {
  if (!messagingIdentityPromise) {
    messagingIdentityPromise = (async () => {
      const stored = await keyStoreGet<StoredMessagingKey>(MESSAGING_KEY_ID);
      if (stored) {
        const privateKey = Uint8Array.from(await decryptValue<number[]>(stored));
        if (getPublicKey(privateKey) !== stored.publicKey) throw new Error("DM_KEY_VAULT_CORRUPT");
        return { privateKey, publicKey: stored.publicKey };
      }
      const privateKey = generateSecretKey();
      const publicKey = getPublicKey(privateKey);
      const encrypted = await encryptValue([...privateKey]);
      await keyStorePut({ id: MESSAGING_KEY_ID, publicKey, ...encrypted } satisfies StoredMessagingKey);
      return { privateKey, publicKey };
    })().catch((error) => {
      messagingIdentityPromise = null;
      throw error;
    });
  }
  return messagingIdentityPromise;
}

export async function loadDeviceBinding() {
  return (await keyStoreGet<{ id: string; binding: DmDeviceBinding }>(DEVICE_BINDING_ID))?.binding || null;
}

export async function saveDeviceBinding(binding: DmDeviceBinding) {
  await keyStorePut({ id: DEVICE_BINDING_ID, binding });
}

export async function clearDeviceBinding() {
  const database = await openDatabase();
  const transaction = database.transaction(KEY_STORE, "readwrite");
  transaction.objectStore(KEY_STORE).delete(DEVICE_BINDING_ID);
  await transactionComplete(transaction);
}

export async function rotateMessagingIdentity() {
  const database = await openDatabase();
  const transaction = database.transaction(KEY_STORE, "readwrite");
  transaction.objectStore(KEY_STORE).delete(MESSAGING_KEY_ID);
  transaction.objectStore(KEY_STORE).delete(DEVICE_BINDING_ID);
  await transactionComplete(transaction);
  messagingIdentityPromise = null;
  return getOrCreateMessagingIdentity();
}

export async function saveLocalDmMessage(message: LocalDmMessage) {
  const database = await openDatabase();
  const encrypted = await encryptValue(message);
  const transaction = database.transaction(MESSAGE_STORE, "readwrite");
  transaction.objectStore(MESSAGE_STORE).put({
    id: message.messageId,
    updatedAt: new Date().toISOString(),
    ...encrypted,
  } satisfies StoredLocalMessage);
  await transactionComplete(transaction);
}

export async function listLocalDmMessages() {
  const database = await openDatabase();
  const transaction = database.transaction(MESSAGE_STORE, "readonly");
  const stored = await requestValue(transaction.objectStore(MESSAGE_STORE).getAll()) as StoredLocalMessage[];
  const messages = await Promise.all(stored.map((message) => decryptValue<LocalDmMessage>(message)));
  return messages.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function updateLocalDmMessageState(messageId: string, state: PrivateMessageState) {
  const messages = await listLocalDmMessages();
  const message = messages.find((candidate) => candidate.messageId === messageId);
  if (!message) return false;
  await saveLocalDmMessage({ ...message, state });
  return true;
}

export async function deleteLocalDmMessage(messageId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(MESSAGE_STORE, "readwrite");
  transaction.objectStore(MESSAGE_STORE).delete(messageId);
  await transactionComplete(transaction);
}

export async function deleteLocalDmConversation(peerPublicKeys: string[]) {
  const peers = new Set(peerPublicKeys);
  const messages = await listLocalDmMessages();
  const database = await openDatabase();
  const transaction = database.transaction(MESSAGE_STORE, "readwrite");
  const store = transaction.objectStore(MESSAGE_STORE);
  messages.filter((message) => peers.has(message.peerPublicKey)).forEach((message) => store.delete(message.messageId));
  await transactionComplete(transaction);
}

export async function clearLocalDmMessages() {
  const database = await openDatabase();
  const transaction = database.transaction(MESSAGE_STORE, "readwrite");
  transaction.objectStore(MESSAGE_STORE).clear();
  await transactionComplete(transaction);
}

export async function clearLocalDmData() {
  const database = await openDatabase();
  const transaction = database.transaction([KEY_STORE, MESSAGE_STORE], "readwrite");
  transaction.objectStore(KEY_STORE).clear();
  transaction.objectStore(MESSAGE_STORE).clear();
  await transactionComplete(transaction);
  database.close();
  databasePromise = null;
  platformKeyPromise = null;
  messagingIdentityPromise = null;
}
