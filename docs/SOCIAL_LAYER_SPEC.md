# Social Layer product specification

Status: canonical local implementation specification

Updated: 2026-08-14
Scope: `/truth-map` Public Social, GeoChat, Discussions and the local Internet E2E DM candidate

This document is the repository-owned specification derived from the original Social/GeoChat/DM task. `docs/SOCIAL_INTEGRATION_MAP.md` describes integration seams, `docs/SOCIAL_IMPLEMENTATION_STATUS.md` records measured implementation status, and `docs/DM_SECURITY_REVIEW.md` owns the production DM security verdict. Those documents may add evidence but must not weaken the invariants below.

## 1. Product boundary

The Social Layer consists of:

- `MAP`: ephemeral privacy-safe area discussions;
- `GEO`, `LAW`, `NEWS`: persistent Reddit-like discussions;
- `USER ↔ USER`: separate end-to-end encrypted private messaging;
- `NEARBY/OFFLINE`: optional future BLE transport, currently deferred.

The project owns the Social domain, UserIdentity, Discussion model, privacy policy, moderation, ranking, storage and API. PostgreSQL is durable truth. Realtime is delivery/invalidation only. Transport-specific implementations are replaceable adapters.

Social must remain independent from Legal Truth, the 307-GEO reconciliation, store eligibility, map colours, SSOT, SEO, production and deployment.

## 2. Route and layout contract

- Public Social and DM render only on `/truth-map`.
- `/` and `/new-map` contain no Social panel, Social marker layer or Social runtime flags.
- `/truth-map` always retains the canonical editable AI-assistant input dock.
- The AI-assistant input dock is the primary persistent bottom map control. Social cannot replace it, hide it, disable it or cover it.
- Social is a separate control: compact by default, independently expandable, and positioned without overlap with the AI dock.
- Collapsing Social changes only Social presentation; the AI input remains visible and editable.
- A missing database/runtime flag may fail Social closed, but cannot remove or disable the AI dock.

## 3. Marker semantics

Marker meaning is exclusive and visually unambiguous:

| Domain | Meaning | MapLibre image ID | Asset | Required presentation |
| --- | --- | --- | --- | --- |
| Validated stores | Independently validated regulated cannabis location | `validated-cannabis-store-leaf` | `/cannabis-store-leaf.svg` | Cannabis leaf; colour may encode validated store type |
| Social activity | One or more active public MAP discussions in a privacy-safe area | `social-map-activity-chat-bubble` | `/social-discussion-chat.svg` | Magenta chat bubble with active-discussion count |

Hard requirements:

- Social must never reuse the cannabis-leaf asset, store icon ID or store layer.
- Stores must never use the Social chat-bubble asset or Social activity layer.
- A Social marker is not a user pin, store, exact post coordinate, distance-to-user indicator, popularity claim or Legal Truth signal.
- Clicking a Social marker opens/focuses discussions for the already-returned safe H3 query cell and must not open a store or country popup.
- The safe-area focus clears when the current viewport no longer contains that area.
- Realtime invalidation refreshes Social activity without requiring a manual pan or reload.

## 4. Public message visibility

MAP publication flow:

```text
current client location or explicitly selected map context
  → client-only privacy guard
  → approved H3 cell and resolution
  → Social API
  → PostgreSQL discussion
  → realtime invalidation
  → API/DB reconciliation for viewers of the same bounded area
```

- A MAP discussion is visible to users whose `/truth-map` viewport query includes its privacy-safe H3 area.
- This is bounded map-area visibility, not a global broadcast, exact-radius proximity feed or background push to every nearby user.
- Individual discussion markers may be hidden at unsuitable world/low zoom and appear at an approved discussion viewport level.
- MAP discussions have a default active-map TTL of 24 hours and a hard visibility ceiling of 72 hours where activity-extension policy applies.
- Expiry first means “stop showing on the active map”; bounded physical cleanup is separate.
- Realtime delivery never replaces persistence or history reconciliation through PostgreSQL/API.

## 5. Discussion domain

Use one durable `Discussion` model for `MAP | GEO | NEWS | LAW | EVENT`, with shared `Comment`, `Vote`, `Report`, `Block` and `UserSocialProfile` entities. Do not create parallel `map_messages`, `law_comments` or `news_comments` truth stores.

Required discussion behavior:

- nested replies;
- votes and deterministic ranking inputs;
- reports and moderation state;
- author deletion and authorized moderator actions;
- rate limits and abuse controls;
- persistent `LAW`, `NEWS` and `GEO` discussions (`expires_at = null`);
- bounded TTL behavior for `MAP` and event-end expiry for `EVENT`.

## 6. Privacy invariants

The following are forbidden:

- public exact user location;
- user-location history or previous-cell history;
- public user pins or exact distance to another user;
- raw latitude, longitude, GPS accuracy or movement trails in Social API requests;
- raw GPS in Social DB, logs, analytics, crash reports, APM or realtime payloads;
- background location tracking for GeoChat.

H3 is location data, not automatic anonymization. Coarsening happens on the client before a Social request. The server accepts only policy-approved H3 resolution and rejects raw-location fields fail closed. User location and post location are different concepts; an explicitly selected public place requires a separate confirmation and privacy review.

## 7. Identity, storage and realtime

- Public writes use project-owned pseudonymous UserIdentity with opaque HttpOnly sessions.
- PostgreSQL is the only durable Public Social truth.
- Realtime transports invalidation/delivery events only; clients reconcile through API/DB.
- Viewport changes cancel stale reads/subscriptions and cannot accumulate listeners.
- Social logs contain only bounded operational metadata and never message secrets, private keys, raw GPS or detailed location payloads.

## 8. Private messaging boundary

Internet DM is a separate local candidate behind its own feature flag and transport port:

- client-side encryption before relay submission;
- ciphertext-only bounded relay persistence;
- separate device and messaging identities;
- encrypted local history/outbox;
- multi-device fanout, receipts, revocation and local deletion.

Local functional PASS is not production security approval. Production DM remains FAIL until the independent requirements in `docs/DM_SECURITY_REVIEW.md` pass, including forward secrecy/post-compromise security, independent key verification, hardened recovery/storage, push/relay review and independent audit. BLE remains disabled/deferred until that gate changes explicitly.

## 9. Fail-closed and non-regression requirements

- Missing Social DB/identity/runtime configuration disables Social writes safely and leaves the AI assistant intact.
- Missing or style-reloading MapLibre layers are checked before feature queries; an absent optional store/Social layer cannot crash `/truth-map`.
- Social must not write Legal Truth, store truth, GEO colours, SSOT, SEO, production or deployment state.
- Parallel legal/store evidence collection is preserved; Social work cannot delete, rewrite or repurpose it.

## 10. Local manual acceptance

Entry point: `http://127.0.0.1:3000/truth-map`.

For two-user verification, use separate browser contexts so HttpOnly sessions are independent:

1. Open the same bounded map area in both contexts.
2. Confirm the AI-assistant input is visible/editable in both.
3. Expand Social independently and join with two different pseudonyms.
4. In the sender, select the privacy-safe current area and publish a MAP discussion.
5. Confirm the recipient sees the discussion through realtime/API reconciliation.
6. Confirm the map shows a magenta chat bubble with a count, not a cannabis leaf.
7. Click it and confirm the safe-area discussion focus opens without a store/country popup.
8. Confirm validated stores, when present, remain cannabis leaves.

Normal implementation acceptance requires lint before UI/smoke, focused Social typecheck/tests, live two-user UI proof, privacy/cleanup checks and the root pass cycle. When the user explicitly requests documentation-only changes without tests/pass-cycle, record `VALIDATION=NOT_RUN_USER_REQUEST` and make no new runtime, regression or release claim.
