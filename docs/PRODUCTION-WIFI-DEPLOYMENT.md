# fila.dlts.in production Wi-Fi preparation

## Approval boundary and audit

Latest user instruction: **production deployment remains blocked**. Continue local QR/camera/Wi-Fi/API/database development without production credentials. Local implementation is ready for staging verification subject to the prerequisites below. Nothing in this checklist authorizes deployment, migration, device provisioning or flashing.

This is a local, review-only implementation. No website deployment, hosted database connection/migration, production credential change, firmware flash, local access-mode activation or studio restart has been performed. Do not treat compiled code or local simulations as a working hosted/radio installation.

Public HTTPS requests to `https://fila.dlts.in/`, `/api/v1/auth/session` and `/api/v1/scale-reading` were unreachable from this environment. This does not prove the host is down. PHP version/extensions, actual MySQL/MariaDB version/schema/users, HTTPS certificate chain and Apache/FPM routing are **not verified**. No hosted database was assumed empty or accessed. The selected local personal database is not the proposed hosted database.

Repository audit: existing React/Vite static deployment, hash NFC routing, PHP authenticated administrator sessions, secure/HttpOnly/SameSite cookies in production, CSRF/origin validation, prepared PDO queries, local-only bootstrap guards, checksum-tracked migrations 0000–0005 and explicit inventory review were reused. The former `/scale-reading` stub and radio-off USB firmware needed an authenticated Wi-Fi transport. Existing strict calibration/stability logic, D5/D6 wiring and browser-only 213.656 counts/g approximation are retained.

Local inspection found **no DLOOP_DB_PASSWORD environment variable**. A legacy device-token key exists in unrelated private local configuration; its value was not printed, reused, packaged or changed. Production secrets must be supplied privately, not guessed or copied from legacy credentials.

## Requirements to verify on hosting

- Maintained 64-bit PHP 8.2+ with PDO MySQL, JSON, sessions and writable private session storage. Prefer a currently maintained newer PHP branch where supported; see [PHP support lifecycle](https://www.php.net/supported-versions.php).
- MySQL 8.0.16+ or MariaDB 10.6+ with InnoDB, enforced CHECK constraints, transactions and GET_LOCK support. The existing PDO adapter refuses unsupported versions. Shared hosting database name/user supplied by the user: `dltsin_fila` / `dltsin_fila`; host assumed localhost in the template and must be confirmed.
- Trusted HTTPS for fila.dlts.in, correct hostname/chain, HTTP→HTTPS redirect and PHP receiving HTTPS=on or SERVER_PORT=443. The API does not trust arbitrary forwarded-protocol headers.
- Apache 2.4 rewrites: `/api/v1/*` routes to the PHP entry point before SPA fallback; errors return JSON rather than index.html. Authorization headers must reach PHP/FPM (`HTTP_AUTHORIZATION` or the server's trusted REDIRECT_HTTP_AUTHORIZATION). Test with a temporary approved device credential; do not enable header/body debug logging.
- Environment variable propagation to the PHP handler, private application directory outside **all** public roots, private sessions/backups and least-privilege runtime DB permissions. Do not publish phpinfo, .env, SQL dumps or migration/setup endpoints.

## New backend/device protocol

`POST /api/v1/device/scale-reading` requires verified HTTPS, explicitly enabled Wi-Fi ingestion and a device-specific random 256-bit bearer credential. It does not use browser CSRF/session cookies, and cannot mutate inventory or tag associations. Browser reads remain session/admin-protected at `GET /api/v1/scale-reading`; a device credential alone cannot read inventory.

Bounded JSON envelope:

```json
{"bootId":"32 lowercase hex characters","sentAtMs":1700000000000,"frame":{"v":1,"deviceId":"DLOOP-SCALE-01","seq":1,"grossG":null,"stable":false,"calibrated":false,"fault":"CALIBRATION_REQUIRED","live":{"raw":100000,"grams":null,"ageMs":0,"calibrated":false,"strictStable":false,"hold":0,"pending":0,"stage":"EMPTY","spike":false}}}
```

The timestamp above is illustrative, not a usable current upload. Upload clocks older than five seconds or over one second into the future are rejected. Current boot/sequence checks occur under a device row lock: duplicate/out-of-order packets and all previously seen retired boots are rejected. A new random boot ID permits a power cycle with sequence reset. Retired boot records are retained to prevent replay; only the latest reading is retained. Credential hashes, not plaintext tokens, are stored. Credential version changes immediately invalidate previous latest data.

Server receipt time is authoritative for online/offline (10 seconds). Preview freshness also includes device-reported sample age, the absolute send/receipt clock difference fixed at ingestion, server residence and conservative browser HTTP round-trip time. Future device clock skew cannot freeze or rejuvenate freshness. Older than 500 ms becomes unavailable, even while the device remains online. High shared-host latency can therefore reduce preview availability; it must not be hidden by widening stability/freshness gates. Wi-Fi packets are preview-only in this release, never verified inventory measurements.

## Additive migration and data preservation

New `0006_wifi_scale.sql` adds `scale_devices`, `scale_device_boots` and `scale_live_readings`; no existing rows/tables/columns are deleted or rewritten. It is pending on dloop_personal and not applied to production. Disposable fixtures now initialize seven migrations / twenty tables.

Before production changes, run the private read-only CLI:

```text
php bin/production-preflight.php
php bin/migrate.php --status
```

Review PHP/PDO compatibility, existing table/row counts, ledger checksums and any PLA_WHITE_01 match. If the live schema is untracked or differs from migrations, stop: the normal migrator refuses blind adoption of nonempty untracked databases. An explicit schema/data reconciliation plan is required. **Do not initialize, wipe, replace or import over the hosted database.**

The local personal spool is currently revision 7 / version 6, with initial 982 g, saved 83.13 g UNVERIFIED, provisional tare 193 g and existing NFC/assignment/history. No production data transfer is included in this package. If the hosted inventory differs, preserving this complete spool and history requires a separate approved merge/export/import plan with ID/code conflict review. Do not create another Numaker/spool or silently replace hosted records.

Production `migrate.php --apply` now refuses to run without a private backup manifest under the private backend's `var/backups/`. It must name the actual target database, a nonempty backup file beneath that directory, its verified SHA-256, and `restoreVerified: true`. The latter is an operator attestation of a successful isolated restore rehearsal, not something this tool claims to prove automatically. Required manifest shape:

```json
{"database":"dltsin_fila","backupFile":"/home/ACCOUNT/dloop-private/var/backups/pre-migration.sql","sha256":"REPLACE_WITH_COMPUTED_SHA256","restoreVerified":true}
```

Set private `DLOOP_BACKUP_MANIFEST` to that manifest path. With explicit approval, an operator then applies only pending compatible migrations with migration privileges. The runtime account does not need DDL/GRANT or inventory/history deletion rights. New runtime grants are SELECT/INSERT/UPDATE on the three device tables; give neither device clients nor browser code any DB credentials. Review existing inventory/auth grants separately. Keep the before/after checksum ledger and inventory counts.

## Production configuration without secrets in artifacts

`backend/config.production.example.php` resolves `DLOOP_DB_PASSWORD` and `DLOOP_APP_KEY` from private runtime environment variables and fails closed if absent. It fixes AUTHENTICATED mode, fila.dlts.in's HTTPS origin and the supplied DB name/user. It enables ingestion only when `DLOOP_WIFI_SCALE_ENABLED=1`. Never enable LOCAL_SINGLE_USER on public hosting.

Enter a password privately in a local PowerShell session when needed; this does not upload it or configure the hosting handler:

```powershell
$studioDbSecret = Read-Host 'Production database password' -AsSecureString
$env:DLOOP_DB_PASSWORD = [System.Net.NetworkCredential]::new('', $studioDbSecret).Password
# Run only approved private tooling; never echo the variable or environment.
# Remove it when finished:
Remove-Item Env:DLOOP_DB_PASSWORD
$studioDbSecret.Dispose()
```

Provision the corresponding private PHP-handler environment through the hosting provider's secure mechanism after approval. Do not put these variables in VITE_*, JavaScript, firmware, public .env/.htaccess, chat or committed files. If hosting cannot securely supply environment variables, deployment remains blocked until a reviewed private secret-loading mechanism is available.

## Artifact structure and deployment sequence

`npm.cmd run prepare:production` builds Vite and creates a checksum-manifested review tree under `outputs/production-fila-*/`:

```text
public/                 -> only this tree goes to fila.dlts.in's document root
  index.html assets/ .htaccess api/v1/index.php ...
private/                -> separate directory outside all document roots
  src/ bin/ migrations/ config.local.php var/sessions/ var/backups/
firmware/               -> review/build sources, NOT public hosting files
manifest.json DEPLOYMENT.md
```

The production entry point requires the private absolute `DLOOP_APP_DIR`, rather than guessing a public path. The private config uses environment lookups, not embedded credentials. Local databases, private local configs, device/Wi-Fi secrets, uploads, backups and compiled credential-bearing binaries are excluded. Never upload the whole artifact under public_html; only public/ belongs there.

After approval and verified backup: stage the private code and environment, inspect existing schema, apply only approved pending migrations, stage public assets/PHP entry/rewrite rules, verify anonymous/authenticated boundaries and inventory counts, then enable ingestion only after provisioning a device. Confirm the actual target/path, existing user ownership/login and TLS chain before cutover. Do not create/reset hosted administrators unnecessarily.

## Device credential lifecycle (operator-only)

After separate approval, run in the private backend with its approved config:

```text
php bin/device-credential.php --register DLOOP-SCALE-01 /PRIVATE/SESSION/DIR/device-token-new.env
php bin/device-credential.php --rotate DLOOP-SCALE-01 /PRIVATE/SESSION/DIR/device-token-rotated.env
php bin/device-credential.php --revoke DLOOP-SCALE-01
```

Register refuses an existing device. Register/rotate write the new credential exclusively to a new file inside the configured private session directory and never stdout; protect that file and remove it after private provisioning. Rotation invalidates the old token/latest data, and requires provisioning the new device token and rebooting to a new boot ID. Revocation immediately blocks ingestion and latest online status. These commands were exercised only on disposable fixture credentials, not production.

## ESP8266 build and hardware prerequisites

The existing `dloop_usb_scale` remains the radio-off default. Optional `firmware/dloop_wifi_scale/dloop_wifi_scale.ino` reuses the same sketch/filter/calibration implementation with a network macro. Pin mapping remains DT=D5, SCK=D6. Copy `wifi_private.example.h` to ignored `wifi_private.h` privately and supply SSID, Wi-Fi password, device-only token and the **independently verified CA PEM for the actual live host certificate chain**. No CA was guessed while the site was unreachable. Empty configuration disables network startup/uploads.

BearSSL verifies trust anchors, hostname and certificate time; there is no insecure fallback or HTTP redirect following. SNTP must supply usable time before HTTPS. See [ESP8266 BearSSL documentation](https://arduino-esp8266.readthedocs.io/en/3.0.0/esp8266wifi/bearssl-client-secure-class.html). Firmware buffers one latest frame, drops stale/failed uploads rather than retrying old weights, and uses bounded HTTP timeouts, reconnect backoff, eight attempts per cycle and a five-minute cooldown. It does not expose a web server or accept remote calibration commands.

Arduino CLI core 3.1.2 compile example (substitute CLI executable location):

```powershell
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 `
  --build-property "compiler.cpp.extra_flags=-I$($PWD.Path)/firmware/dloop_wifi_scale" `
  firmware/dloop_wifi_scale
```

The include flag is needed for the wrapper sketch's relative reuse. Compile with the actual private header only after it is configured; protect the resulting binary because it contains the device/Wi-Fi secrets. No real credential-bearing binary was produced in this task.

Local unconfigured compile passed: Wi-Fi RAM 50,728/80,192; IRAM 60,667/65,536; flash 384,624/1,048,576 bytes. USB regression compile passed: RAM 49,380; IRAM 60,355; flash 261,844. These numbers exclude dynamic TLS heap demand and cannot prove runtime reliability.

**Network timing risk:** ESP8266 HTTPS calls can block acquisition. The network variant enforces the existing 500 ms stale-window reset before accepting another conversion after a network pause; it never preserves a quiet hold across such a gap. No stability threshold is changed. TLS heap pressure, handshake latency, radio noise and strict calibration availability require real-device verification. Prefer the USB diagnostic path for calibration; Wi-Fi cannot issue calibration commands. Do not relax gates if network timing prevents qualification.

Flashing the Wi-Fi variant **will be required for actual Wi-Fi operation**, separately from the earlier frontend-only USB fix. No flash/upload command has been run. Confirm NodeMCU/COM3 and obtain explicit upload approval before flashing; preserve EEPROM and do not auto-zero or erase the chip.

## Frontend workflow

Wi-Fi Scale is primary; authenticated polling lives at Studio level so page navigation does not reconnect USB. USB diagnostic fallback remains explicit and is the working local option until network deployment is approved. The LOCAL_SINGLE_USER backend still refuses public device ingestion and never opens to LAN.

The selected existing spool, override/model/brand tare rules, live gross/remaining/percentage, saved balance separation and Review & Save Estimate are reused. Wi-Fi sends only raw/strict preview data; the browser keeps the 213.656 approximation and UNVERIFIED label. Manual confirmation stores source `live-preview-wifi` with timestamp, revision/version checks and no measurements row. No automatic inventory update occurs. Offline, stale, invalid, disconnected, mismatched baseline and unknown tare states remain unavailable. NFC/QR/manual opaque identity routing stays independent of transport.

## Verification and pending work

Automated local checks cover device authentication, HTTPS refusal, credential rotation/revocation, duplicate/out-of-order/retired boots, simulated power cycle, stale/offline data, unchanged inventory, Wi-Fi primary UI, explicit manual save source, navigation polling lifetime and USB fallback. Existing login/CSRF/authorization, inventory, parser, stability/protocol, identity and manual estimate tests remain required. Tests with simulated HTTPS metadata do not verify the real certificate/server or a radio link.

Before production approval: verify live PHP/MySQL/HTTPS/routing, inspect hosted schema/data read-only, reconcile inventory without duplication, obtain private environment credentials, confirm a tested backup/restore, validate real CA, stage deployment and review grants. Then separately approve deployment/migration, credential issuance and firmware flash.

On actual hardware/staging, test 2.4 GHz join/rejoin, wrong password/CA/hostname, clock unavailable, HTTP errors/timeouts, token wrong/rotated/revoked, power-off/boot IDs, replay/delayed packets, sample freshness under real shared-host latency, heap/watchdog stability, page navigation, 850−193=657 arithmetic, physical load/removal, explicit save/history, concurrent changes and existing NFC selection. No physical Wi-Fi, TLS-host or hosted-DB verification is claimed yet.

## Rollback

Retain a hashed pre-deployment public/private release and verified database backup outside public roots. If code fails before data writes, restore the previous public/private release and disable ingestion in private environment after approval. Additive device tables can remain unused; do not drop them or roll back inventory blindly. Revoke a compromised device credential immediately after approval. Firmware rollback requires separate flash approval and the prior known-good USB binary with EEPROM preserved. If inventory writes occurred after backup, reconcile them explicitly rather than restoring an old dump over newer history.

## Changed files

Backend: migration 0006, WifiScale.php, Api.php, Config.php, bootstrap.php, Inventory.php (manual Wi-Fi provenance), migration backup gate, device credential/preflight CLIs and production config template. Frontend: use-wifi-scale hook, lifecycle hook, scale controller/API types, Connections/Studio wiring, preview/remaining source types. Firmware: optional Wi-Fi wrapper/transport/example private header plus guarded hooks in the shared USB sketch; strict configuration headers untouched. Tests: Wi-Fi backend/UI, migration table expectations, device-token browser authorization check and explicit USB selection in the existing end-to-end test. Packaging: prepare-production script, package commands, ignored private-header rule and this checklist.

## Pre-staging corrections (2026-11-06)

Use `npm.cmd run prepare:staging` for staging and `prepare:production` for production. Both package all current migrations through 0007; validate the printed artifact with `scripts/check-production-artifact.mjs`. Historical outputs remain unchanged. New packages omit `public/scale` prototypes. The supported ESP8266 entry points are `firmware/dloop_usb_scale` and `firmware/dloop_wifi_scale`; the legacy public ESP8266 sketch is compile-blocked.

Effective tare for an existing spool is its individual override, then saved brand/model snapshot. Brand edits seed future spools and never silently alter existing tare or balances. Explicit spool editing remains the way to change its tare.

Wi-Fi serial diagnostics are numeric `#DEBUG WIFI` lines, at most once per five seconds and every 30 seconds when idle: free heap, fragmentation, largest block, numeric connection state/reconnect count, upload duration/result counters, uptime and reset reason. No SSID, endpoint, token, credentials or response body is logged. Synchronous HTTPS timing and the 500 ms freshness limit remain unchanged; real radio/TLS/heap behavior still needs approved hardware acceptance.
