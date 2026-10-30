# Phase 4 changed files

Relative to 716c4ec / phase3-5-mysql-verified. A = added; M = modified.

```text
M	CODEX-PROMPT.md
M	README.md
M	START-HERE.md
A	app/authenticated-studio.tsx
M	app/connections.tsx
M	app/globals.css
M	app/page.tsx
M	backend/README.md
A	backend/migrations/0003_inventory_management.sql
M	backend/src/Api.php
M	backend/src/Database.php
A	backend/src/Inventory.php
M	backend/src/Validation.php
M	backend/src/bootstrap.php
M	backend/tests/database.php
A	backend/tests/inventory-concurrency.mjs
A	backend/tests/inventory-http.mjs
A	backend/tests/inventory-ledger.php
A	backend/tests/inventory-worker.php
M	backend/tests/schema.php
A	components/brand-library.tsx
A	components/filament-dialog.tsx
A	components/inventory-summary.tsx
M	docs/API-CONTRACT.md
M	docs/CPANEL-PHP-DEPLOYMENT.md
A	docs/PHASE-4-API.md
A	docs/PHASE-4-LOCAL.md
A	docs/PHASE-4-REPORT.md
M	docs/PHP-API.md
M	docs/PHP-LOCAL-SETUP.md
M	lib/api.ts
A	lib/inventory.ts
M	package.json
A	scripts/check-inventory-ui.mjs
M	scripts/check-ui.mjs
M	src/main.tsx
A	docs/PHASE-4-CHANGED-FILES.md
```

Local-only ignored artifacts: disposable DB credentials/run configs, session files,
active-config pointer, test provisioning helper and JSON verification evidence
under backend/var/phase4/, plus regenerated dist/ assets. These are not included
in the commit and must not be uploaded as source/deployment artifacts.

The original lib/stock.ts rules, legacy D1 code/data, firmware, private headers,
existing migrations 0000?0002 and original recovery backups are unchanged.
Phase 4 adds migration 0003 and retains all new disposable verification DBs.
