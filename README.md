# D Loop 3D — Filament Studio V2

Authenticated React + TypeScript + Vite frontend with a PHP 8.2+ / MySQL-MariaDB
REST API for standard cPanel hosting. Production serves static assets and PHP per
request; Node is local frontend tooling only. No Cloudflare or resident Node backend.

Phase 4 implements brands/verified tare profiles, physical spool registration and
corrections, immutable spool codes, printer assignments, usage/undo, dashboards
and actor history. The original seven views, branding and inventory rules remain.

## Run locally

XAMPP PHP and MariaDB are already installed. From the project root, terminal 1:

```powershell
$env:DLOOP_CONFIG_FILE = Get-Content backend/var/phase4/active-config.txt -Raw
& 'C:\xampp\php\php.exe' -S 127.0.0.1:8000 -t backend/public backend/router.php
```

Terminal 2:

```powershell
$env:DLOOP_API_PROXY = 'http://127.0.0.1:8000'
npm.cmd run dev -- --port 5173 --strictPort
```

Open http://127.0.0.1:5173. See docs/PHASE-4-LOCAL.md for disposable login details,
your own studio/admin setup, exact verification commands and safe rollback.
Never use fixture accounts for production or upload private configuration.

## Build and checks

```powershell
$env:DLOOP_PHP = 'C:\xampp\php\php.exe'
npm.cmd run test:php
npm.cmd run typecheck
npm.cmd run test:stock
npm.cmd run test:api
npm.cmd run test:ui
npm.cmd run build
```

Deploy only dist contents plus backend/public files; keep PHP src, migrations,
configuration, logs and sessions outside the public root. No production resources
have been created or deployed. Vite preview/PHP's built-in server are local tools.

## Current documentation

- docs/PHASE-4-REPORT.md — exact results and remaining limitations
- docs/PHASE-4-API.md — routes, validation, concurrency and idempotency
- docs/PHASE-4-LOCAL.md — local run, isolated tests and rollback
- docs/PHASE-4-CHANGED-FILES.md — complete changed-file list
- docs/CPANEL-PHP-DEPLOYMENT.md — private/public hosting layout and grants
- docs/ROLLBACK.md — original project backups and recovery

## Source map

- app/page.tsx, app/globals.css — preserved studio views and visual design
- app/authenticated-studio.tsx — login, logout and session restoration
- components/brand-library.tsx, filament-dialog.tsx, inventory-summary.tsx — inventory UI
- lib/api.ts — centralized same-origin /api/v1 client
- lib/stock.ts — unchanged original inventory rules and validation
- backend/src/Inventory.php — transactional normalized inventory service
- backend/migrations/ — versioned schema including Phase 4 migration 0003
- backend/tests/ and scripts/ — unit, HTTP, concurrency and live component checks
- legacy/ — isolated old D1/Worker/Vinext source, not executed
- public/scale/ — unchanged firmware/downloads; hardware integration deferred

D1 imports/restores and ESP8266 firmware changes are deferred. JSON export is a
loaded-state review copy, not a full database backup. No browser-only inventory
or fake successful saves are used. Read the Phase 4 report before deployment.


Phase 5A adds browser USB scale input, manual spool selection, explicit measurement review and a browser simulator. Physical hardware has not been tested: the existing Wi-Fi firmware is unchanged and does not emit the new USB protocol. See [local setup](docs/PHASE-5A-LOCAL.md), [verification report](docs/PHASE-5A-REPORT.md), and [serial protocol](docs/USB-SCALE-PROTOCOL.md).
