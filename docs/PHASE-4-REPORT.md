# Phase 4 — Complete filament inventory management

Baseline: 716c4ec / phase3-5-mysql-verified. Verified locally on 30 October 2026
with XAMPP PHP 8.5.12, PDO MySQL and MariaDB 10.11.16. No software was installed.

## Delivered behavior

- Authenticated login/logout and cookie-session restoration wrap the existing
  seven React views. No browser-local inventory substitute or fake save exists.
- Catalogue includes a brand/profile library: create, edit, list, deactivate,
  multiple physical spool types, verified defaults and per-spool overrides.
- Registration handles sealed and partially used physical spools, known initial
  mass, manual remaining mass or gross-minus-tare. Nominal label capacity is not
  assumed to equal actual fill. Forms begin with blank actual masses and require
  a frozen review plus explicit confirmation before any inventory request.
- UUIDs remain internal identities. Transactionally allocated immutable codes
  use material/colour prefixes and locked sequence rows. Existing and archived
  codes are skipped and never reused by the application.
- Existing-spool updates show previous/proposed/difference, preserve a physical
  tare snapshot, support explicit adoption of changed profile defaults, and save
  absolute corrections rather than extra print consumption. Library search
  includes code, name, brand, material and colour. Archived records remain visible
  through Include archived and can be explicitly restored through the update form.
- Overview has active physical count, remaining grams/kg, counts/masses by material,
  brand and colour, low/empty alerts and recent activity. Archived count is separate
  in the API. Existing printer cards retain one Kobra slot/four SPARKX CFS slots.
- Registration, gross measurements, manual corrections, tare changes, print usage,
  assignments, metadata and undo append actor history with before/after balances.
  Grouped print usage/overdraw and latest-active-entry undo rules are preserved.
  Activity supports server pagination; measured evidence/history is not erased.
- All writes use one InnoDB transaction with authorization, CSRF, strict validation,
  global revision and affected-record version checks, idempotency and prepared SQL.
  Failed multi-spool usage rolls back completely. The UI preserves ambiguous retry
  keys and blocks stale dialogs after reloading a conflict.

Migration 0003 adds brand/profile active/version fields, physical tare snapshots,
registration metadata, stable event ordering, the studio revision lock and the
two fixed printers/five slots. It revises the old label-capacity CHECK so a known
overfilled spool can be registered without pretending its label is its actual mass.
Old migration files were not rewritten; version/checksum tracking remains active.

## Exact verification results

Final clean run database: dloop_test_p4_20261030_045258_19ee10. It was newly created
with a dedicated random local DB user scoped only to that DB. Prior verification
runs are retained, not dropped/reset. The Phase 3.5 DB and all production resources
were untouched. The active config path is kept in ignored
backend/var/phase4/active-config.txt; credentials remain in private run directories.

| Executed check | Result |
| --- | --- |
| Fresh migration + fixture verification | PASS: all 4 migrations, first-admin setup and rerun guard, 9 invalid-write constraint checks |
| Schema metadata before/after workflows | PASS: 120 assertions; 17 InnoDB tables, 16 FKs, 19 named indexes, 20 CHECK constraints, 13 DECIMAL mass columns, checksums and UTC |
| Existing database-backed auth suite | PASS: login/logout, sessions, CSRF, authorization, reads, validation and throttle 429 |
| Existing anonymous/security HTTP suite | PASS: cookies/fixation, unauthorized reads, CSRF/origin, JSON/types/size and method handling |
| Inventory HTTP workflows | PASS: 68 checked requests/statuses plus balance, profile, code, history, pagination and dashboard assertions |
| Registration/measurement retries | PASS: matching retries do not add a spool, measurement or history event; different payload with the same key conflicts |
| Concurrent allocation | PASS: 6 independent PHP/PDO workers produce PETG_RACE_01 through PETG_RACE_06 with no duplicates |
| Concurrent updates | PASS: two writers with the same revision/version yield statuses 200 and 409; exactly one balance/version change |
| Concurrent identical retries | PASS: both callers receive 200; exactly one spool is registered |
| Live React → Vite → PHP → MariaDB | PASS in jsdom: login/restoration, seven views, explicit registration review, a lost committed response retried with the same key, gross correction, external conflict/reload protection and logout |
| Read-only final ledger | PASS: 16 assertions; 41 committed revisions = 41 compact idempotency rows, exactly 4 measurements, 43 actor events and 14 retained physical spool records |
| PHP syntax and validation/password tests | PASS: all backend PHP files; 21 existing unit checks |
| Frontend typecheck, inventory rules, API client, seven-view component tests | PASS |
| Frontend production build | PASS: 8 static files; no server bundle or Node/Vinext/Workers/D1 runtime |
| D1/firmware integrity | PASS: all 15 protected SHA-256 hashes unchanged |
| lib/stock.ts inventory rules | PASS: byte-for-byte unchanged from original private backup |

The HTTP suite tests 998.50 g sealed registration on a nominal 1 kg label, 1005 g
independently known fill, 900−230=670 g partial registration, 900−220=680 g reweigh,
explicit 250 g profile adoption without automatic balance change, grouped print
deduction/undo, full rollback, archival code retention and dashboard group totals.

The UI test discards a registration response and simulates a gateway 503 after a
measurement, only AFTER the real server commits. It then
verifies the exact body/key is retried and one spool exists. It also commits a
separate external edit before the UI saves its stale preview and verifies a 409,
reload warning and disabled stale confirmation. No mocked successful inventory
response was substituted in this live integration test.

Private evidence: backend/var/phase4/http-results.json, concurrency-results.json,
ui-results.json and ledger-results.json. These include counts/statuses and test
record IDs, not credentials/session cookies. No destructive database cleanup was
performed. Verification-only PHP/Vite servers were stopped after checking; the
pre-existing XAMPP services remain available.

## Limits and deployment implications

- MariaDB 10.11.16/PHP 8.5.12 is tested. MySQL 8, other PHP versions, Apache/cPanel
  routing, actual production TLS/cookies and hosting permissions are not tested.
  The migration selects the appropriate CHECK-drop syntax for MySQL/MariaDB.
- UI integration tests use jsdom and real HTTP, not a real browser render/layout
  engine. Responsive CSS/branding is preserved with additive form styles, but
  desktop/mobile visual QA remains necessary before deployment.
- ESP8266 firmware, calibration and serial protocol were not changed or flashed.
  Existing NFC linking/manual measurement review remains; Wi-Fi ingress and an
  ESP8266 USB protocol are deferred. Scale polling explicitly returns no reading.
  There is no automatic inventory reconciliation or printer telemetry.
- JSON export is the loaded-state V2 review copy. Legacy JSON/D1 import/restore is
  intentionally disabled pending the migration phase; no old records are deleted.
  Use a proper MySQL backup for disaster recovery and full measurement retention.
- The UI snapshot supports up to 5,000 physical spools/latest 50,000 events, with
  the existing Activity view showing 500; older history is available via the
  paginated activity API. This small-studio design serializes writes with one
  revision row, so unrelated concurrent edits can require review/retry.
- Codes use ASCII material/colour slugs. Names may contain other UTF-8 text, but
  material/colour need at least one ASCII letter/digit to allocate a readable code.
- CSRF/session authorization and exact decimal arithmetic are implemented; MFA,
  password recovery, additional-admin UI, automatic key/throttle pruning and
  unattended backups remain outside this phase. No new production account/DB
  or deployment has been created.

See PHASE-4-API.md for contracts/invariants, PHASE-4-LOCAL.md for run/test commands
and source/data rollback, and PHASE-4-CHANGED-FILES.md for the full path list.
