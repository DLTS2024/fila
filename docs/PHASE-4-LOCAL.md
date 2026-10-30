# Phase 4 local run, verification and rollback

## Run the retained disposable verification environment

XAMPP PHP 8.5.12 and MariaDB 10.11.16 are already installed. No new software or
package installation was performed. Start XAMPP MySQL if it is stopped; Apache
is not required for these local commands. PHP and MySQL are not on global PATH.

Terminal 1, from the repository root:

```powershell
$php = 'C:\xampp\php\php.exe'
$env:DLOOP_CONFIG_FILE = Get-Content backend/var/phase4/active-config.txt -Raw
& $php backend/bin/migrate.php --status
& $php -S 127.0.0.1:8000 -t backend/public backend/router.php
```

Terminal 2:

```powershell
$env:DLOOP_API_PROXY = 'http://127.0.0.1:8000'
npm.cmd run dev -- --port 5173 --strictPort
```

Open http://127.0.0.1:5173. The disposable identities are
`phase3-test@example.invalid` and `phase35-proxy@example.invalid`, password
`Fixture-only-password-123!`. These are public fixture credentials, ONLY for
this isolated test DB. The auth suite intentionally throttles the first account
for 15 minutes; the second account was used for workflow/UI verification.
Never use these users/passwords for real inventory or production.

The active-config pointer references an ignored private config in a unique test
run directory. It does not contain a production connection. Never upload or commit
backend/var, config.local.php, sessions, backups or database credentials.

## Set up a separate real local studio

Use the private configuration and first-admin instructions in PHP-LOCAL-SETUP.md,
with a NEW, dedicated empty local database and scoped DB user. Apply the four
migrations through the private CLI, then create your own administrator through
backend/bin/create-admin.ps1. Do not point setup at the retained test database or
reuse public fixture credentials. The real app starts with no invented brands,
empty-spool weights or spools: create brands and verified profiles in Catalogue,
then register each physical spool. A physical tare override is always available.

## Executable checks

```powershell
$env:DLOOP_PHP = 'C:\xampp\php\php.exe'
npm.cmd run test:php
npm.cmd run typecheck
npm.cmd run test:stock
npm.cmd run test:api
npm.cmd run test:ui
npm.cmd run build
```

For database integration, manually provision a NEW empty `dloop_test_p4_...` DB
and a dedicated user with grants only on it, using the Phase 3.5 approach. Copy
backend/config.example.php to a private config for that DB; supply a random key
and private session directory. Do not reuse/reset an existing run to make tests
pass. No test script drops a DB or clears its records.

```powershell
$env:DLOOP_CONFIG_FILE = 'C:\private\new-test-run\config.local.php'
$env:DLOOP_DISPOSABLE_TEST = 'yes'
& $env:DLOOP_PHP backend/tests/database.php --initialize-disposable
& $env:DLOOP_PHP backend/tests/schema.php
```

Start PHP with that SAME config and Vite with the proxy as above, then run in this
order (the workflow requires revision 0; concurrency requires no prior RACE spools):

```powershell
Remove-Item Env:DLOOP_TEST_EMAIL -ErrorAction SilentlyContinue
$env:DLOOP_TEST_URL = 'http://127.0.0.1:8000'
node backend/tests/auth-database.mjs
node backend/tests/http.mjs
npm.cmd run test:inventory:http
npm.cmd run test:inventory:concurrency
$env:DLOOP_TEST_EMAIL = 'phase35-proxy@example.invalid'
$env:DLOOP_TEST_URL = 'http://127.0.0.1:5173'
npm.cmd run test:inventory:ui
& $env:DLOOP_PHP backend/tests/inventory-ledger.php
& $env:DLOOP_PHP backend/tests/schema.php
```

The HTTP suite and fixture account target loopback only. Concurrency uses six
independent PHP CLI processes/PDO connections to test real database locks, not
just parallel requests to PHP's single-threaded development server. The live UI
test uses jsdom components with real Vite/PHP/MariaDB HTTP and a cookie jar. It
deliberately discards one response AFTER the server commits and verifies the
same key is retried without a duplicate spool. It is not a browser layout test.
Tests retain fixtures, throttle history, session files and evidence in the test
DB and ignored backend/var/phase4. Repeated full suites require a new test DB.

## Rollback

The source baseline is 716c4ec / phase3-5-mysql-verified. Export that tag into a
NEW empty folder to review/recover Phase 3.5 source; preserve the current checkout
and private configuration first. Do not use git clean/reset as a data-recovery
procedure. Source rollback does not reverse SQL schema or inventory mutations.

All Phase 4 verification used new disposable databases. Existing Phase 3.5 DB,
D1 files, firmware and private original backups were not migrated or modified.
The new schema is not automatically downgraded: migration DDL implicitly commits.
Keep the new DB for inspection; any eventual DB/user removal or database restore
is a separate explicit operation. There is no automatic destructive rollback.

Before a future non-test upgrade, take a consistent MySQL backup and inspect the
target and migration plan. Do not apply Phase 4 to a live database without that
backup and deployment instruction. cPanel public/private layout stays as documented
in CPANEL-PHP-DEPLOYMENT.md; runtime DB grants must now include reviewed inventory
INSERT/UPDATE plus NFC association DELETE, while excluding schema modification,
user creation and spool/history deletion.
