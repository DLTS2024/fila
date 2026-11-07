# USB preview connection diagnosis

## Evidence and limits

The checked-in sketch emits v1 JSON with the expected device ID and optional `live` object at 115200 baud. `setup()` first emits HX711_NOT_READY; `loop()` schedules status/measurement output every 250 ms. `serviceSerialOutput()` drains protocol output regardless of diagnostic tracing, with reserved protocol queue capacity. DEBUG RAW is opt-in, defaults off and does not replace JSON output. There is no intentional wait for calibration or strict hold before emitting raw live preview data.

`work/live-preview-upload-verification.json` records a prior COM3 / NodeMCU upload verification with flash-hash success and three actual device frames (sequences 86–88). Each is v1, CALIBRATION_REQUIRED, grossG=null, stable=false, calibrated=false, with filtered live raw around 124,500 counts, live grams=null and age 22–73 ms. The current frontend accepts all three as status/fault frames carrying usable raw preview. This proves the prior uploaded firmware supplied the required extension; it does not prove what the board is transmitting in the present browser session.

The user reports that Chrome opens CP2102 COM3 at 115200 but remains waiting and exposes no received text. Opening a serial port proves port access, not arrival of bytes. No current byte trace, board reset or HX711 readiness has been directly observed during this task. The agent did not open COM3 through another application, send commands, toggle DTR/RTS, restart services or flash firmware.

## Confirmed frontend issue and smallest fix

The stream parser previously passed every nonempty line to strict JSON validation. A valid JSON preview followed by `#DEBUG RAW ...` caused an invalid event; the serial controller then cleared preview and reading. Repeated diagnostics could repeatedly erase otherwise fresh preview data.

Known `#DEBUG ` monitor lines are now ignored at the stream-framing layer, with bounded retained text and counters. This does not interpret DEBUG samples as weight, reset the sequence guard or loosen JSON validation. Unknown text, malformed frames, duplicate/out-of-order sequences and invalid preview fields still fail closed. Direct `parseScaleFrame(DEBUG)` remains invalid, so diagnostic text cannot masquerade as a measurement. Ignored diagnostics do not advance receipt time or extend the 500 ms preview freshness limit.

The dashboard now exposes **USB receive diagnostics**: received bytes, completed lines, accepted v1 frames (including status/fault frames), ignored DEBUG lines, rejections, first 240 characters of the last line and the last rejection. This is in-memory UI state, not a database log. No raw-to-grams fallback was added for DEBUG-only or unrecognized firmware.

## How to finish the live diagnosis

Expand USB receive diagnostics while Chrome owns COM3. If frontend hot reload disconnected the port, reconnect COM3 once using the existing button. Do not open a second serial monitor, tare, calibrate or change wiring for this check.

| Observation | Interpretation / next action |
|---|---|
| Bytes remain zero | No data reached this browser reader. This does not identify reset, firmware hang or control-line state. Capture that fact before any board/control-line action; a parser change cannot synthesize absent data. |
| DEBUG count rises, no accepted frames | Device is transmitting diagnostics. Current source should also emit JSON; inspect actual firmware/version before deciding it is old or diagnostic-only. Never convert diagnostic raw values into trustworthy grams. |
| Rejected count rises | Inspect last rejection and line. Version/device/field errors indicate a mismatch; duplicate/out-of-order sequence after boot can indicate a reset. Malformed boot bytes alone cannot prove a persistent failure. |
| Accepted frames, no `live` object | A legacy firmware frame is valid for its old purpose but cannot supply this new preview. Confirm the installed build; flashing the existing preview-capable build may then be necessary with separate approval. |
| CALIBRATION_REQUIRED with fresh `live.raw` | Expected uncalibrated preview. Remove load, use display-only empty-platform zeroing if necessary, then explicitly confirm the raw counts are tared. The browser-only 213.656 counts/g factor supplies an UNVERIFIED estimate. Strict calibration remains blocked until its original checks pass. |
| HX711_NOT_READY/TIMEOUT and null or stale raw | Sensor data is unavailable; do not fabricate a display. A single startup NOT_READY is expected; persistent frames need a separate readiness check. Do not change wiring yet. |

An ESP8266 reset on serial open is possible, but this source inspection cannot establish whether it occurred now. The frontend does not explicitly manipulate reset/control signals. Sequence restart remains rejected after an established sequence until a deliberate reconnect; it is not silently accepted as continuous data.

## Flashing decision

**No firmware flash is required for the confirmed frontend fix.** The historical uploaded device frames already contain valid preview data. Do not flash merely because the port opens or because CALIBRATION_REQUIRED appears. A new flash would only be justified after current evidence establishes the device is running a build without the preview extension or another firmware defect. That decision requires confirmation of the target and approval before uploading. No hardware change is needed to try this frontend fix and gather the counters.

## Verification and changed files

- New `scripts/check-usb-preview-diagnostics.mjs` replays the saved COM3 frames, byte-by-byte framing, interleaved and oversized DEBUG lines, malformed JSON, duplicate/reset sequence rejection and serial-controller preview preservation. It confirms no commands are sent and no measurement eligibility is fabricated.
- Existing 154 scale parser/lifecycle, 101 firmware formatter/parser/source, 24 live preview, scale UI, unverified factor/formatting, remaining-filament and localhost policy tests pass, as do frontend production build/typecheck/static checks. These are automated/saved-evidence checks, not a current physical serial capture.
- Changed: `lib/scale/protocol.ts`, `lib/scale/serial.ts`, `app/connections.tsx`, `scripts/check-firmware-protocol.mjs`, new USB diagnostic test, package test command and this report.

The 213.656 factor, firmware, calibration, stability checks, inventory records, NFC associations and access settings were not changed.
