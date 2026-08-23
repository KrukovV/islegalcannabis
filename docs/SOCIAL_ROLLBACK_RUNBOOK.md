# Social / DM Rollback Runbook

The Social and DM migrations are additive and isolated from Legal Truth, Wiki, 307-GEO, stores, SEO, and existing map tables. Automated destructive down-migrations are intentionally absent because they could erase community or queued encrypted data.

## Immediate fail-closed rollback

1. Set `DM_ENABLED=0` to stop device/recipient/relay APIs and hide the DM client while Public Social and Legal Truth continue.
2. Set `GEOCHAT_ENABLED=0` to stop MAP Social writes without disabling persistent LAW/GEO discussion reads.
3. Set `SOCIAL_PUBLIC_ENABLED=0` to disable all public Social surfaces while keeping `/`, `/new-map`, Truth, Wiki, stores, and SEO available.
4. `NEARBY_ENABLED=0` and `BLE_DM_ENABLED=0` remain independent and are the required baseline.

## Data handling

- Preserve PostgreSQL tables during incident containment; do not drop or rewrite evidence while diagnosing.
- Run the bounded cleanup job for expired MAP rows, expired/read relay envelopes, stale challenges, attempts, sessions, and rate windows.
- If permanent removal is explicitly authorized, export an encrypted snapshot, verify exact table ownership and row counts, then use a separately reviewed migration. Never modify Legal Truth/SSOT tables as part of Social rollback.
- Client local-history deletion is user-controlled and does not claim deletion of already delivered copies on other devices.

## Verification

- Re-run Social schema, privacy, authorization, migration, and rollback-boundary tests.
- Verify `/` and `/new-map` contain no Social/DM UI and `/truth-map` fails closed according to the flags.
- Run `bash tools/pass_cycle.sh` and require `POST_CHECKS_OK=1` and `HUB_STAGE_REPORT_OK=1`.
