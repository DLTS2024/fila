# D Loop 3D — edit in VS Code + Codex

This ZIP contains editable source from published commit 39039c8a99319e621730dc74b6a50ac70e0b0382, plus this local setup guide and local database setup files. It is not a downloaded HTML snapshot.

## Windows setup

1. Extract the ZIP to a normal folder (not inside the ZIP viewer).
2. Install Node.js 22.13+ (a supported Node LTS version meeting that minimum), VS Code and the official OpenAI Codex extension. Restart VS Code after installing Node.
3. VS Code → File → Open Folder → DLoop-3D-Filament-Studio.
4. Terminal → New Terminal. Run:

```powershell
npx --yes pnpm@11.25.0 install --frozen-lockfile
node scripts/init-local-db.mjs
npx --yes pnpm@11.25.0 dev
```

Open http://localhost:5173 . Keep the terminal running; Ctrl+C stops it.
The portable development profile is selected automatically. You do not need the original managed Linux environment, its Bash install helpers, a production Cloudflare login, or the original ChatGPT account to edit locally.

The source uses Vinext/Vite, React, TypeScript and a local emulated Cloudflare D1 database. It is not a plain static HTML site or a stock Next.js server. Dependency downloads require internet access. Local development on Windows was not tested in this export; give Codex any exact install/runtime error.

## Main files

- app/page.tsx — dashboard, catalogue, roll entry, usage, printer assignments and backups
- app/connections.tsx — NFC UID linking, USB serial reading and manual reading review
- app/globals.css — visual styling
- lib/stock.ts — inventory calculation and validation
- app/api/stock/route.ts — stock persistence endpoint
- public/scale/dloop_scale.ino — prototype ESP32 firmware
- public/scale/setup.md — proposed wiring/calibration instructions

## Your existing stock

Live cloud records, credentials, database files, node_modules, generated builds and Git internals are not included. In the live app choose Backup & help → Export backup. In your local app choose Restore backup. Importing replaces the local records. Export backups before replacing records or making major changes.
Local data lives in .wrangler/state, separately from the live app. Keep that folder or JSON backups if you want to retain local records. `init-local-db` only creates a missing table; it does not clear it.

## Checks

```powershell
npx --yes pnpm@11.25.0 exec tsc --noEmit
npx --yes pnpm@11.25.0 build
```

Source type checking and the hosted build passed before export. The added database bootstrap script passed JavaScript syntax checking. Windows install/start and physical USB/NFC were not verified.

## Hardware status

Phone NFC scanning is NOT implemented yet. Current NFC fields accept a manually entered UID or a USB JSON reading. The firmware is an uncompiled, physically untested ESP32 + HX711 + PN532 prototype. Direct Wi-Fi sync and automatic printer usage are not implemented. Nothing Phone scanning is planned; manual spool selection must always remain available. PN532 is optional future hardware, not a prerequisite for the planned phone workflow.

## Publishing

Local edits do not automatically update the hosted app. The existing .openai/hosting.json retains the original Site ID for provenance. Use the ChatGPT Sites publishing workflow for that Site, or ask Codex to prepare a separate hosting migration. Do not deploy a development server or local mock authentication publicly. A different host needs real access control and database configuration.

Paste CODEX-PROMPT.md into Codex to continue development.
