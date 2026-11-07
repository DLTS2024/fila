# Phase 9 — combined verification

Completed locally on 2026-11-06. No Phase 10 or 11 work was started.

## Harness failure and fix

The original stock snapshot interceptor used `!options.method`. The real API client explicitly sends `method: 'GET'`, so successful stock responses never populated `snapshot`. Accessing `snapshot.state` then threw a TypeError. That earlier run is not a pass.

`scripts/check-qr-wifi-inventory-e2e.mjs` now normalizes the method with `(options.method ?? 'GET').toUpperCase()`, captures only successful GET stock responses, and asserts their revision/spool response contract. Application assertions remain intact. The expanded conflict test also explicitly rescans the QR after Reload stock: reloading intentionally remounts the page and clears the selected spool. It must not reuse an implicit selection.

## Current result: PASS

The successful run used the existing isolated database `dloop_test_local_mode_20261105_200245_f4170c`, its existing Numaker brand and one existing UNUSED fixture label. New disposable spool: `PLA_WHITE_05`; revision 11 → 15.

- Scanned an UNUSED label; explicit registration created one spool and bound that label in the same inventory operation.
- Rescanned the assigned label and resolved that exact spool, without another registration.
- Real PHP session login succeeded; anonymous scale-reading access returned 401 and authenticated access succeeded.
- Simulated Wi-Fi preview at the authenticated browser API boundary supplied fresh uncalibrated raw data. The UI calculated 850 − 193 = 657 g and 65.7%, keeping the saved 982 g separate until confirmation.
- Review alone and acknowledgement alone sent no save. Explicit confirmation saved a manual UNVERIFIED estimate with Wi-Fi source/timestamp, correct spool, one history event and one revision increment. No calibrated measurement was created.
- Reassigning the QR returned 409 `qr_not_unused`; complete stock/history/revision stayed unchanged.
- Stale data and network disconnect invalidated the review and blocked saves; recovery did not automatically save.
- Two requests using the same inventory revision/spool version produced one success and one 409 conflict, one revision/history increment, and the winning value only. The temporary PHP server serializes requests; this checks optimistic conflicts, not simultaneous SQL threads. Earlier multi-process race evidence is retained.
- A successful database commit with a simulated lost HTTP response was explicitly retried with identical body/key. It produced no second history/revision increment.

Machine-readable successful evidence: `test-results/phase9-qr-wifi.json`. Failed diagnostic attempts consumed only existing disposable labels and left their fixture records in place; they are not counted as passed or deleted.

## Targeted regression results

Passed Wi-Fi transport and UI checks, including original packet receipt age, stale/offline clearing, reconnect acknowledgement, navigation and no calibration commands. Passed remaining-filament calculation/UI checks: 657/982 g, tare precedence, unknown tare, non-finite/negative/implausible values, empty platform, switching, confirmation and revision conflicts. `git diff --check` passed. Polling tests emitted non-failing React act warnings; assertions were not suppressed.

Previously successful migration, QR generation/printing, device-authentication and broader backend suites were reused, not rerun. No production/staging build or deployment was performed.

## Preservation

Read-only before/after fingerprints of the personal inventory, brands, tare profiles, spool history, revision, NFC associations, measurements and entire QR registry matched. The original printing PDF SHA-256 matched. All original 100 personal QR labels remain UNUSED; PLA_WHITE_01 is unchanged. Fixture migration/label/measurement counts also matched across the successful run; only one existing fixture UNUSED label was assigned. No schema setup, migration, QR generation, credential change, firmware change or service restart occurred. Only a temporary loopback test PHP process was started and stopped.

## Reproduce

Use an already prepared disposable fixture with existing Numaker brand, fixture administrator and UNUSED labels. In PowerShell set `DLOOP_DISPOSABLE_TEST=yes` and `DLOOP_CONFIG_FILE` to its private configuration path, then run `npm.cmd run test:phase9`. The runner rejects non-fixture database names and does not initialize schema or generate labels. It consumes one existing fixture label per registration attempt; never point it at personal or production data.

## Remaining verification and staging readiness

No application defect was identified by these checks. Software is ready for approval-controlled staging verification, subject to the existing Phase 8 checklist and credentials/backup/preflight gates. This is not a deployment approval or a claim of live device transport validation.

Still requires real phone camera/printed-label scanning over authenticated HTTPS, phone-to-PC identification, actual ESP8266 verified TLS/device-auth uploads, power cycling and Wi-Fi loss/recovery, and real load/zero response. The combined run used jsdom UI events and simulated Wi-Fi frames; it did not use a physical camera, NFC tag, radio or TLS handshake. Accepted calibration and automatic-inventory safety requirements remain unchanged. No staging/production deployment or firmware flashing was performed.
