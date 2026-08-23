# Social Layer implementation status — 2026-08-14

This is local/internal acceptance evidence for the current repository. It is not a production release or a claim that the DM candidate is security-audited.

The canonical product/UI contract is `docs/SOCIAL_LAYER_SPEC.md`. This status document reports implementation evidence and does not redefine that contract.

## Implemented public vertical slice

- The integration boundary remains in `docs/SOCIAL_INTEGRATION_MAP.md`; Social code is isolated under `apps/web/src/social` and renders only on `/truth-map`.
- The separate local `islegal_social` PostgreSQL database has five applied Social/DM migrations: durable schema, authorization/TTL/RLS, public slice, isolated DM candidate and DM hardening. Exact post locations and PostGIS geometry are intentionally absent because no explicit-place query is implemented.
- Project-owned pseudonymous identities use HttpOnly sessions. MAP, GEO and LAW discussions, nested comments, votes, reports, blocks, author deletion, moderation paths, rate limits and bounded cleanup exist on the server.
- Browser coordinates are converted to H3 before the Social request. The server accepts only H3 resolution 4 for this slice, rejects raw location query/body fields, and treats a large viewport as no query rather than a truncated world query.
- PostgreSQL is durable truth. One process-wide LISTEN/NOTIFY hub fans invalidation out to bounded SSE subscribers; client reconciliation remains API/DB based, and viewport churn removes its in-memory subscriber without amplifying PostgreSQL listeners.
- `/`, `/new-map`, Legal Truth, SSOT, legal colours, stores, SEO, production and deployment remain outside the Social mount.
- `/truth-map` retains the canonical editable AI-assistant dock as the persistent primary map control. Social is compact by default and expands independently without covering the AI input.
- Marker semantics are separated: validated stores retain `/cannabis-store-leaf.svg` (`validated-cannabis-store-leaf`), while Social MAP activity uses `/social-discussion-chat.svg` (`social-map-activity-chat-bubble`) in magenta with the active-discussion count.
- Internet DM is a local candidate behind `DM_ENABLED`: separate per-device messaging keys, signed device challenges and submissions, NIP-44/NIP-59 client encryption, ciphertext-only bounded relay, encrypted IndexedDB history/outbox, multi-device fanout, receipts, revocation and local deletion controls. Push remains disabled behind a minimal opaque notification adapter. BLE remains disabled.

## Acceptance matrix

| Area | Status | Evidence / boundary |
| --- | --- | --- |
| SOCIAL_SCHEMA | PASS (local) | All five migrations applied; rollback-only DB smoke verifies RLS 10/10, reply/vote triggers, MAP expiry exclusion, ciphertext-only relay shape and `raw_gps_columns=0`. |
| PUBLIC_SOCIAL | PASS (local) | Real `/truth-map` UI creates project identities and durable MAP/GEO/LAW discussions; no Social UI exists on `/` or `/new-map`. |
| AI_SOCIAL_LAYOUT | PASS (last measured local gate) | The editable AI dock remains visible while Social is compact or expanded; the independent panels do not overlap. This documentation-only update did not rerun the measurement. |
| MARKER_SEMANTICS | PASS (last measured local gate) | Store cannabis leaves and Social chat bubbles use different assets/image IDs; live MAP activity selection previously passed. This documentation-only update did not rerun the measurement. |
| GEO_PRIVACY | PASS (local) | Focused privacy/API tests and live browser payload inspection reject/omit raw coordinates. Publication is H3-only at resolution 4. |
| REALTIME | PASS (local) | A two-browser WebKit flow delivered a MAP discussion to the second user before the 15-second reconciliation interval, then propagated reply and vote invalidations. |
| LAW_DISCUSSIONS | PASS (local) | Live LAW UI creation survived a fresh browser navigation/reconnect with both peer and nested replies intact; the PostgreSQL integration independently verifies non-expiring LAW rows. |
| MODERATION | PASS (local API/UI slice) | Live UI report and vote actions committed; block, owner removal, moderator authorization/hide and audit-row behavior pass real-PostgreSQL integration. A dedicated moderator dashboard is outside this slice. |
| LOAD_TEST | PASS (local) | Final HTTP/1.1 run: 1,000 hot-cell requests at concurrency 1,000 plus ten cold-cell shards totalling concurrency 1,000, zero failures. Internal rerun: 500 DB reads, 100/100 broadcast events, 128 subscription churn cycles, `activeSubscribers 0→0`. The earlier diagnostic run with client-side `TypeError` is retained as a failed artifact, not hidden. See `Artifacts/social/social-load-*.json`. |
| DM | PASS (local candidate) | Two-user WebKit proves one logical message ID fan-out to two devices, two signed sender bindings, ciphertext-only/no-GEO submissions, offline queue/restart, local decrypt, DELIVERED/READ, sender reconciliation, encrypted local retention controls and exact fixture cleanup. See `Artifacts/social/dm-live-*` and real-PostgreSQL integration. |
| DM_SECURITY | FAIL (production gate) | `docs/DM_SECURITY_REVIEW.md`: no forward secrecy/post-compromise security, independent safety-number/key-transparency verification, native hardened key storage, hardened account recovery, real push/relay certification or independent audit. |
| BLE | DEFERRED | The production DM security gate is not PASS. `BLE_DM_ENABLED=0`; no BLE discovery, persistent identifier, encounter log, transport or proximity telemetry exists. |
| REGRESSION | PASS (last measured before doc-only update) | The last runtime gate included fresh lint, scoped Social typecheck, 132/132 full test files and 540/540 assertions, real-PostgreSQL integration, Next.js 16.3.1 production build with 354/354 static pages, public WebKit, DM WebKit, privacy, cleanup, load and root pass-cycle gates. This documentation-only update did not rerun them. |

## Privacy observability statement

These are the last measured implementation values before the documentation-only synchronization; they were not remeasured by this change.

```text
RAW_GPS_DB_OCCURRENCES = 0 (live schema inspection + rollback-only DB smoke)
RAW_GPS_REQUEST_PAYLOAD_OCCURRENCES = 0 (live two-user browser flow)
RAW_GPS_LOG_OCCURRENCES = 0 (Social source sinks + live browser warning/error inspection)
RAW_GPS_ANALYTICS_OCCURRENCES = 0 (Social integration source audit)
DM_PLAINTEXT_RELAY_OCCURRENCES = 0 (live browser payload + DB schema/value inspection)
DM_PLAINTEXT_LOG_OCCURRENCES = 0 (DM source/log-sink audit)
DM_PRIVATE_KEY_SERVER_PAYLOAD_OCCURRENCES = 0 (DM API source audit)
STALE_SUBSCRIPTIONS_AFTER_VIEWPORT_CHANGE = 0 (128-cycle measured hub churn + focused tests)
LEGAL_TRUTH_REGRESSIONS = 0 (last measured 540-test suite + root pass-cycle)
```

No current Social API accepts a post-location geometry object. Any future explicit public place requires separate privacy review and must remain semantically distinct from author presence.

## Documentation-only update note

`2026-08-14`: documentation, agent rules and the canonical Social specification were synchronized with the accepted AI-dock and marker-separation behavior. `VALIDATION=NOT_RUN_USER_REQUEST`; no tests, UI automation, build, smoke or `pass_cycle` were run for this documentation-only change, and no new runtime/regression claim is made.
