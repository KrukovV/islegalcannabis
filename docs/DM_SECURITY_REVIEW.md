# Internet E2E DM Candidate Security Review

Date: 2026-08-14

Scope: local/internal `InternetPrivateTransport` candidate only

Protocols/libraries: NIP-17 message shape, NIP-44 v2 encryption, NIP-59 seal/gift wrap through `nostr-tools@2.24.1`

Production security gate: **FAIL**
BLE prototype gate: **DEFERRED**

## Implemented boundary

- `UserIdentity`, `DeviceIdentity`, and `MessagingKeyIdentity` are separate.
- Each browser device owns a distinct Nostr messaging key. The private key is wrapped by a non-extractable Web Crypto AES-GCM key and stored in IndexedDB; private material is never sent to the server.
- Device registration consumes a short-lived, hashed server challenge and verifies a signed registration event.
- The client creates a NIP-17-style kind `14` rumor, a NIP-59 seal, and a kind `1059` gift wrap using the maintained `nostr-tools` implementation. It does not implement cryptographic primitives.
- Multi-device fanout uses one rumor/message ID with a separate gift wrap and receipt token per recipient device.
- Relay persistence contains recipient device/key, gift-wrap JSON, hashed receipt token, bounded state/attempt/expiry metadata, and no sender account/device ID or plaintext field.
- Inbox and ACK operations require both an active project session and ownership of the active recipient device. Revocation immediately removes inbox/ACK authorization.
- Local message history, outbox envelopes, and receipt tokens are encrypted at rest with Web Crypto. UI controls delete one local message, a local conversation, or all local history.
- Push is disabled. The replaceable `NotificationProvider` boundary accepts only notification type plus opaque entity ID; it cannot receive DM plaintext or GEO context.
- `DM_ENABLED` and `BLE_DM_ENABLED` remain independent kill switches. BLE remains disabled.

## Protocol properties and limits

The candidate follows the current primary NIP documents: [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md), [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md), and [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md). NIP-17 remains marked draft. NIP-44 explicitly does not provide forward secrecy or post-compromise security. NIP-59 gift wrapping hides the sender identity from the relay behind a random outer key, but it does not hide the recipient public key, connection IP, timing, traffic volume, or ciphertext size from relay/network observers.

The present transport is therefore a replaceable local candidate, not a security-audited messenger and not a production Nostr-relay deployment.

## Threat review

| Threat | Current control | Residual result |
|---|---|---|
| MITM / key substitution | Signed device challenge binds a messaging public key to the authenticated project identity; submit authorization binds sender device, message ID, and recipient key. | **Partial.** There is no independent safety-number/QR verification, key-transparency log, or hardened recovery ceremony. |
| Malicious relay | Plaintext is encrypted before submission; signed outer, seal, rumor hash, sender binding, recipient tag, and expected message ID are verified client-side. | **Partial.** Relay can drop, delay, replay, reorder, correlate recipient, IP, timing, size, and volume. |
| Replay / duplicate | Unique `(message_id, recipient_device_id)`, receipt-hash equality, bounded attempt count, local ID dedupe. | **PASS for tested candidate.** Reordering has no causal-sequence protocol beyond immutable message time/ID. |
| Offline recipient | Ciphertext-only queue, seven-day hard maximum, expired inbox exclusion, bounded cleanup. | **PASS for tested candidate.** Availability still depends on the local HTTP relay. |
| Stolen account/session | Existing private history is not in account storage. New-device registration still requires the live project session and signed device key. | **FAIL for production.** A stolen authenticated session can add a new device and receive future fanout; no user-confirmed second factor or external device-verification ceremony exists. |
| Stolen device / XSS | Secret bytes are AES-GCM wrapped and the wrapping key is non-extractable. | **FAIL for production.** Same-origin malicious script can ask Web Crypto to decrypt; no Secure Enclave/Keychain binding, biometric gate, or native trusted UI exists. |
| Revoked device | Server rejects inbox/ACK and recipient lookup excludes revoked devices. | **Partial.** Revocation cannot erase ciphertext or plaintext already downloaded to that device. |
| Key compromise | Device rotation hook and revocation exist. | **FAIL for production.** NIP-44 has no forward secrecy or post-compromise security; archived ciphertext can be exposed by later key compromise. |
| Backup compromise | No plaintext/server key backup is implemented. | **Unconfirmed.** Browser/profile backup semantics and OS-at-rest behavior are platform-dependent and not controlled here. |
| Push leakage | Push adapter is disabled; minimal adapter contract carries only event type and opaque ID. | **PASS for local candidate; DEFERRED for real APNs/FCM/Web Push.** |
| Log/analytics leakage | API error logs contain request ID/code only; automated source/artifact scans and live payload checks reject plaintext/private-key/GEO fields. | **PASS for inspected local candidate.** Production APM/crash-provider configuration is not present to certify. |
| Metadata correlation | Gift wrap and no stored sender columns reduce relay metadata. | **FAIL for anonymity claims.** Recipient, IP, timing, size, and traffic patterns remain observable. |
| Remote deletion | Read relay copies are pruned under bounded policy; account deletion cascades owned devices/queues. | **Partial.** No guarantee is made for already delivered recipient copies or decentralized relays. |

## Gate decision

The local/private-message vertical slice may remain enabled for internal testing because confidentiality-before-relay, authenticated device binding, ciphertext-only storage, offline delivery, dedupe, receipts, restart recovery, revocation, retention controls, and no-GEO inheritance are exercised.

Production Internet DM is blocked by the lack of forward secrecy/post-compromise security, independent device/key verification, hardened account recovery, native secure-key storage, real push-provider review, external relay hardening, and an independent cryptographic/security audit. These are transport/key-lifecycle gaps; replacing `InternetPrivateTransport` does not require rewriting Public Social, GeoChat, Discussion, or Legal Truth.

Because the production DM security gate is not PASS, tasks 20/35/36 require BLE/bitchat-derived work to remain **DEFERRED**. `BLE_DM_ENABLED=0`; no BLE discovery, persistent identifier, encounter log, or proximity claim has been introduced.
