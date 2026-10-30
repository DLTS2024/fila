# D Loop 3D — Filament Studio V2

React + TypeScript + Vite static frontend, prepared for a PHP 8.x / MySQL API
on standard cPanel hosting at filament.dlts.in. Node.js is local build tooling only.
No PHP backend or production database is created in Phase 1–2.

## Local development

Use Node.js 22.15+ (this conversion was verified with Node 24.22.1) and npm:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the localhost address printed by Vite. The development server binds to
127.0.0.1. The PHP API is not implemented yet: all seven views can be browsed,
but inventory is not loaded and saves/export/restore are disabled. No mock data
or localStorage inventory replaces the saved database.

When PHP is available, set its local proxy target before starting Vite:

```powershell
$env:DLOOP_API_PROXY = 'http://127.0.0.1:8000'
npm.cmd run dev
```

The API must handle `/api/v1` paths. See docs/API-CONTRACT.md.

## Checks and build

```powershell
npm.cmd run test:stock
npm.cmd run test:api
npm.cmd run test:ui
npm.cmd run build
npm.cmd run preview
```

`build` runs TypeScript, Vite's client build, and static-artifact validation.
Deploy only the contents of `dist`, never the project folder. The retained public
firmware downloads are source/example files, not server executables. `vite preview`
is only a local preview; cPanel serves the files directly. No Node process,
Vinext, Workers or D1 is required by the production frontend.

No production deployment is performed. The future PHP API needs authentication,
CSRF validation, prepared statements, input validation, transactions and protected
credentials before production use. No Apache API rewrite is installed yet.

## Project map

- app/page.tsx — preserved studio UI and seven navigation views
- app/connections.tsx — preserved hardware UI, pending ESP8266 USB integration
- app/globals.css — original branding and responsive design
- src/main.tsx and index.html — React entry point and static metadata
- lib/api.ts — centralized relative PHP API boundary
- lib/stock.ts — unchanged inventory rules and types
- components/, hooks/, vendor/ — preserved UI support files
- legacy/ — archived APIs, D1, Worker, old configuration and scripts
- public/scale/ — unchanged firmware sources and prototype instructions
- docs/ROLLBACK.md — private backups, baseline tag and recovery procedure
- docs/PHASE-1-2-REPORT.md — changes, verification and remaining limitations

The original README and setup instructions are archived under legacy/. They
refer to V1 and must not be followed as V2 installation instructions.

