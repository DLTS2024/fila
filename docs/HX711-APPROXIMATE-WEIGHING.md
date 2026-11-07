# Opt-in approximate filament weighing

Approximate mode is implemented but **not physically accepted**. It aims for a usable qualified reading, with the requested inclusive **960–1050 g display band for an independently known 1000 g reference**. A compiled sketch, synthetic fixture or operator command cannot establish real mass accuracy. No upload, COM connection, calibration change or real inventory write was performed during implementation.

## Modes, calibration and reference approval

Boot remains **strict**. Existing strict raw gates, gram gates, zero/calibration/verification/ACCEPT workflow and 20-byte checksummed EEPROM record are unchanged. There is no legacy-factor fallback, automatic zero, automatic tare or self-calibration. A separate [Phase 1 approximate calibration workflow](HX711-APPROX-CALIBRATION.md) now supplies an alternative qualified record when strict calibration cannot complete; the instructions below about the original strict prerequisite describe the earlier implementation and are superseded by that workflow.

Manual newline-terminated commands at 115200 baud:

```text
MODE STRICT
MODE APPROX
APPROX VERIFY 1000
```

`MODE APPROX` opts in for the current boot, resets approximate history and clears reference approval. It does not write EEPROM or change calibration. `MODE STRICT` restores strict output and also clears approximate approval. Reboot defaults to strict. The browser continues to receive only; it sends none of these commands.

**A valid, accepted calibration is a prerequisite.** A fresh/unaccepted device continues to report CALIBRATION_REQUIRED. Zero, CAL, VERIFY and ACCEPT retain strict qualification even while approximate mode is selected. Alternatively, use the independent Phase 1 approximate calibration commands, collectors, three verification cycles and explicit acceptance documented in [HX711-APPROX-CALIBRATION.md](HX711-APPROX-CALIBRATION.md). Its record cannot authorize strict weighing. If neither workflow qualifies, the device must remain unavailable.

After selecting approximate mode, put the independently verified 1000 g mass on the platform and wait for settling. Frames initially report NOT_READY, then REFERENCE_REQUIRED if settled. Send `APPROX VERIFY 1000`. The command requires valid calibration, fresh data, qualified approximate history and actual filtered mass between 960 and 1050 inclusive. It **checks** the existing calibration; it does not alter offset/factor or snap the reading to 1000. For example, an actual 975 g converted result stays 975 g. The firmware cannot independently verify what physical object the operator placed on the scale.

Reference approval is session-only; mode changes, reboot and calibration invalidation clear it. Accumulated small drift beyond the configured anchor band also clears approval. Ordinary detected large load changes clear filter history and require requalification, rather than carrying the old reading forward.

## Filtering and NOT_READY

Settings are separate `APPROX_*` constants in `firmware/dloop_usb_scale/scale_config.h`; strict settings remain available and unchanged by this work. These are initial engineering settings, not hardware-derived accuracy guarantees:

| Setting | Initial value |
|---|---:|
| Accepted-sample history | 50 (~5 seconds at 10 SPS) |
| Output estimator | Sorted middle 40 values; trim 5 at each end |
| Full range | ≤25 g |
| Trimmed central range | ≤6 g |
| Median absolute deviation | ≤1.5 g |
| Difference between chronological half means | ≤2 g |
| Absolute regression slope | ≤0.25 g/s using nominal sample interval |
| Latest reading versus filtered centre | ≤8 g |
| Additional uninterrupted passing time | 3000 ms |
| Accumulated filtered-centre drift from qualification anchor | ≤5 g |

Approximately **7.9 seconds** of ideal 100 ms samples are needed from an empty history: 50 samples plus 3 seconds of passing rolling checks. Gate failures revoke qualification and restart the passing timer. The untrimmed range, half means, slope and latest-reading checks prevent the robust output estimator alone from hiding motion or outliers. A large incoming change (>8 g from an already qualified output) clears history immediately; removal/reload must settle anew. A small evolving change cannot repeatedly reset a local gate and silently move the anchor indefinitely: once centre displacement exceeds 5 g, reference approval is revoked and a fresh real-reference check is required.

All gram checks run only after `calibrated && validFactor(factor)`. There is no counts-to-grams assumption from the old captures. Range/rail rejection, acquisition freshness, timeout, out-of-range faults, command faults and sequence exhaustion remain effective. Fault/reset paths clear approximate history. No numerical gross value is emitted in approximate mode while unqualified: it reports `grossG:null`, `stable:false`, `fault:"NOT_READY"` (or the applicable existing sensor/calibration fault). Negative filtered results are NOT_READY rather than being silently clamped to zero. No zero tracking or drift subtraction is applied.

Slope estimation uses the nominal configured interval; permitted acquisition gaps make that rate estimate conservative for linear drift. The existing 500 ms sample-freshness rule still clears history. Host receipt freshness is independently checked by the application/server.

There is no claim of perfect motion detection. Sub-noise motion, very small changing loads, sensor offsets and a plausible stuck ADC value may resemble a stationary load. The 5 g anchor guard limits one form of cumulative drift, but is not a temperature model or a universal accuracy bound. A sudden change can reset history; a new stable but biased plateau can still qualify. Repeated independent physical reference/removal trials are mandatory.

## Protocol, display and inventory

Strict frames retain their existing v1 shape. Approximate frames add an explicit field:

```json
{"v":1,"deviceId":"DLOOP-SCALE-01","seq":123,"grossG":975.00,"stable":true,"calibrated":true,"mode":"APPROXIMATE"}
```

`stable:true` in approximate mode is computed from the approximate qualifier and is emitted only after reference approval; it is never forced. Fault frames also carry the mode. Older parsers that reject unknown fields fail closed. Updated parsing accepts only the exact optional APPROXIMATE marker; absent mode remains strict. NOT_READY and REFERENCE_REQUIRED are explicit fault/status messages and invalidate the previous reading.

The application shows **APPROXIMATE · settled · calibrated**, labels the frozen review and requires the user to acknowledge the approximate weight, spool, tare and proposed balance. It never saves incoming frames automatically. Confirm still requires fresh stable/calibrated live data, matching connection/mode, valid inventory version/revision/tare, an unconsumed frame and explicit save. Faults, stale data or mode changes invalidate confirmation. Frozen versus live mass may vary by at most **2 g in approximate mode**; strict retains **0.5 g**. The frozen value is what is confirmed and stored; the tolerance does not change or invent the measurement.

The API retains ordinary stable/calibrated/gross-match/freshness/duplicate-frame guards and additionally rejects approximate contexts without boolean `approximateAcknowledged:true`, invalid modes and orphaned acknowledgement fields. The server trusts client-supplied measurement context as before; this is not cryptographic hardware attestation. Activity history preserves the mode and acknowledgement and marks the event APPROXIMATE, including simulator provenance. No inventory schema migration is needed. Simulator output does not become physical reference evidence.

## Tests and checks

`approximate_self_test.cpp` evaluates the actual shared C++ filter during Arduino compilation. Assertions cover:

- Synthetic known-factor 1000 g qualification; a 975 g result remains 975; 960/1050 boundaries pass and values outside fail.
- No-load small positive residual remains measured, not auto-zeroed; a continuous 1 g/s no-load drift does not qualify.
- Removal immediately revokes the old loaded value; zero and reload need fresh history; repeat load returns the same synthetic result.
- Spikes, sustained alternating changing loads, invalid calibration, stale gaps and out-of-range observations do not carry qualification forward.
- Slow 0.1 g/s accumulated drift eventually trips the anchor guard; reference verification requires correct mode, calibration, freshness and qualification.

The first test compile exposed a false-stable alternating-load case before the MAD/central guards were added. The corrected implementation passes that assertion. These compiler-evaluated tests establish behavior on synthetic inputs, **not a physical reference-weight pass**.

Commands run successfully:

```powershell
$cli = "$env:LOCALAPPDATA/Programs/Arduino IDE/resources/app/lib/backend/resources/arduino-cli.exe"
& $cli compile --fqbn esp8266:esp8266:nodemcuv2 --build-path "$PWD/work/approximate-build" firmware/dloop_usb_scale
npm.cmd run build
node scripts/check-approximate-protocol.mjs
node scripts/check-scale.mjs
node scripts/check-scale-ui.mjs
node scripts/check-firmware-protocol.mjs
node scripts/check-sampling-diagnostics.mjs
node scripts/check-scale-replay.mjs
node scripts/check-stock.mjs
node scripts/check-api.mjs
node scripts/check-php.mjs
./.tools/php/php.exe backend/tests/approximate-scale.php
```

Arduino compile succeeds for NodeMCU/ESP8266 with all strict, diagnostic and approximate C++ assertions; firmware uses about 54% data RAM, 92% instruction RAM including cache reservation and 24% flash. The initial sandboxed compile could not access installed Arduino packages; compile-only verification then succeeded using the existing toolchain. Nothing was uploaded.

Frontend production build/type checking/static verification pass. Existing USB checks (154), firmware fixtures/source guards (101), diagnostic checks (21), replay regressions (170), stock/API regressions and PHP lint/unit checks pass. New protocol and UI tests cover mode preservation, approximate acknowledgement, tolerance, mode-change/fault blocking and no automatic save. Twelve PHP validation cases pass with a read-only PDO stub; no database is accessed. Database HTTP/concurrency and real-device/browser tests were not run; persistence integration remains unverified by these unit checks.

## Required physical acceptance before inventory use

1. Use the installed load cell within its actual safe mounted capacity and an independently known 1000 g mass. Record wiring, support, power/USB source, warm-up and reference identity. Do not derive grams from the uncalibrated raw captures.
2. Complete either the existing strict workflow or the separate [Phase 1 approximate calibration workflow](HX711-APPROX-CALIBRATION.md), with real reference masses and explicit acceptance. Neither path can safely approve excessive drift. An approximate record never qualifies strict mode.
3. Select `MODE APPROX`. Place the known 1000 g reference, wait for qualified history, then issue `APPROX VERIFY 1000`. A failure is evidence to retain, not a reason to widen limits until it passes.
4. **Validate independently of the enabling trial:** remove the reference, observe immediate loss of the old qualified load and eventual no-load behavior; reload 1000 g at least five times with full removal/settling between trials. Every accepted display must lie within **960–1050 g**. Record time to qualification, actual displayed values, repeatability range and failures. Keep NOT_READY trials in the results.
5. Leave unloaded and then loaded for at least five minutes each. Record drift, status, reference approval loss, removal and recovery. Apply controlled small/slow changes and benign disturbances; verify unsafe drift/motion does not remain save-eligible. Disconnect/stale/rail fault tests must never leave an old weight confirmable. Do not manipulate exposed powered connections.
6. Reboot: confirm strict is the default and approximate reference approval is gone. Test a different real reference/spool gross mass in the intended operating range; the 1000 g band does not establish linearity or accuracy at other loads. Check actual empty-spool tare independently.
7. In a test inventory record, confirm the APPROXIMATE marker and acknowledgement, verify zero writes before explicit confirmation, check stored gross/tare/net and history provenance, and exercise fault/stale/mode-change rejection before using production inventory.

Until these trials pass, the implementation is an unverified weighing mode, not an accuracy claim or permission to save a drifting sensor reading manually as though it had qualified.
