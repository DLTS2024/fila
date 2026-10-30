# Frontend API boundary — Phase 4

lib/api.ts is the centralized relative /api/v1 client. Login/session restoration
supply an in-memory CSRF token; cookies are sent same-origin. Inventory requests
use /stock, an authenticated adapter over normalized MySQL tables. No D1 or
browser-local fallback is used. See PHASE-4-API.md for action/resource contracts.

All inventory saves use Idempotency-Key. The same intent/key is retained across
network or ambiguous server failures. Successful operations reload current state;
conflicts require review and never silently overwrite. New/update spool forms
freeze a preview and require explicit confirmation before a request is sent.

The Vite development proxy uses server-only DLOOP_API_PROXY, preserving /api/v1
paths. Never use VITE_ variables for passwords/tokens. Production uses relative
paths on the same cPanel origin. No Node process is required by production output.

Legacy restore/import and hardware ingestion remain deferred. See PHASE-4-LOCAL.md
for commands and PHASE-4-REPORT.md for actual executed verification and limits.
