# Pre-staging software fixes ? 2026-11-06

All five software fixes implemented locally. No deployment or hardware approval is implied.

## Files changed in this pass

- `scripts/prepare-production.mjs`: explicit --staging mode, approved staging target guard, production default retained, staging config selection, all eight migrations required, legacy public firmware excluded, environment/template manifest metadata.
- `scripts/check-production-artifact.mjs`: verify every file checksum, manifest coverage, current migrations, exact config template/target, and absence of public legacy firmware.
- `package.json`: prepare:staging command.
- `lib/scale/remaining-filament.ts`: override then saved snapshot; brand defaults seed new spools only.
- `backend/src/Inventory.php`: shared saved-tare resolver for API display and manual estimates; no migration/data rewrite.
- `scripts/check-remaining-filament.mjs`: changed/removed brand default and unknown-snapshot regressions.
- `backend/tests/tare-snapshot.php`: database-free backend tare regressions.
- `backend/tests/manual-estimate.php`: update disposable integration expectation to preserve saved snapshot after brand-default removal (not executed this pass).
- `public/scale/esp8266_wifi_sync.ino`: explicit compile error identifying archived incompatible prototype; original source retained below guard.
- `public/scale/setup.md`: archive warning and supported firmware selection.
- `firmware/dloop_wifi_scale/wifi_transport.h`: bounded numeric diagnostics, upload outcomes/duration, heap/fragmentation/largest block, reconnect count/status, uptime/reset reason. At most one metrics line per five seconds; periodic 30-second idle reports. Existing acquisition, calibration, stability, TLS trust and freshness gates retained.
- `scripts/check-prestaging.mjs`: packaging refusal, diagnostic source guards and legacy compile-block checks.
- `docs/STAGING-PROVISIONING-PLAN.md`, `docs/QR-STAGING-READINESS.md`, `docs/PRODUCTION-WIFI-DEPLOYMENT.md`, `docs/PHASE-10-HARDWARE-VERIFICATION.md`: corrected packaging, firmware selection, tare rule and diagnostics guidance.
- This report.

## Verification

Passed production build/typecheck/static checks; PHP syntax and 21 database-free unit checks; backend saved-tare regression; remaining-filament arithmetic/UI; Wi-Fi transport/UI; actual QR encode/decode and simulated camera UI; preprinted QR registration payload/UI; 101 firmware protocol/source checks; pre-staging diagnostic/source and packaging refusal guards. Initial new source-guard test had an incorrect text boundary and passed after correcting the test.

NodeMCU ESP8266 core 3.1.2 local compilations passed: Wi-Fi RAM 50,916/80,192 bytes, IRAM 60,667/65,536; USB RAM 49,380/80,192, IRAM 60,355/65,536. No flash command ran. These are compile figures, not runtime TLS heap evidence.

Final review-only packages:

- `outputs/staging-fila-2026-11-06T01-55-50-807Z`
- `outputs/production-fila-2026-11-06T01-55-51-196Z`

Each passed 57 file SHA-256 checks, exact template matching, migration completeness through 0007, authenticated layout and private-material checks. All pre-existing historical release packages remain unchanged. Earlier packages created during this pass are intermediate artifacts; use only the final paths above for review.

## Preservation and remaining work

No database connection, migration execution, QR generation/assignment, inventory write, credential change, hosting/service action, deployment or flash was performed. PLA_WHITE_01, its 83.13 g saved balance and the 100 existing UNUSED labels were not accessed or modified. This pass does not claim an independent live database before/after fingerprint; preservation follows from running no database operations. No database-backed integration suite was rerun; Phase 9 evidence is retained.

Ready for approval-controlled staging provisioning and verification. Real Android camera/printed-label checks, hosting compatibility, verified TLS radio uploads, reconnection/power-cycle and runtime heap/latency acceptance remain pending. Synchronous TLS can still pause acquisition; the existing fail-closed freshness/stability gates remain unchanged. IRAM is 92% used in both compiles. Production readiness is not established.

STOP: await approval before any hosting or hardware operations.
