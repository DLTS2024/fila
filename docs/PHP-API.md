# Phase 3 REST API

Base URL `/api/v1`. JSON success: `{ "data": ... }`; paginated collections add
`meta: {total, limit, offset}`. Errors: `{error, code, requestId}`. The response
also includes X-Request-ID and Cache-Control: no-store. No CORS is enabled.

All inventory routes require an active admin session. GET auth/session is public
and returns anonymous session state and CSRF token. POST login/logout require
that token AND an exact allowed Origin; logout also requires authentication.

| Method | Path | Request / response data |
| --- | --- | --- |
| GET | /auth/session | `{authenticated, user: null or {id,email,role}, csrfToken}` |
| POST | /auth/login | JSON `{email,password}`; returns authenticated session, new CSRF token |
| POST | /auth/logout | JSON `{}`; revokes current session and returns fresh anonymous token |
| GET | /dashboard | `{totalSpools,remainingG,lowStockSpools,emptySpools,lowStockThresholdG}` |
| GET | /brands | List `{id,name}`; filters `q`, `limit`, `offset` |
| GET | /tare-profiles | Profile/brand/mass metadata; filters `brand_id`, `limit`, `offset` |
| GET | /spools | Normalized spool fields, effective tare, optional NFC UID; filters below |

Collections default to 50 rows, maximum 100; offset 0–1,000,000. Brands and
profile IDs accepted as filters are positive integers through 999,999,999.
Spool filters: `q`, `brand_id`, `material`, `status=active|archived` (default active),
`low_stock=0|1`, `limit`, `offset`. Search treats SQL metacharacters literally.
Unknown fields, arrays in scalar fields, invalid UTF-8, control characters and
invalid pagination are rejected. Date/time strings are UTC; mass decimals are
returned as strings to preserve exact precision. Normalize IDs as strings in
future frontend adapters; PDO may return small numeric IDs as integers.

Dashboard includes active spools only. Low stock follows the preserved rule:
0 < remaining < 200 g. Empty spools are counted separately. Effective tare uses
per-spool override first, then the selected profile; unknown tare remains null.
Changing a profile does not update remaining stock or historical measurements.

Status codes: 200 success, 400 malformed JSON/HTTPS required, 401 unauthenticated
or invalid credentials, 403 failed CSRF/Origin, 404 unknown route, 405 wrong method,
413 oversized body, 415 unsupported content type, 422 validation, 429 login limit,
503 unavailable configuration/database. Database errors are never returned.

Authentication flow:

1. GET /auth/session using same-origin credentials.
2. POST /auth/login with JSON and X-CSRF-Token from step 1. The browser supplies
   Origin. Keep the returned replacement CSRF token in memory.
3. Use the cookie for protected GETs. On logout, POST `{}` with the current token.
4. On expired/revoked sessions, acquire a new anonymous session and sign in again.

Cookies are host-only, HttpOnly, SameSite=Strict, scoped to /api/v1; production
adds Secure and requires HTTPS. Login, logout, expiry and periodic rotation
replace session IDs. Active users are checked against the DB on protected requests.
Defaults: idle timeout 30 minutes, absolute timeout 8 hours, rotation 15 minutes.

Login throttles reserve attempts atomically before checking credentials: 30 per
source IP and 10 per normalized account within 15 minutes, including successful
attempts. Retry-After is a conservative 900 seconds. HMAC keys avoid storing raw
IP/email in throttle rows. Forwarded headers are ignored. Behind a reverse proxy,
configure trusted server-level REMOTE_ADDR handling; otherwise users may share
one IP quota. Expired rows are reused; a future private maintenance job should
prune old buckets under an explicit retention policy.

The idempotency table is reserved for future inventory mutations. No stock,
measurement, profile, catalogue or tag write endpoints exist in Phase 3.
`/stock`, `/scale-reading`, `/setup` and registration routes return JSON 404.
