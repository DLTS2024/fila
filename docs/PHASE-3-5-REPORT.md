# Phase 3.5 — Local MySQL/MariaDB integration verification

Verified 30 October 2026. Starting checkpoint: f3e3abe / phase3-php-foundation.

## Environment and isolation

- XAMPP is installed at C:\xampp. Its Apache and MariaDB processes were already
  running before testing; they were not installed, started, stopped or reconfigured.
- PHP: C:\xampp\php\php.exe, version 8.5.12. PDO MySQL, mysqlnd, session, JSON,
  hash, filter and the other required modules are enabled. PHP/MySQL are not on PATH.
- Database client: C:\xampp\mysql\bin\mysql.exe. Connected server: MariaDB
  10.11.16, loopback 127.0.0.1:3306. Connectivity/version checks succeeded.
- No software or packages were installed. No production credentials/config were used.
- A NEW disposable database was created: dloop_test_20261030_040001_9eec66.
  Provisioning used XAMPP's local development root account over loopback only;
  the application/tests use a new randomly credentialed, dedicated local DB user.
  SHOW GRANTS was inspected without printing hashes/secrets: the test user has
  no global privileges and grants only on this disposable database.
- Private test config, sessions, provisioning helper and metadata evidence live
  under ignored backend/var/phase35/. No credential is included in this report.

## Executed results

| Verification | Result |
| --- | --- |
| All three SQL migrations applied to an empty disposable DB | PASS |
| Migration --status and repeat --apply | PASS: already applied; no reset/recreation |
| Schema version tracking | PASS: exactly 3 ledger entries, source SHA-256 checksums match |
| Metadata verification | PASS: 101 assertions; exact 16-table set, all InnoDB |
| Foreign keys | PASS: all 16 declared FK names, columns and referenced targets match |
| Indexes | PASS: all 18 named indexes, ordered columns and uniqueness match; primary keys present on all tables |
| CHECK constraints | PASS: all 15 declared constraints present |
| Mass columns | PASS: all 12 declared mass fields are DECIMAL(10,2) |
| UTC connection | PASS: session time_zone = +00:00 |
| Invalid fixture writes | PASS: 9 duplicate, negative/over-capacity, orphan-FK, gross-below-tare, invalid NFC and assignment uniqueness rejection checks |
| First administrator CLI setup | PASS: first invocation succeeds, repeat invocation is rejected, initialization marker is closed |
| Public setup access | PASS: CLI setup paths and API setup return 404; no HTTP installer exists |
| Direct PHP database-backed auth suite | PASS: valid/invalid login, session persistence, session/CSRF rotation, authenticated reads, filters, injection literal, logout, unauthorized access and throttle 429 |
| Vite-proxied database-backed auth suite | PASS with independent test identity: login/read/session persistence, CSRF missing/stale/hostile-Origin rejection, logout, old-cookie replay rejection, unauthorized access and throttle 429 |
| Direct and proxied anonymous/security HTTP suites | PASS: cookies, fixation rejection, unauthorized reads, CSRF/origin, JSON types/size/content type and method errors |
| Private path denial | PASS: Vite returns 403 for backend source/private config |
| PHP syntax and 21 validation/password checks | PASS using XAMPP PHP 8.5.12 |
| Frontend typecheck, inventory, API-client and seven-view component tests | PASS |
| Frontend build/static validation | PASS: 8 static files, no Node/Vinext/Workers/D1 runtime |
| D1/firmware integrity | PASS: all 15 saved SHA-256 hashes unchanged |

The schema metadata test was run before and after repeating migration application.
No production database was created. No existing DB was reset, dropped or imported.
Both login suites reached their account throttle, preserving the evidence rather
than deleting/expiring buckets. An independent second fixture account enabled the
full proxy suite without clearing the direct-test throttle evidence. Both fixture
users are test-only and use the documented public fixture password.

The direct auth suite passed before the extra missing-token/hostile-origin logout
and old-cookie replay assertions were added. The expanded suite passed through
Vite against the same backend/database. No separate re-run of the expanded suite
directly on port 8000 is claimed.

## Evidence, changes and repeatability

- Added backend/tests/schema.php: read-only metadata/checksum/UTC verification,
  guarded to local dloop_test_ databases.
- Updated backend/tests/database.php: seeds an independent proxy fixture user.
- Updated backend/tests/auth-database.mjs: optional example.invalid fixture email,
  explicit logout CSRF/origin checks and old-cookie replay rejection.
- Updated docs/PHP-LOCAL-SETUP.md with installed XAMPP paths and exact commands.
- Added this report. No application API, SQL migration, UI, inventory rule or
  firmware source changes were required for the successful MariaDB verification.

Private retained artifacts: backend/var/phase35/config.local.php, metadata.json,
schema-evidence.json and session files. The evidence includes migration versions,
checksums/timestamps, table/FK/index metadata and throttle attempts/window times;
it does not contain passwords, session tokens or raw throttle identifiers.

See PHP-LOCAL-SETUP.md for commands. Required dependencies are now satisfied;
no installation is needed. Use explicit XAMPP executable paths rather than
changing global PATH or relying on the old portable PHP runtime. For a new test
run, use a new empty dloop_test_ database or wait for the documented throttle
window. Do not run fixture initialization against retained nonempty databases.

## Limits, cleanup and Phase 4 gate

The migration/database-authentication gate passes on local MariaDB 10.11.16 with
PHP 8.5.12. Phase 4 was NOT started. MySQL 8 and cPanel's actual PHP/Apache/TLS
configuration remain untested; local MariaDB results do not establish production
compatibility with every supported engine/version. Real-browser rendering and
physical USB/NFC hardware were not tested in this phase.

The verification-only PHP/Vite servers were stopped after tests; pre-existing
XAMPP Apache/MariaDB remain running. The disposable DB/user, private config and
evidence are retained for inspection. No automatic DROP, DELETE or credential
cleanup is performed. Their eventual removal is a separate explicit operation.

Rollback affects only the test/documentation changes: recover source from
phase3-php-foundation into a separate folder if needed. Do not reset D1, erase
firmware, or drop databases as a source rollback. Existing recovery tags and
private backups remain available.
