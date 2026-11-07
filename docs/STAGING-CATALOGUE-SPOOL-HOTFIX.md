# Priority catalogue/spool hotfix (0000-0007 compatible)

No migration required or executed. Existing failed 0008 attempt remains a separate investigation. No production, hosting, credentials, firmware or database changes were made locally.

## Fixed

Existing catalogue products can be edited using pre-0008 columns: name, brand, material, colour name/hex, diameter, nozzle/bed settings, price and optional tare profile. Legacy products have no version column, so snapshots include an opaque editToken derived from the existing row. The backend locks/reloads the row and rejects a missing/stale token inside the existing inventory revision transaction. Modern active/version columns are used only when actually present on that row. Product changes never update linked physical spool snapshots or balances. Duplicate checks and brand/profile validation remain.

Spool archive/restore and safe dependency-checked deletion no longer depend on printer management metadata. Existing spool status/version columns are sufficient. Assigned spools still require explicit unload before archive. Add/edit forms retain their existing confirmation, saved tare snapshots, provisional status and manual balance checks. Metadata-only spool edits preserve last gross and measured status and do not insert a synthetic measurement. Historical ledger/QR/measurement rows are not deleted. Explicit balance/tare changes still use the normal correction flow.

Scale API, authentication, CSRF, WifiScale.php, device credentials, live reading tables and verified freshness/calibration boundaries are unchanged. Existing Add Spool Wi-Fi capture remains a manual draft workflow.

## Explicit limitations

Printer management and catalogue PRODUCT archive/restore still require migration 0008; product lifecycle controls are disabled with an explanation. This does not block catalogue editing or physical SPOOL archive/restore. No fake active/version fields are stored, no schema is modified and no ledger entries for 0008 are fabricated.

## Exact source changes

- backend/src/Inventory.php
- components/product-library.tsx
- app/page.tsx
- lib/inventory.ts
- backend/tests/mobile-management-offline.php
- backend/tests/catalogue-hotfix-offline.php
- scripts/check-catalogue-hotfix.mjs
- package.json
- docs/STAGING-CATALOGUE-SPOOL-HOTFIX.md

## Staging deployment only

Use the newly generated staging-priority-hotfix overlay, not the older v2.1 index/assets. Its manifest enumerates payload hashes and destinations. Upload/extract the ZIP into /home4/dltsin/fila-staging-private/var/releases/priority-hotfix/ outside all public roots. Keep staging maintenance enabled during copying. Preserve private rollback copies of the current Inventory.php and public index/assets.

1. Copy private/src/Inventory.php to /home4/dltsin/fila-staging-private/src/Inventory.php.
2. Copy public/assets/* to /home4/dltsin/public_html/staging-fila/assets/, retaining old hashed assets.
3. Copy public/index.html to /home4/dltsin/public_html/staging-fila/index.html LAST.
4. Do not replace config.local.php, secrets, .htaccess, API entry, migrations, bin tools, sessions, backups or firmware. No Cron or SQL import is needed.
5. Handle staging-specific PHP OPcache if enabled using the provider's supported method. Remove only the previously added staging maintenance block and hard-refresh the browser. Confirm catalogue editing and spool edit/archive controls are available. With approved disposable records test stale edit rejection, archive/restore, occupied spool rejection, manual assignment and Wi-Fi capture. Confirm existing QR access, balances/history and ESP8266 sync still work.

Rollback restores the previous Inventory.php and index as a matched pair while retaining assets/data. Do not restore an old database over later inventory changes. The overlay deploys no schemas, routing or configuration. All application mutations still require existing authorization/CSRF/idempotency/revision checks.

## Validation

Typecheck, frontend build/static verification, PHP lint/unit suite, existing dashboard/Wi-Fi/delayed estimate regressions and management tests passed locally. The new component tests and 110 offline service assertions exercise legacy catalogue edits, all editable fields/settings, stale/missing tokens, modern version conflicts, spool lifecycle and measurement preservation. PDO doubles make no connection. Actual staging persistence, permissions, physical devices and real database concurrent writers remain unverified.
