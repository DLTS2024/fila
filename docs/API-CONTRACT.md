# Frontend API boundary (Phase 2)

All frontend HTTP calls go through `lib/api.ts` and relative `/api/v1` URLs.
The client sends same-origin cookies, requests JSON, has a 10-second timeout,
and rejects HTML SPA fallbacks rather than interpreting them as inventory.
No credentials are bundled. A future session handler can use `setCsrfToken` to
attach `X-CSRF-Token`; PHP must validate it and enforce authentication itself.

The compatibility facade currently expects:

- GET `/api/v1/stock`: `{ revision: number, state: { spools, history, slots, catalogue? } }`.
- POST `/api/v1/stock`: `{ revision, action }`, returning the updated snapshot.
- GET `/api/v1/scale-reading`: `{ reading: null | { gross_g, stable, recorded_at } }`.
- Errors: non-2xx JSON `{ error: string }`; conflicts should use 409.

These preserve the existing UI's state/action shape. Phase 3 should map this
facade to the proposed resource endpoints (spools, measurements, profiles,
activity, authentication). The facade does not require a MySQL JSON-blob model.
PHP remains authoritative for validation, transactions and history.

Until PHP exists, failed inventory loading shows an explicit notice, renders the
existing empty-state interface, and disables saves/export/restore. Empty figures
are not a statement about actual saved inventory. No mock inventory, browser
storage, automatic D1 fallback or migration is used.

An optional local proxy is configured with the server-only environment variable
`DLOOP_API_PROXY=http://127.0.0.1:8000`. The target must preserve `/api/v1` paths.
It is not needed for browsing the disconnected UI. Do not use `VITE_` variables
for passwords or tokens: they can be exposed in browser assets.
