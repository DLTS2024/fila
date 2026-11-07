# Phase 10 — hardware verification preparation

Status: PREPARED, physical tests NOT RUN. Phase 9 PASS is reused; no successful suite, migration or QR generation was repeated. No deployment, service restart, credentials change, inventory write or flash was performed. Stop before Phase 11.

## Readiness audit

| Item | Evidence / status |
| --- | --- |
| Local preparation | No production password needed. Staging template requires separate staging environment values, database and authenticated HTTPS origin. No fallback to production credentials. |
| Device authentication | `WifiScale.php` requires opt-in, HTTPS and a 64-hex device bearer token; stores SHA-256, checks device enablement, boot/sequence and credential version. Device ingestion cannot write inventory. Browser reads require an authenticated session. Local single-user mode refuses ingestion. Actual staging provisioning remains unverified. |
| TLS | `wifi_transport.h` sets BearSSL trust anchors and certificate time; no insecure fallback; HTTPS only, redirects disabled. Empty CA/token/SSID disables startup. Actual staging chain and hostname must be independently checked. The example endpoint is production: explicitly replace it with the approved staging endpoint in the private header. |
| Firmware | Wi-Fi wrapper reuses the USB sketch and strict gates. Latest-only queue, 500 ms expiry, bounded retries/timeouts. Eight reconnect attempts then five-minute cooldown; allow this delay in recovery testing. SNTP time required. |
| Safety | Browser-only 213.656 counts/g remains UNVERIFIED. Tare confirmation, single spool-tare subtraction, explicit save, version/revision protection, stale rejection and strict calibration are preserved. Network delays reset stale strict windows. No remote calibration command path. |
| Rollback | USB source and compiled images exist. `work/live-preview-upload-verification.json` records prior COM3/nodemcuv2 upload verification and actual v1 preview frames. `work/usb-production-regression-build/dloop_usb_scale.ino.bin` exists, but is a regression build, not proven identical to that earlier upload. Identify and hash the exact known-good uploaded image before flashing; retain board/flash settings and source/build metadata privately. If provenance cannot be established, rollback verification is a blocker. |
| Scanner | Secure-context camera requirement, rear-camera preference, manual fallback; permission errors handled; cancellation/unmount/hidden-page stop streams and invalidate pending results. Real Android permission/camera behavior is pending. |
| Runtime metrics | Firmware currently logs no free-heap, fragmentation, maximum free block or upload-duration/status metrics. Prior compile RAM/IRAM figures do not establish TLS runtime safety. Approve a separate diagnostic-only staging build for bounded nonsecret metrics before claiming these checks pass. No such firmware change made here. |

## Staging prerequisites and approval boundary

1. Supply a distinct staging HTTPS hostname and dedicated staging database/login. Do not use `fila.dlts.in`, `dltsin_fila`, `dloop_personal` or the phase5a database. Keep the passwordless localhost service loopback-only; do not tunnel or bind it to LAN.
2. Review actual hosting PHP/PDO/MySQL compatibility, certificate chain, API-first routing, Authorization forwarding, secure sessions/CSRF, private config/session paths, least-privilege grants and environment propagation. Use the Phase 8 checklist. Do not assume an existing staging DB is empty. Require backup/checksum/isolated restore before approved schema changes; do not reapply completed migrations.
3. Use `backend/config.staging.example.php` privately with staging-only environment values. Leave ingestion disabled until approved provisioning. Keep secrets out of chat, VITE variables, logs and artifacts. Do not change an existing account or token without specific approval.
4. After deployment/provisioning approval, prepare a small staging-only batch of fresh identities and printed labels in the isolated staging registry. Mark them STAGING TEST, record their batch/label IDs and initial UNUSED state. Do not scan, transfer, regenerate or consume the personal 100-label batch. Do not reuse production IDs. Label issuance is a separate database-write approval.
5. Establish authenticated phone login and a staging-only device token. Store its private provisioning file only under the configured protected session directory. Verify device cannot read stock and anonymous users cannot read scale/stock. Never log Authorization headers.

No live staging origin or approved deployment target is established by this audit. These prerequisites are pending, not passed.

## Android phone procedure — only after approved staging setup

1. In Android Chrome open the exact approved HTTPS staging origin, check the hostname/certificate, sign in and verify it is the staging database. Record starting stock revision and the dedicated label ID. Confirm this is not a personal/production label.
2. Open Add spool (Add Filament), then Start QR camera. First deny camera permission: confirm an error and manual input fallback, no spool or QR mutation. Re-enable camera in site settings.
3. Start camera and cancel via Stop QR camera. Check camera indicator turns off. Test navigating away and backgrounding the page as well. Return, restart camera and allow access.
4. Scan the dedicated UNUSED staging QR. Confirm UNUSED status; scanning alone must not create or bind anything. Enter a clearly disposable spool name, nominal capacity and a staging-only 193 g UNVERIFIED brand tare; do not edit Numaker or PLA_WHITE_01 in the personal database. Review and explicitly confirm this staging record only.
5. Record the resulting spool ID/code, label association, revision and history event. Rescan the same label on NFC & Scale. Confirm the identical spool ID/code opens and counts/revision remain unchanged.
6. Open Add spool and scan that assigned label again. Expect an already-assigned rejection; do not bypass it. Check no duplicate record, assignment, balance or revision change. Existing Phase 9 evidence separately verifies server-side rejection even if a client bypasses this UI.
7. Try manual code selection of that same spool and compare identity. Record permission/cancel results and exact pass/fail evidence without photographing tokens or credentials.

## ESP8266 prerequisites — approval required before upload

- Confirm physical NodeMCU ESP-12E, D5=DT / D6=SCK, same mounting/power/cables. Re-detect COM port; prior COM3 is historical, not current proof. Close browser serial and Serial Monitor only when ready to flash.
- Confirm board `esp8266:esp8266:nodemcuv2`, installed core/build settings and CLI path (CLI was not found on PATH in this audit). Retain the proven USB rollback binary/hash and original flash layout. Do not erase the full chip or calibration EEPROM.
- Privately configure ignored `firmware/dloop_wifi_scale/wifi_private.h`: staging endpoint, 2.4 GHz SSID/password, staging device-only token and independently verified CA PEM. Never use database credentials. Confirm `.gitignore` excludes this header and binaries; protect secret-bearing build outputs outside deployment/public trees.
- Build and review the configured Wi-Fi image, compile report, target, hash and rollback image before requesting upload approval. Existing unconfigured builds are previous evidence, not a configured-image verification. Any runtime telemetry addition requires source review/build before approval.
- Request explicit approval naming device, current COM port, board, image hash and staging destination. No upload command is authorized by this document. A later USB rollback flash also needs approval.

## Real device test sequence and acceptance evidence

1. After approved flash, start with an empty platform. Confirm 2.4 GHz join, usable SNTP time, authenticated POST success and fresh real raw v1 data at the staging API. Verify actual TLS chain/hostname validation; negative CA/hostname/clock tests require an approved diagnostic setup, never `setInsecure` or disabling verification.
2. Confirm fresh UNVERIFIED preview in the phone/PC UI. Acknowledge empty-platform gross baseline only when it is actually tared. Select the disposable staging spool. Compare gross minus effective tare once, percentage and saved/live separation. Unknown tare and gross below tare must be unavailable/errors, not saved zero. No cover adjustment unless explicitly configured and physically applicable.
3. Add/remove a reference load and record raw, gross, net, receipt age and response time. Arithmetic examples 850−193=657 and 1175−193=982 are software targets, not evidence of physical accuracy or accepted calibration.
4. Measure upload duration, server sample age, browser round-trip and time to visible load change (median/max and stale proportion). The preview must become unavailable beyond 500 ms; online status alone is not freshness. Do not widen gates if TLS/shared-host latency makes it unusable.
5. Record free heap, largest free block, fragmentation, upload failures and reset/watchdog reason across repeated TLS uploads/reconnects in a bounded supervised session. These metrics are presently blocked by absent telemetry. Record actual minimums/trends; unexplained resets, memory decline or unusable sample cadence fail readiness.
6. Turn only the scale power off: preview becomes stale within its 500 ms gate; API online becomes false after 10 seconds since last receipt (plus polling delay). Existing saved inventory/history must remain unchanged. Power on: new boot ID/sequence accepted; old boot replay remains rejected; baseline acknowledgement required again.
7. Test Wi-Fi loss/recovery using a dedicated test AP if possible; do not change shared network credentials. Observe retry/cooldown and new fresh data. A frozen review must remain invalid after recovery and must never save automatically. Navigate between pages to verify polling survives without USB.
8. On the disposable staging spool only, review an estimate: no save until checkbox plus explicit confirmation. After user approves this test save, verify manual UNVERIFIED source/timestamp, correct spool ID, one history/revision update and no calibrated measurement. Test disconnect while reviewing, rescan/switch and concurrent-change rejection without touching real inventory. Stop if a wrong spool or silent save is observed.
9. If Wi-Fi fails acceptance, request USB rollback approval; flash the identified known-good radio-off USB image with EEPROM preserved. Reopen serial at 115200, confirm device ID/v1 fresh preview and load/removal behavior. Rollback must not issue ZERO/CAL/VERIFY/ACCEPT, erase calibration or alter inventory.

## Results to date

Completed: source/config/scanner audit and preparation; Phase 9 software PASS reused (real disposable PHP/MySQL plus simulated Wi-Fi). Physical phone, staging-host TLS, actual device authentication, radio uploads/reconnect, latency, heap, power-cycle and physical rollback are all PENDING. No new hardware pass is claimed.

Next decision: approve a specific separate staging target and bounded staging provisioning/deployment plan first. Device credential issuance, staging-only label creation and diagnostic telemetry must be explicitly included or remain blocked. Firmware flashing requires a second approval after configured image/rollback review. Production remains blocked.

Pre-staging update (2026-11-06): Wi-Fi runtime numeric metrics are now implemented in `wifi_transport.h`; the earlier missing-metrics finding above is historical. Local compilation does not establish runtime heap/TLS safety. See `PRE-STAGING-FIXES.md`. Physical tests remain NOT RUN.
