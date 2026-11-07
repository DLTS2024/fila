# Live spool inventory workflow verification

5 November 2026. The user reports live weight now works on the real ESP8266/HX711. This task verified the remaining frontend-to-database workflow using a new disposable database and simulated serial input. It did not operate COM3, write production inventory, change calibration/security or restart studio services.

## Completed verification

The existing implementation already performs the required workflow; it was reused. New integration coverage renders the actual authenticated React application and uses real PHP API and MariaDB persistence, with a mocked Web Serial port supplying uncalibrated live raw samples. No successful database save is inferred merely from a callback spy.

1. Selects existing fixture code PLA_WHITE_01 through the frontend code form, without registering another spool.
2. Confirms empty-platform gross semantics and raw preview baseline. Live gross 850 g minus provisional tare 193 g displays **657 g / 65.7%** automatically, while saved balance remains **982 g** until approval. The existing unit/scale integration tests also cover 1175−193=982 g. No 43 g cover adjustment occurs.
3. Opening Review & Save Estimate and checking the approval box each cause zero inventory requests. Only clicking the final confirmation posts the frozen manual-estimate action.
4. Confirms the real backend persists 657 g as **manual UNVERIFIED**, with source and captured timestamp, measured=false and no measurement row. Initial balance 982 g, tare 193 g, provisional flag and number of spools remain unchanged.
5. Confirms the normal post-save stock refresh immediately updates the displayed saved balance to 657 g, and Activity displays the new manual-estimate correction and provenance.
6. Opens another review, disconnects and reconnects: the old confirmation stays disabled, no request is sent, and the new connection requires the appropriate raw/gross confirmation. Switching away and back clears the old review and waits for a fresh sample.
7. Pauses the serial stream: remaining becomes unavailable after expiry, with zero saves. Resuming data does not auto-save.
8. Advances the disposable inventory revision through another authenticated request, then confirms the frozen review. Backend returns 409, rejecting the stale overwrite. The successful 657 g balance remains unchanged.
9. Confirms no calibration/serial commands were sent during the complete scenario. Manual, phone-token and optional hardware UID identification continue resolving the same existing spool record.

The first test run completed its save but a later helper toggled an already-checked baseline off. The helper now checks checkbox state before clicking. The full sequence and a repeat through the reusable runner pass on fresh disposable fixtures. No functional save-flow changes were needed; the only production UI edit normalizes the UNVERIFIED badge separator to plain text.

## Current personal inventory — read-only observation

Do not assume the original 982 g remains the current saved balance. The personal database now reports:

| Field | Observed value |
|---|---|
| Code | PLA_WHITE_01 |
| Inventory revision / spool version | 7 / 6 |
| Initial balance | 982 g |
| Current saved balance | **83.13 g, UNVERIFIED** |
| Effective tare | 193 g, provisional |
| Measured flag / measured gross | false / null |
| Recorded correction | Gross 276.13 g − tare 193 g = 83.13 g |
| Provenance | live-preview-usb, captured 2026-11-05T17:17:22.620Z |

This correction is already in personal activity history. It was observed, not created by these tests. No attempt was made to restore 982 g or overwrite 83.13 g. All mutation tests enforce the disposable database prefix; the personal configuration was used only by the read-only inspection helper. Existing NFC association and printer assignments were preserved.

## Tests run

- Production build/typecheck/static artifact checks: PASS.
- New `test:scale:inventory-e2e`: PASS, real application/API/database with simulated serial data.
- Disposable database migration/constraint initialization and 17 backend manual-estimate safety checks: PASS.
- `test:scale:remaining`, `test:scale:ui`, `test:scale:usb-diagnostics`, `test:firmware`, `test:local:policy`, `test:spool:identity`, `test:scale:unverified`: PASS.
- `git diff --check`: PASS.

End-to-end runner prerequisites: a **fresh** disposable `dloop_test_local_mode_*` database initialized with `backend/tests/database.php --initialize-disposable`, its private config selected by `DLOOP_CONFIG_FILE`, and `DLOOP_DISPOSABLE_TEST=yes`. Run `npm.cmd run test:scale:inventory-e2e`. The runner prepares a fixture through existing domain mutations, starts a temporary loopback PHP server on dedicated port 8120, executes the test, verifies persistence, and stops only that temporary process. It does not restart the actual studio. Re-running requires a fresh fixture because preparation deliberately refuses an existing Numaker fixture. Never point fixture setup/tests at dloop_personal or phase5a.

## Remaining real-hardware checks

- With the cover physically excluded, confirm the scale was zeroed on the empty platform, then place the actual selected spool. Check live gross − 193 g, displayed units and percentage against an independent weighing result. The factor and provisional tare remain unverified; arithmetic correctness does not prove physical accuracy.
- Check that saved balance shows the current 83.13 g separately from the changing live estimate. Confirm whether that recorded correction is intended before approving any further personal inventory update. Do not silently restore the old 982 g.
- Open Review & Save Estimate and inspect the frozen spool code, gross, tare, result and timestamp. Cancel to test without writing. An actual production save requires the user's explicit approval of that proposed value. No production save was performed in this task.
- Physical unplug/reconnect and load response remain device checks; automated tests already cover their application state transitions. Phone-to-PC access still requires the separately approved authenticated HTTPS setup, and physical PN532 tests wait for hardware. These remain identification paths, never automatic weight-saving paths.

## Changed files

- `scripts/check-live-estimate-e2e.mjs`: real application/API integration with mock serial and safety assertions.
- `scripts/run-live-estimate-e2e.mjs`: guarded disposable fixture runner and temporary test-server cleanup.
- `backend/tests/live-estimate-e2e.php`: guarded fixture preparation and persisted-record verification.
- `package.json`: new test command.
- `components/live-remaining-filament.tsx`: badge separator text only.
- This report.

No migration, firmware, calibration factor, stability threshold, access configuration or production record was changed by this task.
