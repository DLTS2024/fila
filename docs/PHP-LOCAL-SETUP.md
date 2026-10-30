# Windows PHP + MySQL/MariaDB local setup

## Tools and private configuration

Install a maintained PHP 8.x version (minimum 8.2) from the official Windows PHP
distribution and MySQL 8.0.16+ or MariaDB 10.6+. Enable `pdo_mysql` in php.ini.
Confirm `php -v`, `php -m`, and the server version. PHP's built-in server is local
development only. No global Node backend or Cloudflare tools are needed.

```powershell
Copy-Item backend/config.example.php backend/config.local.php
New-Item -ItemType Directory -Force backend/var/sessions
php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
```

Edit the ignored config.local.php locally: use a fresh app_key, absolute private
session path, environment=local, correct DB connection fields and exact browser
origins (`http://127.0.0.1:5173` / `http://localhost:5173`). Keep the PHP file UTF-8
without BOM or closing tag. Never emit output from configuration, commit secrets,
use VITE_ variables for credentials or run the project directory as a web root.
Private configuration and session storage are rejected if inside the web root.

Create a NEW empty local database manually through your MySQL administrator tool,
for example `dloop_v2_local`, using utf8mb4/utf8mb4_unicode_ci. Create a dedicated
local user with privileges on this database only; enter its password in the private
config. Do not select an existing application/D1 database. No CREATE DATABASE or
DROP statement is automatically run by the application or migration tool.

## Migrations and first administrator

```powershell
php backend/bin/migrate.php --status
# Review the target configuration and back up any existing MySQL data first:
php backend/bin/migrate.php --apply
./backend/bin/create-admin.ps1
```

The PowerShell helper prompts for the password securely and passes JSON through
stdin, not process arguments/history. On another shell, feed the same JSON via
a trusted password manager/secure input helper into `php backend/bin/create-admin.php`.
Never paste a real password into a command line or create an HTTP setup page.

The migration runner takes a MySQL advisory lock, records SHA-256 checksums and
refuses a nonempty DB without a migration ledger. Only --apply changes schema.
DDL implicitly commits: if it fails partway, stop and inspect that disposable
database; do not reset it or rerun blind. There are no automatic down migrations.

First-admin setup uses a row lock and transaction on installation_state plus a
users check. Once initialized it remains closed even if users later disappear.
It has no web route and all bin files refuse non-CLI execution. Account recovery
and additional-admin management are not implemented in this phase.

## Start locally

Terminal 1:

```powershell
php -S 127.0.0.1:8000 -t backend/public backend/router.php
```

Terminal 2:

```powershell
$env:DLOOP_API_PROXY = 'http://127.0.0.1:8000'
npm.cmd run dev -- --port 5173 --strictPort
```

Use one configured browser origin consistently. The Vite proxy preserves /api/v1
paths and browser Origin; it does not expose the DB config. The React screens are
preserved but not yet connected to normalized API reads or an auth form. Test
the new API with an API client/cookie jar. See PHP-API.md for login/CSRF flow.

Optional override: set DLOOP_CONFIG_FILE to an absolute private config path.
DLOOP_APP_DIR is for deployments that separate the public entry from backend code.

## Tests

```powershell
Get-ChildItem backend -Recurse -Filter *.php | ForEach-Object { php -l $_.FullName; if ($LASTEXITCODE) { throw 'Syntax error' } }
php backend/tests/unit.php
npm.cmd run test:php:http
npm.cmd run typecheck
npm.cmd run test:stock
npm.cmd run test:api
npm.cmd run test:ui
npm.cmd run build
```

HTTP tests use loopback port 8000 and test anonymous/unauthorized behavior, without
validating a real DB login. Run them with the local server above. On a machine
where the DB is intentionally absent, DLOOP_EXPECT_DATABASE_UNAVAILABLE=yes adds
a safe-error response check. Do not enable that assertion with an available DB.

For database verification, manually create a fresh EMPTY DB named
`dloop_test_<unique_suffix>`. Make a separate ignored config.local.php outside
the public root and set DLOOP_CONFIG_FILE to it. Ensure PDO MySQL is enabled in
php.ini, including subprocesses. Never point these tests at real inventory.

```powershell
$env:DLOOP_CONFIG_FILE = 'C:\private\dloop-test\config.local.php'
php backend/tests/database.php --initialize-disposable
```

This explicitly creates the 16 tables, test admin and fixtures, checks enforced
unique/FK/CHECK constraints, and retains everything in the disposable DB. It refuses
nonempty/non-test/remote databases and never drops or clears a DB. Next start a
separate local PHP server with that SAME test config (stop your other test server
first), then:

```powershell
$env:DLOOP_DISPOSABLE_TEST = 'yes'
npm.cmd run test:php:auth
```

The fixture credentials are public test-only strings. This test checks successful
login/logout, session/CSRF rotation, reads, filters, SQL injection treated as a
literal and database-backed throttling. It consumes login quotas, so reruns may
need a new test DB or expiration of the 15-minute throttle window. Restore your
normal configuration environment after testing. Test DB removal is a separate
manual decision, not part of these scripts.
