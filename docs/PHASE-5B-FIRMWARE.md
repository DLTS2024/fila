# Phase 5B: USB-only ESP8266 scale

Phase 5C diagnostic instrumentation is documented in
[PHASE-5C-DIAGNOSTICS.md](PHASE-5C-DIAGNOSTICS.md): device timing, sample IDs,
optional chronological raw snapshots and once-per-reset events. No stability
threshold or calibration decision was changed by that instrumentation.

Current noise-handling update: see [robust zero/stability criteria and real-data analysis](ZERO-UNSTABLE-DIAGNOSTICS.md). Settling now needs four quiet windows (~6.4 s), not the former 50-count spread check.

Sketch: [dloop_usb_scale.ino](../firmware/dloop_usb_scale/dloop_usb_scale.ino).
Open this file in its own matching folder in Arduino IDE. Do not open both it
and an old sketch in one Arduino sketch folder. Nothing was flashed in Phase 5B.
The existing Wi-Fi sketch and ESP32 NFC prototype remain unchanged/recoverable.

## Wiring and Arduino settings

NodeMCU 1.0 ESP-12E, HX711 channel A gain 128:

| HX711 | NodeMCU |
| --- | --- |
| DT / DOUT | D5 / GPIO14 |
| SCK / PD_SCK | D6 / GPIO12 |
| GND | GND |
| logic supply | 3.3 V compatible with the actual HX711 breakout |

Check your board's supply arrangement and load-cell wiring with power removed.
ESP8266 GPIO must not receive 5 V. Load-cell wire colours are not standardized;
use the manufacturer's E+/E-/A+/A- markings. The software's 5000 g ceiling is
not proof that the cell, amplifier, platform or mechanics can safely carry 5 kg.
Set MAX_GROSS_G no higher than the actual rated assembled scale before use.

Installed and used here: Arduino CLI 1.5.1 bundled with Arduino IDE,
ESP8266 Community core 3.1.2 and HX711 Arduino Library by bogde 0.7.5.
No packages were installed. If missing on another PC, use the
[ESP8266 core instructions](https://arduino-esp8266.readthedocs.io/en/latest/installing.html)
and [HX711 library](https://github.com/bogde/HX711); this sketch needs no PN532,
JSON, network client, API key or private header library.

Arduino IDE Tools settings:

- Board: **NodeMCU 1.0 (ESP-12E Module)**, ESP8266 core 3.1.2.
- CPU: 80 MHz; flash: 4 MB (FS:2 MB OTA:~1019 KB), only if your module has 4 MB.
- Flash mode: DIO; flash frequency: 40 MHz; reset: dtr (aka nodemcu).
- Debug port: disabled; upload speed: 115200; select the actual NodeMCU COM port.
- Erase Flash: **Only Sketch** for normal uploads. Preserve the old firmware and
  private recovery material before any upload. Do not choose an all-flash erase
  without a separate recovery decision.
- Serial Monitor: **115200 baud**, **Newline** (Both NL & CR also accepted).

Use Verify first. Upload is a separate manual action after reviewing hardware;
no upload command or COM probe was run by this implementation. Close the browser
port before Serial Monitor/upload, and close Serial Monitor before Connect USB.

Compile-only command, from the repository root (PowerShell on this PC):

```powershell
$cli = "$env:LOCALAPPDATA/Programs/Arduino IDE/resources/app/lib/backend/resources/arduino-cli.exe"
& $cli compile --fqbn esp8266:esp8266:nodemcuv2 `
  --build-path "$PWD/work/phase5b-build" firmware/dloop_usb_scale
```

Build output is local and ignored. This does not upload to hardware. The initial
sandboxed CLI attempt could not access installed package metadata; compilation
subsequently succeeded with access to those existing tools. No tools were installed.

## Protocol and runtime behavior

115200 baud, LF-delimited v1 JSON. `stable` and `calibrated` require explicit
boolean values; the original request example without `:true` is not valid JSON.

```json
{"v":1,"deviceId":"DLOOP-SCALE-01","seq":123,"grossG":984.60,"stable":true,"calibrated":true}
{"v":1,"deviceId":"DLOOP-SCALE-01","seq":124,"grossG":null,"stable":false,"calibrated":true,"fault":"HX711_TIMEOUT"}
```

No UID is emitted/required. No network association, credential, Wi-Fi client or
NFC initialization occurs. The ESP8266WiFi core library is used only to disable
persistent Wi-Fi configuration changes, switch the radio off and keep it asleep.
Core 3.1.2 starts Wi-Fi off by default; do not enable legacy Wi-Fi-at-boot.

One available raw conversion is polled at most every 100 ms. A fixed 16-sample
window trims the two highest/lowest values for its displayed mean. Stability combines central range, median absolute deviation, bounded outliers,
within-window trend and four consistent non-overlapping window centres. At least
64 fresh samples (~6.4 s) are required after reset/zero/error; motion restarts
settling. See ZERO-UNSTABLE-DIAGNOSTICS.md for exact raw and gram limits. Frames are emitted every 250 ms.
These are initial heuristics requiring physical validation, not metrology claims.

No new sample for 500 ms clears the window and blocks measurements; after 1.5 s
the status is HX711_TIMEOUT. ADC rail values, extreme raw mass outside the bounded noise guard are OUT_OF_RANGE immediately.
Individual samples may fluctuate around zero; the robust mean must still stay
within the unchanged physical mass bounds or the frame is OUT_OF_RANGE. An unplugged
amplifier normally times out, but software cannot reliably distinguish disconnected
wiring from all plausible ADC values. Stuck plausible readings and mechanical
faults require physical inspection; no false claim of perfect fault detection.

Only after accepted calibration, values within +/-0.5 g of physical zero are
reported as 0 g. Larger negative values are faults, never negative JSON numbers.
Unaccepted candidates do not receive this negative-weight tolerance. The zero
band and stability settings must be checked against noise and reference masses;
they must not hide drift or remove real filament from inventory silently.

Every application output is bounded JSON, including command errors. Extra fault
codes ZERO_UNSTABLE, CALIBRATION_UNSTABLE, VERIFICATION_FAILED, STORAGE_ERROR and
COMMAND_REJECTED use the parser's existing generic fault display and always block
confirmation. Boot ROM output may be gibberish at its own baud before the sketch
starts; the browser rejects it and recovers at a complete subsequent newline.
Sequence starts at 0 on boot, includes faults, increments without wrapping; after
UINT32_MAX the stream stops so the browser becomes stale. Disconnect/reconnect
after reboot or sequence exhaustion. No automatic zero occurs on port opening.

## Safe physical calibration

The historic -108.55 counts/g is only a clue, not a default. A fresh board or
invalid/missing saved record reports CALIBRATION_REQUIRED. Do not assume correct
calibration from a label, a stable flag, or compile success. Use traceable known
masses, a rigid mounted platform, warm-up time and repeated trials.

The browser remains read-only. These are **new, manual Serial Monitor commands**,
not an extension that the browser silently sends. Commands are case-sensitive,
one newline-terminated line; only unsigned decimal grams are accepted (50 to the
configured maximum). No generic `tare` alias exists, to avoid confusing the
platform offset with the plastic spool's tare.

1. Close the browser port. Open Serial Monitor at 115200/Newline. Leave the
   board powered to warm up, with its permanent platform assembled.
2. Send `CANCEL`. This revokes calibration in RAM and clears the USB calibration
   record, without zeroing anything. It does not touch the original firmware files.
3. Remove **every spool, reference mass and loose object**. Wait for DEBUG RAW to show
   16/16, hold=4/4 and zeroCheck=PASS (at least ~6.4 s). Send `ZERO EMPTY`. This is your explicit assertion
   that the platform is empty; the firmware cannot identify an object as a spool.
   All robust distribution, trend and temporal hold checks must pass. A refusal never auto-retries zero.
4. Place a known reference mass (for example 500 g, within actual capacity).
   Wait for settling, then send `CAL 500`. Candidate factor is
   `(trimmed raw mean - physical platform offset) / reference grams`; either
   sign is supported. Fresh window/stability/range checks must pass. `calibrated`
   remains **false**. The old factor is never used to authorize readings.
5. Replace it with a **different** reference (for example 1000 g if safe).
   Wait until hold=4/4 again and send `VERIFY 1000`. The reference must differ by at
   least max(20 g, 10% of the calibration mass). Candidate error must be within
   max(1 g, 0.2% of reference mass). Failed checks do not approve calibration.
6. With that verification mass still stable, send `ACCEPT`. It rechecks the
   actual live window against the verification mass and commits the record.
   Only a successful flash commit sets `calibrated:true`. Remove the reference
   and independently check zero and additional masses across the working range.
   If unacceptable, send CANCEL and repeat; never tune inventory tare to mask it.

Offset, factor, schema/magic and checksum are stored in a dedicated 20-byte record
in the core's emulated EEPROM sector, only on explicit calibration commands.
Boot loads a valid accepted record without measuring or zeroing the platform.
This permits a browser-induced board reset to retain approved calibration.
The checksum detects ordinary corruption, not malicious changes or physical drift.
Flash failures report STORAGE_ERROR and block the attempted calibration; do not
use that board until storage is repaired and a fresh calibration is verified.
Changing flash layout, reflashing or another sketch using EEPROM may invalidate
the record. No calibration data from Wi-Fi firmware is automatically imported.

Zero/factor changes revoke saved approval before changing calibration. A new CAL
requires ZERO EMPTY in the current boot/session; a saved boot offset alone is not
permission to recalibrate. After every reboot/USB reopen, physically verify the
empty platform and a known reference even when `calibrated:true`. If a spool was
on the platform at reboot, its gross should remain its mass: no boot tare occurs.
If the baseline drifted, disconnect browser and repeat the manual procedure.

The platform offset subtracts the **permanent weighing platform** only. Plastic
spool tare remains a saved brand/profile/per-spool inventory value in the web app.
Never put a spool on the platform for ZERO EMPTY or subtract spool tare in firmware.

## Physical acceptance checklist — NOT EXECUTED

Use disposable local inventory for end-to-end saves. Record date, board/cell,
reference masses, observations and errors; leave every item unchecked until tested.

- [ ] Wiring, actual load capacity and 3.3 V GPIO levels checked; no secrets needed.
- [ ] First boot with no USB calibration record blocks confirmation.
- [ ] Warm empty platform: repeatable near 0 g within the verified tolerance.
- [ ] CAL/VERIFY/ACCEPT with independently known references; extra low/mid/high
  references and repeated removal/replacement meet your chosen accuracy target.
- [ ] Negative drift, overload/ADC saturation and sensor disconnect block readings.
- [ ] Movement reports unstable; stable only after settling. Pause/timeout is unsafe.
- [ ] Reset with a spool present does NOT zero its weight. Calibration persists;
  empty-platform and reference checks pass again after reconnect/power cycle.
- [ ] Close Serial Monitor; browser localhost desktop Chromium Connect USB prompts
  for the NodeMCU at 115200. Disconnect/reconnect/unplug safely; reconnect after reboot.
- [ ] Select a spool **manually, without NFC**; saved effective plastic tare is right.
- [ ] Gross 984.60 g and effective spool tare 220 g preview 764.60 g remaining
  (example only; use actual measured gross). Previous/proposed/difference are right.
- [ ] Incoming frames alone create **zero** inventory changes/activity measurements.
- [ ] Explicit review/acknowledgement/confirmation saves once through authenticated
  PHP/MariaDB; actor, source, version and masses match. No automatic print usage.
- [ ] Double click/retry does not duplicate a save; unsafe/stale/calibration-false
  readings block review. Existing manual fallback remains usable after disconnect.

## Tests, limitations and rollback

Run `npm.cmd run test:firmware`, `test:scale`, `test:scale:ui`, `test:stock`,
`test:api`, `test:ui` and `build`. The firmware fixtures use its actual C printf
format with representative values, then the real TypeScript parser. They test
fragmented/multiple frames, flags, fault shapes, optional UID and sequence restart.
They do **not** execute C++ at runtime or simulate HX711 electrical/physical behavior.
Arduino Verify also compiles stability_self_test.cpp: constexpr static assertions
evaluate the exact shared C++ algorithm on observed-range and motion/drift fixtures.
See PHASE-5B-REPORT.md for actual executed results and the changed-file list.

No device was opened/flashed, no physical calibration was performed, no DB/API
mutation tests were run and no production deployment occurred in Phase 5B.

Source rollback: recover tag `phase5a-usb-scale-verified` into a new empty folder,
keeping current work and private material. Existing Wi-Fi source remains
`public/scale/esp8266_wifi_sync.ino`; the unrelated ESP32 prototype remains
`public/scale/dloop_scale.ino`. Do not use the ESP32 prototype on this ESP8266.
No database downgrade exists or is needed. Nothing on the physical device changed,
so hardware rollback is unnecessary now. If you manually upload later, returning
to Wi-Fi requires a separately reviewed manual rebuild/upload with private
credentials kept outside public/distributable firmware. Re-verify its calibration
and boot-tare behavior; restoring source alone does not restore flash/EEPROM.
