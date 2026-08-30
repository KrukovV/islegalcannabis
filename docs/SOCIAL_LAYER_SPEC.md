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
| Store aggregate at global zoom | Count of individually map-eligible regulated cannabis locations grouped by canonical country | `validated-cannabis-store-geo-summary-shop` | `/cannabis-store-summary-shop.svg` | Neutral storefront plus a separately legible count at a low-precision, half-degree-rounded country aggregate anchor; no individual location data |
| Validated stores | Independently validated regulated cannabis location | `validated-cannabis-store-leaf` | `/cannabis-store-leaf.svg` | Static clean green cannabis leaf without a surrounding badge or outline; it remains visible at its validated coordinate while native labels retain visual priority by layer order |
| Social activity | One or more active public MAP discussions in a privacy-safe area | `social-map-activity-chat-bubble` | `/social-discussion-chat.svg` | Magenta chat bubble with active-discussion count |

Hard requirements:

- Social must never reuse the cannabis-leaf asset, store icon ID or store layer.
- Stores must never use the Social chat-bubble asset or Social activity layer.
- The Store aggregate and the leaf are two presentations of the same visible Store Truth records. Below z4.2 there is one stable aggregate per canonical country; from z4.2 to z5.8 there is one stable aggregate per country/state/territory GEO; from z5.8 to z10.2 existing viewport clusters apply; at z10.2 and above individual leaves apply. Each aggregate uses a low-precision, half-degree-rounded anchor computed from all currently visible records in its displayed group. A viewport cluster is at the centroid of its verified members, so a one-record cluster and its local leaf have exactly the same coordinate. The storefront and count are rendered together, visually separate and retain a high-contrast halo; neither participates in symbol placement, so unrelated label/tile updates cannot make a total blink. The aggregate carries only `geo_id`, count and its rounded aggregate anchor, cannot open a location popup, and must never add an unvalidated Store record.
- Store and Social presentation layers are inserted after the final native basemap fill/line geometry and before the complete native label stack. If a style places a native text symbol before later road or building geometry, that text layer is moved above the supplemental layers first. This prevents the basemap from cutting through a leaf, storefront/count or chat bubble while country and place labels remain readable above them. `/truth-map` retains the established continuous horizontal world-wrap interaction; it must not clamp a user at the edge of one rendered world.
- After every completed camera move, the Store layer re-queries its existing viewport data. When a continuous MapLibre world copy yields longitudes outside `[-180, 180]`, only that Store request is canonicalized to WGS84 (including a preserved antimeridian crossing); no camera, Store coordinate, Store Truth gate, leaf or Social location is rewritten. Thus leaves reload in the newly viewed area instead of disappearing at a wrapped-world boundary.
- A Store leaf is a clean full-colour green non-SDF sprite without a surrounding badge or outline; runtime `icon-color`/`icon-halo-*` paint is forbidden. The distinct Social chat bubble is likewise a static full-colour non-SDF sprite with its own contrast outline. Both use viewport alignment so pitch or bearing cannot make their shapes fragment. An invisible Store interaction circle may share exactly its source, filter and Store Truth gate to make the visible leaf reliably hoverable/clickable; it creates neither another marker nor any additional Store record or location precision.
- Truth Map uses the same `createMap` native place-label ranges as `/new-map`: `place_city*` is visible at `5.8–24`, and `place_town*`, `place_villages*`, `place_hamlet*` and `place_suburb*` at `6.6–24`. Tile/data density can change the individual labels selected by MapLibre, but a Truth-Map-only range, territory exception or intermediate no-label band is forbidden.
- A Social marker is not a user pin, store, exact post coordinate, distance-to-user indicator, popularity claim or Legal Truth signal.
- Clicking a Social marker opens/focuses discussions for the already-returned safe H3 query cell and must not open a store or country popup.
- The safe-area focus clears when the current viewport no longer contains that area.
- Realtime invalidation refreshes Social activity without requiring a manual pan or reload.

### Full-zoom presentation contract

This is a route-local `/truth-map` presentation rule, not a change to a
store record, a Social discussion, Legal Truth or the public `/new-map`.

- At local map zoom `15`, the validated-store leaf has MapLibre
  `icon-size=1.35` (the approved `1.5×` increase from `0.90`).
- At the same zoom, a Social chat bubble is never smaller than a leaf: its
  `icon-size` is `1.45` for one active discussion and may grow only with the
  aggregate active-discussion count, up to `1.65`.
- The discussion count remains legible at local zoom `15` with a `14px` text
  presentation. Size communicates neither legal status nor store validation.
- The Social API accepts viewport zoom through `14`. When the visual map is at
  zoom `15`, the client requests `min(mapZoom, 14)` while retaining the local
  z15 rendering. The query remains bounded to the existing privacy-safe H3
  viewport contract and must not add raw location fields, persistence or a new
  discussion.
- The cannabis leaf and the chat bubble remain different image IDs, assets,
  layers and click outcomes regardless of their relative sizes.

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
