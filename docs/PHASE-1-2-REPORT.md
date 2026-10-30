# Phase 1–2 implementation and verification

## Delivered

The existing UI now runs as a standard React/TypeScript/Vite client. index.html
and src/main.tsx replace Next layout bootstrapping. The original CSS is byte-for-byte
unchanged. The dashboard, spool library, catalogue, NFC/scale, printers, activity,
and backup/help views retain their existing navigation and styling.

The centralized client in lib/api.ts uses relative /api/v1 URLs. It handles JSON
errors, same-origin credentials, CSRF-header plumbing, timeouts, and unavailable
backend responses. The stock compatibility contract is documented separately.
No PHP backend, MySQL schema, production database, deployment or auth system was
created in this phase. Node.js is used only for local tooling.

Legacy API/D1/Worker/configuration/scripts are isolated in legacy/ and excluded
from the frontend build and TypeScript compilation. lib/stock.ts is unchanged.
Old lockfiles remain in the baseline recovery points; npm/package-lock.json is
now the single active dependency setup. next-themes is a standalone React theme
utility used by the preserved UI library; Next itself is not installed.

## Recovery

A complete private local copy was made before conversion, including dependencies,
generated files, D1 state, private headers and configuration. A separate SQLite
online backup was made from a read-only database connection. The saved SQLite
snapshot passes PRAGMA integrity_check. The local studio table had zero rows;
no claim is made about remote/live inventory. A JSON export is also preserved.

The sanitized source archive was checked for forbidden credential/database/private
firmware/build paths (161 archive entries). Git was initialized with a safe ignore
file, a sanitized initial commit and the phase1-source-baseline tag. No global Git
trust configuration was changed. See ROLLBACK.md before any recovery operation.

## Executed checks

| Check | Result |
| --- | --- |
| npm run build | PASS: TypeScript and Vite client build, followed by static validation |
| npm run test:stock | PASS: grouped usage, overdraw rejection, undo, gross-minus-tare correction, assignment uniqueness and backup validation |
| npm run test:api | PASS: relative URLs, same-origin cookies, CSRF header, mutation payload, 409 errors, HTML fallback, invalid response and offline errors |
| npm run test:ui | PASS: jsdom rendering/navigation across all seven views, populated spool/catalogue/activity fixtures, offline notice and disabled save |
| Production HTTP smoke check | PASS: built index.html and its JS/CSS assets return HTTP 200 |
| Development HTTP privacy check | PASS: six existing credential/private backup/legacy/firmware/database paths return HTTP 403 |
| Static output inspection | PASS: 8 files; no server directory, Node entry point, Vinext, Worker or D1 runtime imports |
| Dependency inspection | npm ls next vinext wrangler drizzle-orm @cloudflare/vite-plugin --depth=0 returns empty; npm exits 1 for absent named packages as expected |
| Protected-file comparison | PASS: all 15 recorded D1/firmware files retain their pre-conversion SHA-256 hashes |
| Inventory rules and original CSS | PASS: byte-for-byte comparisons with private baseline |
| SQLite recovery snapshot | PASS: integrity_check = ok |
| Source archive safety | PASS: no private configuration/database/private firmware/build paths |

UI tests use explicit synthetic fixtures and mocked HTTP responses; they never
access D1. No mutation test was run against the local or remote database.

The production directory contains index.html, one compiled JS file, one compiled
CSS file, favicon.svg, and four unchanged public firmware/example/setup downloads.
These are static files. Deploy only dist contents; do not upload the source tree.
Vite preview is a local test server, not a production hosting requirement.

## Verification limits and temporary unavailability

A real Chrome visual check was attempted, but the computer-use tool stopped because
it could not reliably determine the current browser URL. No real-browser visual,
responsive viewport, USB, NFC or physical hardware test passed or is claimed.
Component navigation/rendering checks passed in jsdom. Responsive CSS is preserved,
but viewport appearance still needs browser verification.

The PHP API is absent. The UI shows an explicit disconnected notice; displayed
empty-state figures do not represent loaded inventory. Inventory saves, usage,
reweighing, catalogue persistence, assignments, tag-link persistence, undo and
backup export/restore cannot operate until PHP is connected. No browser-local
inventory substitute or automatic D1 connection was added.

USB parsing remains the old NFC-required prototype. ESP8266 still sends Wi-Fi
requests and is not compatible with that USB parser. Firmware, firmware credentials,
calibration values and D1 files were not changed or flashed. Wi-Fi polling points
at the future API facade and is unavailable until implemented. Authentication and
server-side CSRF validation are future PHP work, not supplied by the client alone.
Google Fonts remain an external styling dependency as in the original design.

## Next steps

1. Implement PHP session authentication, CSRF checks, validation and API responses.
2. Implement normalized MySQL models, transactions, profiles and safe spool codes.
3. Add dry-run legacy import and reconcile actual exported inventory before cutover.
4. Update ESP8266 serial firmware and manual-selection measurement flow separately.
5. Complete desktop/mobile browser visual review and physical scale tests.
6. Stage on cPanel, verify PHP extensions, API rewrites, HTTPS and secret isolation.

Changed paths and archived moves are listed in CHANGED-FILES.md. No production
resources have been created or changed.
