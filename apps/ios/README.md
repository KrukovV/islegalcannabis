# iOS App (Contract Only)

This directory is reserved for the future iOS client.

Contract:
- Endpoints: /api/check, /api/reverse-geocode, /api/whereami, /api/paraphrase.
- Cache key: jurisdiction + updated_at + locale.
- Offline: show last known result + disclaimer.
- Do not duplicate law JSON; always source from data/laws via backend.
- See docs/MOBILE_GUIDE.md for API-first flow.
