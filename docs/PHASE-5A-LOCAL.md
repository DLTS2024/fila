# Phase 5A local simulator, tests and rollback

Baseline: c762c9a / phase4-inventory-verified. No software installation is needed;
the existing XAMPP PHP/MariaDB and npm dependencies are used.

## Run the retained disposable test environment

Terminal 1 from the repository root:

```powershell
$env:DLOOP_CONFIG_FILE = Get-Content backend/var/phase5a/active-config.txt -Raw
& 'C:\xampp\php\php.exe' -S 127.0.0.1:8000 -t backend/public backend/router.php
```

Terminal 2:

```powershell
$env:DLOOP_API_PROXY = 'http://127.0.0.1:8000'
npm.cmd run dev -- --port 5173 --strictPort
```

Open http://127.0.0.1:5173. Disposable login: phase35-proxy@example.invalid,
password Fixture-only-password-123!. These are public test credentials only;
do not use them for real inventory or production. Use your own private studio
config/admin for normal operation. No existing Phase 4 database was migrated.

Open NFC & scale → select a test spool manually → Simulator (no hardware) → Start
scale simulator. You can toggle stability, calibration, fault and pause, or inject
a custom JSON line while the simulator is active. Pausing for over five seconds
demonstrates stale detection. To recover from a sequence reset or custom high
sequence, disconnect/reconnect. No NFC UID or physical board is needed.

Review scale measurement freezes a preview. The acknowledgement explicitly says
simulated data will update the selected record. Use disposable records only when
confirming a simulator measurement. Manual gross entry is independent of USB.

For real USB, Connect USB prompts the browser's COM selector at 115200 baud.
The current Wi-Fi firmware cannot supply valid v1 measurements; its diagnostic
output is rejected. Do not flash or calibrate it as part of this phase. See
USB-SCALE-PROTOCOL.md for frame requirements and physical verification limits.

## Repeatable tests

No hardware/database is required for parser and component safety tests:

```powershell
npm.cmd run test:scale
npm.cmd run test:scale:ui
npm.cmd run typecheck
npm.cmd run test:stock
npm.cmd run test:api
npm.cmd run test:ui
$env:DLOOP_PHP = 'C:\xampp\php\php.exe'
npm.cmd run test:php
npm.cmd run build
```

Database tests require a NEW empty local database named dloop_test_p4_p5a_<suffix>,
a dedicated user granted only that DB, a private config/random app key and private
session directory. Set DLOOP_CONFIG_FILE to that config; initialize fixtures with
backend/tests/database.php --initialize-disposable. There are still only the four
existing migrations. Start PHP and Vite using that same config as above.

With DLOOP_PHP and DLOOP_CONFIG_FILE set, run in order:

```powershell
$env:DLOOP_DISPOSABLE_TEST = 'yes'
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
$env:DLOOP_TEST_URL = 'http://127.0.0.1:8000'
npm.cmd run test:scale:api
$env:DLOOP_TEST_URL = 'http://127.0.0.1:5173'
npm.cmd run test:scale:live
& $env:DLOOP_PHP backend/tests/scale-ledger.php
```

The Phase 4 ledger expects its original four measurements, so run it BEFORE scale
tests add their confirmed fixtures. The live UI test uses jsdom with real HTTP,
not a real Chromium layout engine or COM dialog. It intentionally loses a server
acknowledgement and retries after five seconds, proving the old committed sample
is not applied twice. Scale API tests include synthetic usb metadata; this is not
a claim that physical hardware was tested. Repeat full suites on a new test DB,
never by clearing records/throttle evidence in an existing DB.

Evidence is under ignored backend/var/phase5a. The existing regression scripts
also write their usual private Phase 4 test-summary artifacts. Credentials/session
files, runtime helpers and artifacts stay outside Git and the public root.

## Rollback and retained data

Disconnect the browser port/simulator and stop verification-only PHP/Vite servers.
Recover source from phase4-inventory-verified into a NEW empty folder, preserving
the current checkout/config first. There are no Phase 5A migrations to downgrade.
Source rollback does not undo explicit measurement confirmations; history remains
in MySQL. Use the validated inventory undo flow when applicable, or a separately
authorized database restore, rather than deleting history or dropping databases.

All verification used new disposable DBs; the original Phase 4 DB, D1 and firmware
remain unchanged. Test DBs/users/configs/evidence are retained for inspection.
No automatic DROP/DELETE/credential cleanup or production deployment is performed.
