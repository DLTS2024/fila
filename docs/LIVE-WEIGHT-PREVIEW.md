# Live Weight Preview

Implemented in the existing dashboard's **NFC & scale** page, using the existing Web Serial connection, v1 protocol and explicit inventory review/API. No additional diagnostic capture is needed. This change is compiled and component-tested; it has not been flashed or deployed and does not establish physical mass accuracy.

## Display behavior

The firmware now runs a separate five-sample median followed by an exponential smoother (alpha 0.4). The median excludes up to two extreme samples in a five-sample window; the recorded adjacent -8131/3817471 pattern is included in a shared-C++ regression. A sustained step becomes the median majority on its third conversion, so the display does not remain anchored at the old load. Startup and recovery require five fresh samples. At nominal 10 accepted samples/second, the display follows a sustained step within approximately one second; actual latency requires hardware measurement.

A display-only spike indicator compares the latest raw sample with the median using max(400 counts, 8*local MAD). This is an observability rule for the preview, not a change to any strict threshold. Median/EMA output never supplies `rawStats`, `RawStability::Hold`, strict calibration, approximate calibration or measurement gross. Three or more corrupted values in the median window can still move the preview; it is not a fault detector or permission to save inventory.

Before accepted **strict** calibration, only signed raw counts are shown. There is no assumed counts/gram factor, default calibration or clamp to zero. Candidate CAL/VERIFY grams in legacy measurement frames are hidden while calibrated=false. After strict acceptance (or loading an existing valid accepted strict record), the filtered raw value is converted using that record and labelled **CALIBRATED DISPLAY PREVIEW**. Its visual steadiness does not mean strict stability. Approximate-mode calibration does not unlock the new preview's grams display.

The UI shows strict hold/pending and device-reported calibration stage independently of the smoothed value. Preview age combines device sample age and host receipt age; data older than 500 ms is hidden and cannot be tared or used for a calibration command. Invalid frames and disconnects clear preview state. Sensor faults reset the preview buffer when the existing raw-window reset path runs. Ordinary short-window trend failures do not erase the display filter.

## Manual tare

**Tare preview display** requires a user checkbox and a fresh sample. It subtracts the explicitly selected display baseline in the current units (counts before calibration, grams after strict calibration). It is session-local and clears on reconnect, calibration-state changes and calibration commands. **Clear display tare** restores the gross preview.

Display tare does not send a zero command, change `platformOffset`, modify EEPROM, change the selected spool's saved tare, or alter inventory gross. Strict **ZERO EMPTY** remains a separate, explicitly confirmed calibration operation.

## Guided strict calibration

Open **Guided verified-reference calibration**. The UI advances only from device-reported state, never merely from sending a command:

1. If needed, explicitly select strict mode. This never accepts the approximate calibration slot.
2. Remove all load, confirm the empty platform, wait for strict hold and send **ZERO EMPTY**. Existing fresh/quiet/hold/storage-invalidation checks remain mandatory.
3. Place an independently known 50–5000 g reference, wait for strict hold, enter its actual mass and confirm **CAL**. The existing strict gram-domain and factor validity checks remain mandatory.
4. Replace it with a different independently known mass, differing by at least max(20 g, 10% of the fitting reference). Wait for strict hold and confirm **VERIFY**. The firmware's existing error tolerance remains mandatory; verification does not refit the factor.
5. Leave the verification reference untouched and explicitly confirm **ACCEPT**. The firmware rechecks freshness, stability and reference agreement, then commits the checked record. Storage failure does not approve calibration.

If strict stability cannot be reached, this guide remains blocked. The preview solves display availability, not the demonstrated hold starvation. A 10 kg load cell does not raise the existing firmware's 5000 g guarded gross/calibration limit. No mass, factor or successful reference check is fabricated. Recalibration from DONE explicitly requires an empty platform and invalidates the prior strict record.

The browser sends only allowlisted strict calibration commands, only from explicit controls on a fresh compatible USB session. It sends none on connection. Commands immediately invalidate any inventory reading and rotate its review identity; an old frozen confirmation cannot survive a calibration command. Arbitrary strings, diagnostic commands, approximate calibration commands and command injection are rejected by this path.

## Inventory boundary and API compatibility

The `live` object is an optional extension on existing v1 status/measurement frames. Existing top-level `grossG`, `stable`, `calibrated`, fault, sequence and identity semantics remain authoritative. Older firmware remains usable for legacy measurements but supplies no new live preview. Older strict dashboard parsers will reject the extension, so ship the updated UI with the firmware.

The parser validates bounded values, exact preview fields, fresh-data nullability and calibration consistency. Preview metadata is retained separately in connection state and is never copied into the API's `ScaleReading`/measurement payload. No new API or database field is needed. The existing backend rejects uncalibrated, unstable and expired measurement contexts and requires explicit confirmation/idempotency. No incoming frame automatically updates inventory. The frontend additionally blocks review/confirmation once an available preview's sensor age exceeds 500 ms; legacy frames retain the existing five-second receipt-age contract.

Fixed firmware protocol buffers increase from 256 to 512 bytes for the extension. A worst-case frame-size regression passes; parser framing remains bounded at 1024 bytes. The preview stream uses the existing 250 ms emission cadence and does not enable diagnostic tracing.

## Verification performed

- ESP8266 NodeMCU compile-only build with the installed core/libraries: PASS. Existing HX711 library `expansion-to-defined` portability warnings remain; no new compile errors. Shared C++ assertions include startup/gap reset, recorded-pattern isolated spikes, sustained load and removal response and signed raw behavior, alongside existing strict/approximate/diagnostic tests.
- Build footprint: RAM 49380/80192, instruction RAM including cache 60355/65536, flash code 261844/1048576 bytes. No upload was performed.
- `npm.cmd run build`: PASS (TypeScript, Vite and static output verification).
- `node scripts/check-live-preview.mjs`: PASS, 24 preview protocol/transport/freshness/command-isolation/buffer checks.
- `node scripts/check-scale-ui.mjs`: PASS, existing inventory review tests plus new raw-only display, acknowledged local tare, strict-gated ZERO/CAL/VERIFY/ACCEPT sequence, candidate-grams hiding, unstable calibrated preview and stale display tests. This is jsdom component verification, not browser visual QA or physical hardware.
- Existing parser/connection/simulator 154 checks, firmware formatter/parser/source 101 checks, diagnostic 21 checks, approximate protocol and approximate calibration integration/source checks: PASS.
- No database, inventory, calibration storage or production deployment writes were made by tests. No physical calibration/accuracy result is claimed.

## Exact files changed for this implementation

Earlier investigation and approximate-calibration changes were already present in the working tree; they were preserved. This implementation changed/added only:

- `firmware/dloop_usb_scale/live_preview.h` (new filter)
- `firmware/dloop_usb_scale/live_preview_self_test.cpp` (new shared-C++ regressions)
- `firmware/dloop_usb_scale/dloop_usb_scale.ino` (parallel observation and optional preview/status extension)
- `firmware/dloop_usb_scale/sampling_diagnostics.h` (bounded protocol queue capacity)
- `lib/scale/protocol.ts` (separate validated live extension)
- `lib/scale/serial.ts` (preview state, freshness and allowlisted command writes)
- `hooks/use-serial-scale.ts` (receipt-time display updates)
- `app/live-weight-preview.tsx` (new live display, local tare and calibration guide)
- `app/connections.tsx` (dashboard integration and review protections)
- `scripts/check-live-preview.mjs` (new safety regressions)
- `scripts/check-scale-ui.mjs` (component and guided-command coverage)
- `package.json` (`test:scale:preview` entry)
- `docs/LIVE-WEIGHT-PREVIEW.md` (this implementation/verification record)

`raw_stability.h`, production numerical thresholds, calibration acceptance code, API and backend were not changed by this implementation.

## Remaining hardware verification

After reviewing and deliberately uploading the new sketch and serving the updated dashboard:

1. Confirm raw-count preview on uncalibrated hardware and no automatic zero/grams assumption at boot. Check median startup and response to ordinary loading/removal without long frozen plateaus.
2. Check that the known anomalous samples are visually suppressed while the strict hold still resets. Do not inject electrical faults into powered wiring merely to reproduce a spike.
3. Exercise local tare/clear, disconnect/reconnect, stale samples and sensor faults. Verify display tare never changes gross inventory review or saved spool tare.
4. Perform the guided empty/known-mass/different-reference/ACCEPT sequence only with genuine references. If hold starvation persists, record the blocked step; do not relax gates. Check failed reference, interrupted VERIFY and storage-error handling where safely testable.
5. Independently check zero return, repeated placements and several relevant masses after acceptance and after reboot. A stable display and compile success do not certify accuracy.
6. With an explicitly designated test spool, verify unstable/uncalibrated/stale states cannot produce a save and that a fresh strict measurement still requires review and acknowledgement. Verify calibration commands invalidate an open review. Confirm physical Web Serial writes, browser layout and responsiveness on the target PC.

No recurring diagnostic-capture workflow is required to use the preview. Additional hardware work is for acceptance of this implementation, not a prerequisite for implementing the display feature.
