# Phase 5B code verification report

Baseline: aa250dc / phase5a-usb-scale-verified. Verified 30 October 2026.
Recovery tag for this work: phase5b-usb-firmware-code-verified.

## Delivered

Separate USB-only NodeMCU sketch at firmware/dloop_usb_scale/dloop_usb_scale.ino,
with DT D5/GPIO14, SCK D6/GPIO12 and 115200 baud. No original firmware was replaced.
No credentials, private headers, NFC or network clients are required. The radio is
explicitly disabled using the core Wi-Fi control library.

The sketch emits the real Phase 5A v1 JSON contract, including boolean flags,
monotonic sequence IDs and null-mass fault frames. Fixed windows/buffers handle
filtering, stability, freshness, raw saturation and bounded command parsing.
The original -108.55 factor is deliberately not used as a trusted calibration.

Explicit Serial Monitor ZERO EMPTY / CAL / VERIFY / ACCEPT commands keep physical
platform zero separate from inventory spool tare. A different known reference
must pass verification before calibration can be committed. A checked EEPROM
record preserves accepted factor/offset across browser-induced resets; boot
does not zero or treat any object on the platform as its baseline.

The browser is still read-only. Only explanatory hardware status text changed;
all seven views, authentication, explicit review/confirmation, manual fallback,
CSRF, versions, idempotency, PHP and inventory rules remain in place.

## Executed tests

| Check | Actual result |
| --- | --- |
| Arduino compile, final source, --warnings all | PASS: esp8266:esp8266:nodemcuv2, Arduino CLI 1.5.1, ESP8266 core 3.1.2, bogde HX711 0.7.5; no compiler warnings reported |
| Memory report | RAM 28,748 / 80,192 bytes (35%); instruction RAM including instruction cache 60,331 / 65,536 (92%); flash code 244,132 / 1,048,576 (23%) |
| npm run test:firmware | PASS: 80 checks, 15 fixtures; sketch printf format, actual browser parser, fault/status/flags, no UID, split/multiple frames, reconnect/sequence limit and source guards |
| npm run test:scale | PASS: 154 parser, freshness, simulator and owned connection lifecycle checks |
| npm run test:scale:ui | PASS: zero pre-confirmation mutation calls, unsafe sample rejection, no NFC, acknowledgement, duplicate/retry guards, manual fallback, cleanup and reconnect |
| npm run test:stock | PASS: existing balances, overdraw, grouping, undo, tare, slot and backup rules |
| npm run test:api | PASS: relative URLs, auth/CSRF headers, conflicts, invalid responses and network errors |
| npm run test:ui | PASS: all seven view/navigation states and existing fixture rendering |
| npm run typecheck | PASS: tsc --noEmit |
| npm run build | PASS: TypeScript + Vite + static verification; 8 static files, no Worker/D1/server bundle or device-token identifiers |
| Original firmware / D1 integrity | PASS: all 15 saved protected-file SHA-256 hashes unchanged |
| Original sketches, stock rules, PHP measurement source | PASS: baseline Git content unchanged, accounting for normal Windows CRLF checkout conversion |

The first sandboxed Arduino CLI attempt failed on access to installed package
metadata and could not perform its attempted tool extraction. Retrying with access
to the already installed tools compiled successfully; no package installation or
upload occurred. The initial direct Git-blob byte comparison encountered normal
LF/CRLF checkout differences; the saved file hashes passed, and normalized Git
content comparison passed. No original firmware change was needed.

Firmware tests render the sketch's actual format with fixture values; they are
not C++ runtime tests or a sensor emulator. UI mutation calls in these component
tests are spies, not real inventory saves. The existing Phase 5A database-backed
results remain historical; no PHP/MariaDB integration or migration was rerun in
Phase 5B because no backend behavior changed and inventory writes were prohibited.
No database connection or record mutation was made in this phase.

## Physical verification outstanding

No COM port was enumerated/opened, no firmware flashed, no electrical test,
calibration/reference measurement, real USB hot-plug, browser-to-physical-scale
test or physical-scale-to-PHP save was performed. Every item in the physical
acceptance checklist is intentionally unchecked. A compiled sketch is not proof
of accuracy, calibration, wiring safety or device reliability.

The accepted-calibration flag records an operator-approved two-weight procedure,
not cryptographic proof or automatic drift detection. Valid-looking stuck ADC
values/disconnected wiring cannot always be diagnosed by software. The existing
HX711 library's read is invoked only after ready; erratic hardware changing that
signal between readiness check and read can still disrupt its blocking primitive.
Test faults and watchdog recovery physically before relying on the device.
The 0.5 g zero band, stability thresholds, 5 kg software ceiling and verification
tolerances are starting settings; check actual load-cell capacity and repeatability.
Instruction RAM headroom is limited; recompile and recheck if libraries/core change.
No production deployment or Node production runtime was introduced.

## Changed files

- firmware/dloop_usb_scale/dloop_usb_scale.ino — new standalone USB sketch.
- firmware/dloop_usb_scale/scale_config.h — protocol format and tunable limits.
- firmware/tests/protocol-fixtures.json — 15 representative firmware outputs.
- scripts/check-firmware-protocol.mjs — parser/format compatibility and source guards.
- package.json — test:firmware command; no dependency installation/change.
- app/connections.tsx — current firmware availability and calibration notices.
- docs/PHASE-5B-FIRMWARE.md — IDE settings, compile command, calibration, hardware
  acceptance and rollback instructions.
- docs/PHASE-5B-REPORT.md — this report and complete changed-file list.
- docs/USB-SCALE-PROTOCOL.md — link to the separate firmware and reset behavior.
- README.md and START-HERE.md — Phase 5B documentation links.

Compiled output stays in ignored work/phase5b-build. No binary, credential,
private header, original sketch, SQL migration, D1 data or MariaDB data is committed.

## Run and rollback

See [firmware setup and calibration](PHASE-5B-FIRMWARE.md) for Arduino IDE upload
settings, compile-only commands, all manual commands and the physical checklist.
Use [Phase 5A local setup](PHASE-5A-LOCAL.md) to run PHP/Vite later; no server
was needed for this phase's code tests.

Recover phase5a-usb-scale-verified into a new empty folder to roll source back,
preserving current work and private configuration. There are no schema migrations
or inventory changes to reverse. The physical device is unchanged, so it needs
no rollback now. The original Wi-Fi source remains public/scale/esp8266_wifi_sync.ino;
a future manual return to Wi-Fi requires its private credentials and separate
reviewed upload/calibration. Do not overwrite it with this USB sketch or use the
ESP32 NFC prototype on NodeMCU.
