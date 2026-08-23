# Social Layer integration map

Canonical product and UI invariants live in `docs/SOCIAL_LAYER_SPEC.md`. This file describes integration seams and cannot override that specification.

## Existing

| Area | Current project surface | Social decision |
| --- | --- | --- |
| Audit map | `apps/web/src/truth-map/TruthMapRoot.tsx`, MapLibre and the validated `StoreLayer` viewport query | Reuse the map lifecycle and its abort/generation guard only on the isolated proposal-only `/truth-map` route. Social must not alter legal fills, legal popup data or store visibility, and it must never mount on `/` or `/new-map`. |
| AI + Social composition | Canonical `MapGeoDock`/AI input plus the separate `/truth-map` Social panel | Keep the editable AI input persistent and primary. Social is compact by default, expands independently above/beside it and never replaces, hides, disables or overlaps the AI dock. |
| Map marker vocabulary | Store `validated-cannabis-store-leaf` and Social `social-map-activity-chat-bubble` | Store leaves and Social chat bubbles are exclusive domain symbols. Social shows an active-discussion count and must never reuse the store asset/layer. |
| Geo utilities | `apps/web/src/lib/location/*`, `apps/web/src/lib/geo/*`, `/api/geo/resolve` | Do not reuse persistence or server APIs for Social. They may process current application location and are not a Social identity/location store. GeoChat coarsening happens in a client-only Social privacy module before a Social request exists. |
| Spatial library | `h3-js` is introduced by this isolated Social foundation; no prior project H3 boundary existed | Use only behind `PrivacyResolutionGuard` and `GeoIndexProvider`. A cell is treated as protected location data, not anonymous data. |
| API convention | App Router route handlers and `@/lib/api/response.ts` | Reuse response IDs, status conventions and `nodejs` runtime. Add dedicated `/api/social/*` routes; do not overload Truth, map or existing geo routes. |
| Map race protection | `apps/web/src/new-map/stores/StoreLayer.ts` aborts requests and ignores stale request IDs | Reuse the same cancellation/generation pattern for Social viewport reads and bound subscriptions. |
| Analytics/logging | `@/lib/analytics.ts` uses an allowlisted event name; API response errors log only request ID/code/message | Social events receive no coordinates, cells, private message content, identity secrets or detailed realtime payloads. Existing `/api/geo/resolve` is outside Social and must never be imported into it. |
| Auth / UserIdentity | The project owns pseudonymous Social identities and opaque HttpOnly sessions; only token hashes are durable | Public Social writes and management require this identity. DM adds a signed, challenge-bound DeviceIdentity and a separate per-device MessagingKeyIdentity; no private key is account data. |
| PostgreSQL / PostGIS | The isolated local `islegal_social` PostgreSQL database and five idempotent Social/DM migrations are active | PostgreSQL is the only durable public-Social truth and bounded DM delivery store. PostGIS is deliberately absent because no exact post-location query exists; MAP persistence is coarse H3-only and DM relay persistence is gift-wrap ciphertext only. |
| Realtime | Dedicated PostgreSQL LISTEN/NOTIFY adapter and SSE endpoint | One process-wide listener fans out invalidation-only events to bounded clients. History and reconciliation always return to PostgreSQL/API truth. |
| Moderation / notifications / DM | No reusable project abstractions were found | Project-owned ports now include moderation, rate limit, minimal notification, `PrivateTransport` and `TransportRouter`. The Internet adapter contains Nostr-specific logic; push and BLE adapters remain disabled. |

## Reuse and extension boundaries

```text
MapLibre viewport lifecycle ──> SocialViewportController ──> Social API
                                                             │
Existing UserIdentity (when connected) ──> UserIdentityProvider
                                                             │
Client-only PrivacyResolutionGuard ──> geo_cell + resolution │
                                                             ▼
                                                     Social domain ports
                                                    /       |       \
                                             PostgreSQL  Realtime   Notification
                                                truth    delivery    delivery
```

- The legal map, Truth pipeline, Wiki, 307-GEO audit, stores, SEO and existing location flow remain independent.
- The AI-assistant dock remains visible/editable regardless of Social enabled, disabled, compact or expanded state.
- Validated stores remain cannabis leaves; public MAP discussions remain magenta chat bubbles with aggregate counts.
- A Social request accepts an H3 cell and a resolution, never raw coordinates, accuracy, IP-derived location, a movement trail or a user-location object.
- `Discussion` is the common durable model for MAP, GEO, LAW, NEWS and EVENT. Comments, votes, reports, blocks and profiles are common domain entities.
- Map discussion expiry removes it from active-map queries first; physical cleanup is a bounded background concern.
- User location is never persisted by Social. A user-selected public place is a separately confirmed post-location object, never author presence.
- Provider-specific code belongs only in adapters. Postgres, realtime, notifications and private transport are ports rather than Social-domain imports.

## Current safe implementation boundary

Public MAP/GEO/LAW is locally enabled only on `/truth-map` through `.env.local`, the isolated least-privilege database and project-owned pseudonymous sessions. Browser GPS is client-only and is converted to H3 r4 before the request; a separate map-centre action provides a reproducible privacy-safe context without asking for GPS. API guards reject raw location fields, and Social fails closed when its database/identity flags are absent.

The public slice has live multi-user, persistence, TTL, realtime, load and privacy evidence. The local Internet E2E candidate is enabled only on `/truth-map`; it encrypts before the relay, keeps encrypted local history, uses one logical ID across device fanout, and exposes independent device revocation and DM kill switches. Its production security gate is explicitly FAIL in `docs/DM_SECURITY_REVIEW.md`, so BLE remains disabled/deferred. Neither candidate changes Legal Truth, the existing public map, SSOT, stores, SEO or production.
