# Android App (Contract Only)

This directory is reserved for the future Android client.

Contract:
- Endpoints: /api/check, /api/reverse-geocode, /api/whereami, /api/paraphrase.
- Cache key: jurisdiction + updated_at + text.
- Offline: show last known result + disclaimer.
- Do not duplicate law JSON; always source from data/laws via backend.
