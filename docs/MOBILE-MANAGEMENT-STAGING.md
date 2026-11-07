# Mobile management: local implementation and staging requirements

No hosting, live database, production, firmware, credentials or deployed configuration changed. Migration 0008_mobile_management.sql is written but NOT executed, including in a disposable database.

## Behavior

Printer management uses the existing authenticated stock mutation endpoint, inventory revision lock, per-record versions and idempotency keys. Supports brand/model/nickname, single/multi-colour mode, 1-32 slots, edit/archive/restore and manual assignment. Single-colour requires one slot. Shrinking removes only unoccupied suffix slots; occupied suffix slots and occupied printer archiving fail. The original printer name/ID stays stable across edits so legacy kobra-1 and sparkx-1 through sparkx-4 keys and historical print references survive. New printers use printer-ID-N keys. Printer nicknames cannot conflict. Existing assignments are never migrated or automatically removed.

Spools have explicit edit, remove-from-printer, archive/restore and delete-unused actions. Confirmation is required for lifecycle operations; assigned spools cannot be archived until explicitly unloaded. Deletion discovers FK dependents from the schema, checks retained tag identity and spool activity details, and never cascades. Ordinary registered spools have ledger dependencies and cannot be deleted. Code sequence reservations remain. Activity and measurement rows and QR identifiers are never deleted.

Brands/profiles retain their existing edit forms and add explicit archive/restore/delete-unused actions. Products gain edit and archive/restore/delete-unused actions. Product identities cannot duplicate brand/name/material/colour combinations through the serialized API; existing pre-update duplicate rows are not rewritten. Brand/profile unique constraints remain. Editing defaults does not rewrite saved physical-spool tare snapshots. Numaker uses its stored default; no 180 g substitution or new hard-coded tare is introduced, and no saved tare is upgraded to verified automatically.

Add Spool can subscribe to the existing authenticated Wi-Fi controller. No new transport or polling endpoint is introduced. The operator acknowledges an empty platform, sets browser-only tare, then explicitly accepts a usable numeric observation within five seconds. Source/connection/age/gross/tare/net and UNVERIFIED status are displayed. Remaining is computed in hundredths after one gross-minus-spool-tare subtraction. Existing entered mass remains until explicit replacement acceptance. Brand/profile/override changes invalidate capture; the backend rechecks draft arithmetic against the effective saved tare at registration.

Starting mass is an independent required input; neither gross nor remaining fills it automatically. A captured estimate is a draft, not an inventory record. Normal final review/confirmation creates the spool. Accepted captures may be retained while completing the form: their original timestamp is preserved and registration labels them a historical accepted draft, not a fresh/verified scale measurement. The backend forces manual provenance, measured=false and no measurement insert. Existing 500 ms verified gates, 5-second capture window, existing-spool manual confirmation windows and firmware remain unchanged. Offline, unusable, expired and reconnected observations cannot be accepted without the appropriate new baseline. Edits to captured mass/tare clear its machine-generated provenance.

Management forms have touch-sized controls, narrow-screen single-column forms and spool cards. Existing QR-based access and managed QR lifecycle are retained.

## Exact authored files for this update

- backend/src/Inventory.php
- backend/migrations/0008_mobile_management.sql
- lib/inventory.ts
- app/page.tsx
- app/globals.css
- components/printer-library.tsx
- components/product-library.tsx
- components/record-actions.tsx
- components/add-spool-wifi.tsx
- components/filament-dialog.tsx
- components/brand-library.tsx
- backend/tests/mobile-management-offline.php
- scripts/check-mobile-management.mjs
- package.json
- docs/MOBILE-MANAGEMENT-STAGING.md

Build outputs and synthetic test fixture directories are generated verification artifacts, not additional source changes or deployable configurations.

## Migration and future staging deployment

0008 adds printer metadata/state/version and product state/version, and seeds legacy printer metadata without changing IDs/names/slot rows/spool assignments. No inventory mass, tare, QR, measurement or ledger record is rewritten. Existing configured slot counts are retained, including Kobra's single slot and SparkX's four CFS slots. Management controls fail closed while migration is pending; existing assignment reads retain old keys.

After separate explicit approval: verify staging identity and source-path isolation; privately back up staging files and database with a tested rollback plan; inspect existing schema/checksum ledger and duplicate/conflicting identities; review and apply only the pending staging migration with a migration account. Do not run a production migration or change production grants. Deploy the matching Inventory.php and rebuilt frontend as a compatible release into the confirmed staging-only paths. Keep the existing reviewed Wi-Fi profile, credentials, private loader and source-path separation. No firmware upload, new device token, calibration or app-key rotation is needed.

The staging runtime needs normal SELECT/INSERT/UPDATE access to printers, printer_slots, catalogue_products and existing ledger/idempotency tables. Slot shrinking needs DELETE on printer_slots. Optional safe deletion needs DELETE on the relevant inventory/reference table; absence of those grants leaves deletion unavailable. Never grant DELETE on activity, measurements or managed QR tables, or DDL/GRANT privileges to runtime. Metadata dependency discovery uses information_schema for the selected database. Review least-privilege staging grants separately; none were changed here.

Rollback after new printer/product records exist must preserve the updated data: an old frontend cannot represent custom printer slots. Prefer reverting the UI/runtime as a matched compatible release with management disabled, leaving additive schema intact. Do not drop new columns, delete custom printers or restore an old database over newer inventory. Review a data-preserving rollback before deployment.

## Verification and limits

New tests exercise real components in jsdom and real PHP service methods against a no-connection PDO double: exact mass arithmetic, independent initial mass, manual registration without measurement rows, unchanged saved tare snapshots, consent, stale/offline windows, legacy slots, dependency guards, stale versions/revisions, rollback, unauthenticated access and CSRF origin/token rejection. Existing dashboard, delayed Wi-Fi, Wi-Fi UI, tare/freshness and staging configuration regression tests are also run, plus PHP lint/unit tests, typecheck and build/static verification.

No database migration was executed. Actual MySQL/MariaDB migration execution, FK metadata visibility/permissions, concurrent database writers, hosted persistence, phone camera access and real-device/mobile-browser layout remain unverified. The PDO double does not establish database integration. Existing 78.99 g staging persistence/history must still be independently reconciled read-only. No production readiness is claimed.
