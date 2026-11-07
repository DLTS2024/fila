# Phase 1: Safe Approximate Calibration

Implemented and compiled for the existing NodeMCU ESP8266/HX711 sketch. **Not uploaded or physically validated.** The target is an independently known 1000 g mass reading **960–1050 g inclusive**. Passing synthetic tests is not a physical accuracy claim.

Strict `ZERO EMPTY`, `CAL`, `VERIFY`, `ACCEPT`, their thresholds and their record remain unchanged. This is a separate, explicit workflow that does not depend on strict quiet/hold qualification. It does not assume raw counts equal grams before estimating a candidate from real mass evidence. Excessive drift still causes rejection; there is no promise that the currently unstable hardware will pass.

## State machine and output

All new commands are case-sensitive, newline terminated, at **115200 baud**. Use Arduino Serial Monitor with **Newline** (LF; CRLF also accepted). These commands are implemented now:

| Command | Required state | Result |
|---|---|---|
| `APPROX CAL BEGIN` | Any | Clears the prior approximate saved approval only; starts unloaded baseline collection |
| `APPROX CAL LOAD 500` | BASELINE_READY | Starts a real 500 g calibration-reference interval; other valid masses 50–5000 g are supported |
| `APPROX CAL EMPTY` | NEED_EMPTY | Starts unloaded-return interval |
| `APPROX CAL CHECK 1000` | NEED_1000 | Starts a fresh real 1000 g verification interval |
| `APPROX CAL ACCEPT` | READY_TO_ACCEPT plus fresh qualified live reference | Validates and persists only the approximate record |
| `APPROX CAL STATUS` | Any | Prints diagnostic progress, reason and candidate metrics |
| `APPROX CAL ABORT` | Any | Discards pending state/candidate; does not create a calibration |

`LOAD` takes an unsigned decimal real reference mass. `CHECK` requires exactly 1000 g; it does not accept 960 or 1050 as the operator's reference label. Those numbers are **measured acceptance boundaries**, not substituted reference values. A distinct 500 g calibration mass is recommended so that 1000 g verification checks another point. If 1000 g is used to fit the factor, that fitting interval still does not count as any verification cycle.

Each collection waits **5 seconds**, then retains **200 consecutive accepted raw samples**, approximately **19.9 seconds** at nominal 10 SPS. Keep the condition unchanged until the next state appears. No second command is needed to stop an interval. Minimum retained duration is 19 seconds; within active collection (including settling), accepted intervals must be 75–150 ms, IDs must be consecutive, and no acquisition freshness fault may occur. A 200 ms accepted-read gap during active collection fails this calibration attempt even though ordinary weighing's freshness threshold is 500 ms. These checks establish accepted-stream continuity, not proof that every ADC conversion was acquired.

**Operator-wait continuity:** BASELINE_READY, NEED_EMPTY and NEED_1000 retain completed interval results through an isolated 200 ms accepted-read interval. These states collect no quality evidence and no longer apply the active-collection 75–150 ms/ID-continuity test. They still track the most recent accepted timestamp, reject sensor/rail faults, enforce the existing 500 ms freshness check and expire after the unchanged 120-second step timeout. New LOAD, EMPTY and CHECK phases initialize a fresh continuity anchor at their first fresh sample; no wait-period pair is treated as a collection pair. The original 75–150 ms rule applies from that anchor onward, including the five-second settling period. Starting a new stage does not reset the previous sample's freshness timestamp; a stale first arrival cannot conceal an outage. Firmware checks freshness/expiry again before starting the next stage.

READY_TO_ACCEPT intentionally retains the original tight continuity checks because it verifies the final live reference immediately before persistence. This fix does not relax that acceptance protection, any quality/drift/reference test, or strict mode. A wait-period gap can be tolerated without declaring its physical cause harmless; repeated gaps during active collections will still prevent calibration.

Continuity review (2026-11-01): the working tree already contained the state-aware
predicate, anchor resets and pre-command expiry gate above. Review retained those
rules, named the unchanged 75 ms minimum, and made firmware use one timestamp for
the pre-command check and stage transition. A rejected stage command now reports
the calibration failure immediately. `lastMs` remains the freshness clock even
when the phase-local `haveSample` continuity anchor is cleared.

Additional compiler-evaluated regressions exercise a natural three-cycle workflow
with repeated wait gaps and discontinuous IDs, preservation of baseline/factor/cycles,
fresh command-boundary anchors, and too-fast/too-slow/ID gaps in all four collections
during settling and retained sampling. Exact 120000 ms expiry and 500 ms freshness
boundaries remain inclusive; exceeding either still fails. Existing tests cover
stale first arrivals, rail faults in every wait, and final READY continuity.

Verification for this review: NodeMCU ESP8266 compile with `--warnings all` passed,
including all C++ static assertions; no warnings were emitted. RAM 48632/80192,
instruction RAM including cache 60355/65536, flash 260852/1048576 bytes. Calibration
integration, acquisition-gap diagnostics, firmware protocol, sampling diagnostics,
approximate protocol, offline replay, USB/parser and UI guards passed, as did all
12 PHP approximate safety cases using a read-only stub. These are synthetic and
source-level checks, not an on-device reproduction or physical accuracy validation.
No upload, flash, serial command or inventory write was performed.

Diagnostic lines use `#ACAL`, separate from measurement JSON and `#DIAG` capture records. Examples:

```text
#ACAL state=BASELINE_READY reason=NONE ... candidate=NONE ...
#ACAL state=NEED_EMPTY reason=NONE ... candidate=FROZEN ...
#ACAL state=NEED_1000 reason=NONE ...
#ACAL state=READY_TO_ACCEPT reason=NONE ... cycles=3/3 ...
#ACAL state=ACCEPTED reason=NONE cycles=3 persisted=true
#ACAL state=FAILED reason=ZERO_RETURN ...
```

The variable diagnostic fields report the last completed interval, not a continuous live weight. `measuredCandidateG` is explicitly provisional diagnostic evidence, never an approved protocol measurement. `candidate=FROZEN` means its value is no longer being fitted.

During all pending/failed calibration states, measurement frames remain **`grossG:null`, `stable:false`, `calibrated:false`**. Normal heartbeat status is NOT_READY; actual sensor, timeout and storage faults are preserved. The existing application rejects diagnostic text and fault frames as measurements. No calibration command or diagnostic status can save inventory.

## Required physical setup and exact calibration sequence

1. With power removed, check existing insulated wiring and supports. Secure the **permanent assembled weighing platform**, HX711 and cable strain relief. The cell must be mechanically supported as intended for weighing; an unmounted bare cell on a table does not validate the final assembly. Do not handle exposed powered connections. Use the existing power/USB arrangement consistently and record it.
2. Power on, close browser USB/other serial clients and open Arduino Serial Monitor at 115200/Newline. Allow a recorded warm-up, for example ten minutes **after opening** the port, since opening it may reset the board. Use independently known masses safe for the actual assembled mechanism; a 40 kg cell label is not a capacity certification for its mounts/platform.
3. Remove every spool, loose object and reference mass. Keep the platform, HX711 and cables untouched. Send:

   ```text
   APPROX CAL BEGIN
   ```

   Wait about 25 seconds for `state=BASELINE_READY`. This baseline is provisional; no accepted zero or factor exists yet. If FAILED appears, inspect its reason and restart only after addressing the cause.
4. Place the real calibration reference, for example **500 g**. Send only when it is in place:

   ```text
   APPROX CAL LOAD 500
   ```

   Leave it untouched until `state=NEED_EMPTY`. The factor is now frozen. Do not alter it to make the forthcoming tests pass.
5. Perform these two steps **three times**, physically unloading and reloading every time:

   - Remove all reference mass; send `APPROX CAL EMPTY`. Wait for `state=NEED_1000`.
   - Place the independently known **1000 g** reference; send `APPROX CAL CHECK 1000`. Wait for `state=NEED_EMPTY` after cycles 1 and 2, or `state=READY_TO_ACCEPT` after cycle 3.

   Each command starts its own fresh 5-second settling plus 200-sample interval. Repeating CHECK without a completed unloaded return fails; reusing the fitting interval cannot count as a trial. A loaded cell presented as EMPTY fails zero return unless the hardware itself misleadingly resembles zero—a physical fault software cannot perfectly detect.
6. After cycle 3, **leave the 1000 g reference in place**. Wait at least another eight seconds for the existing approximate live filter to qualify, then send:

   ```text
   APPROX CAL ACCEPT
   ```

   Only `state=ACCEPTED ... persisted=true` confirms successful persistence. An early ACCEPT reports NOT_READY and keeps waiting; it does not commit. The live reference must remain fresh, qualified and within 960–1050 g. A >8 g individual deviation from the final verification centre aborts the pending attempt rather than allowing a replacement load before acceptance. Each stage times out after 120 seconds; do not leave READY_TO_ACCEPT unattended.
7. After acceptance, the approximate weighing filter starts fresh. Wait for requalification; actual gross measurements carry `mode:"APPROXIMATE"`. Remove/reload and independently validate again before inventory use. No mass is snapped to 1000 and no automatic unloaded zero tracking occurs. A slightly negative filtered unloaded result remains NOT_READY under the existing weighing policy.

`APPROX CAL STATUS` is safe during waiting. `APPROX CAL ABORT` discards the attempt. A new BEGIN restarts everything and invalidates the approximate slot again. Strict calibration commands or other non-debug commands interrupt a pending attempt and fail it; use ABORT or a mode-selection command deliberately rather than mixing workflows. `MODE STRICT` aborts pending approximation and restores only the independently accepted strict record, if one exists. It never promotes an approximate record to strict.

An aborted or failed new attempt cannot recover an older approximate approval: BEGIN invalidates that slot before collecting. A strict record, if previously present, is preserved. Starting a new approximate attempt is therefore an explicit storage-changing action; STATUS and diagnostics are read-only.

## Estimation and rejection policy

Baseline and loaded intervals retain robust summaries: 10%-trimmed centre, MAD, full/central range, greatest individual deviation and adjacent jump, ten chronological 20-sample trimmed block centres, block span, half-block shift and regression slope using actual timestamps. The fixed 5-second settling period is excluded from estimation but still checked for acquisition continuity/faults.

The baseline is not called stable in grams until a provisional conversion exists. A calibration response must exceed both **100 raw counts** and **20 × (baseline MAD + loaded MAD)**. The 100-count floor is a minimum observable response, not a grams interpretation. The signed candidate is `(loaded centre − rounded baseline offset) / actual reference grams`, quantized to 0.000001 counts/g before verification. Both polarities work. A finite factor must lie within the existing numerical factor bounds, without treating an old nominal factor as evidence.

Both retained baseline and loaded summaries are re-evaluated using this provisional candidate. Checks require full range ≤25 g, central range ≤6 g, MAD ≤1.5 g, half shift ≤2 g, absolute block-regression slope ≤0.25 g/s, block-centre span ≤5 g, individual deviation ≤8 g and adjacent jump ≤8 g. These are engineering starting limits, **not limits derived from the uncalibrated captures or proof of accuracy**. No outlier is silently removed from the disturbance tests just because the centre is trimmed.

For each independent empty interval: absolute return must be ≤5 g from the original frozen offset. Across the three empty intervals, centre range must be ≤3 g. For each independent loaded verification: measured centre must be **960–1050 g inclusive**, and the range across all three results must be ≤20 g. Verification never updates offset or factor. A failure clears all pending trial credit and the candidate; there is no “keep the best three” retry within one attempt.

Typical FAILED reasons include `ACQUISITION_GAP`, `STALE`, `STEP_TIMEOUT`, `ADC_RANGE`/`SENSOR_FAULT`, `AMBIGUOUS_RESPONSE`, `FACTOR`, `BASELINE_REFERENCE_QUALITY`, `NOISE_DRIFT_OUTLIER`, `ZERO_RETURN`, `ZERO_REPEATABILITY`, `REFERENCE_BAND`, `REPEATABILITY`, `FINAL_LOAD_DISTURBANCE`, `ACCUMULATED_DRIFT`, `REFERENCE_OR_ORDER`, `INTERRUPTED_COMMAND` and `LOG_OUTPUT_LOSS`. Storage failures report STORAGE_ERROR. Collect contemporaneous diagnostics; do not loosen limits until a failing recording passes.

### Latched ACQUISITION_GAP evidence

A gap now queues one detailed `#ACAL state=FAILED reason=ACQUISITION_GAP` line **before** clearing collector progress. UART transmission remains asynchronous and bounded; this does not block waiting for serial output. The automatic generic failed-state line is suppressed for this event. `APPROX CAL STATUS` re-emits the latched evidence; a new BEGIN or ABORT/mode reset clears the latch.

Fields include `prevId/currentId` (full uint64 decimal), `prevMs/currentMs`, unsigned rollover-safe `deltaMs`, `samplesBeforeClear` and the pre-failure `phase`. `condition` is ID_GAP, TOO_FAST or TOO_SLOW. Separate `idGap/tooFast/tooSlow` flags preserve simultaneous violations; the primary condition prioritizes ID_GAP, then TOO_FAST, then TOO_SLOW. The original acceptance interval remains **75–150 ms inclusive**, with consecutive accepted IDs required. Collector count still becomes zero after failure; `samplesBeforeClear` preserves the otherwise-lost progress, including zero if failure occurred during settling.

Poll evidence includes current readiness/poll timestamp, previous poll timestamp/readiness with availability flag, `pollDeltaMs`, read start/end/duration in milliseconds, and `notReadySinceAccepted`. The latter counts not-ready polls since the preceding accepted sample. `haveNotReady/lastNotReadyMs` identify the most recent not-ready poll, potentially earlier than that interval. No additional HX711 readiness checks or ADC reads are performed.

A regular poll interval with intervening not-ready polls supports a readiness-related missed acquisition; a long poll interval supports scheduling/loop interruption; a long read duration implicates time spent in the read path. These are timing observations, not proof of a sensor, cable, power or CPU root cause. Millisecond resolution, unmeasured inter-poll events and diagnostic overhead limit attribution. Host receipt time is not device time. Unavailable poll context is marked explicitly. Queue overflow can still prevent delivery, but the existing output-loss handling and calibration rejection remain effective.

Regression command: `node scripts/check-acal-gap-diagnostic.mjs`. Arduino Verify additionally evaluates actual C++ latch/callback tests for each condition, combined failures, uint64 precision, retention after failure, evidence-before-clear, inclusive time boundaries and millis rollover. Nothing about the diagnostic relaxes calibration or inventory eligibility.

Existing rail rejection, out-of-range checks, 500 ms freshness, timeout handling and bounded output remain in place. The calibration collector also checks accepted IDs/timing independently. Diagnostic/protocol output loss during a pending attempt fails it. The workflow is nonblocking and uses fixed arrays, not delay loops or heap accumulation. Its execution still has CPU cost; physical timing must be checked on the real board.

## Persistence, restart and strict isolation

The strict 20-byte record stays at bytes **0–19** with its existing magic/version/checksum and behavior. A separate **48-byte** approximate record occupies bytes **32–79**. EEPROM emulation allocation becomes 128 bytes, preserving the existing prefix. Approximate metadata includes distinct magic, version 1, qualification profile 1, exactly three completed cycles, rounded raw offset, signed fixed-point factor, verification min/max, maximum absolute zero return and a checksum over explicit fields. Incomplete, corrupt, wrong-version/profile or out-of-policy records are not eligible to load.

Only explicit approximate ACCEPT writes an accepted approximate record. BEGIN writes an invalid record to that slot; neither touches strict bytes intentionally. ESP8266 EEPROM emulation shares a flash sector: the two records are logically separate, **not independently atomic flash devices**. Power loss can invalidate either; validity checks must reject damage. Actual flash endurance/power-failure behavior is not established by compiler tests.

Reboot still defaults to **strict** and does not resume an interrupted session. If only approximate calibration exists, CALIBRATION_REQUIRED at strict boot is expected. To load the stored approximate record after reboot:

```text
MODE APPROX
```

Leave a real 1000 g reference in place, wait for qualification/REFERENCE_REQUIRED, then send:

```text
APPROX VERIFY 1000
```

This re-enables session reference approval for an already accepted record; it cannot replace initial three-cycle calibration. A valid strict record can still support the older approximate-weighing path when no approximate record exists. The browser remains read-only. If opening its serial port resets the board, it will return to strict; automatic mode activation through the browser is not implemented in Phase 1. Do not work around that by removing calibration guards.

Inventory protections are unchanged: fresh stable/calibrated frames, matching mode/connection, known tare/version, explicit approximate acknowledgement and explicit confirmation are required. Candidate diagnostics, null/fault frames, failed trials and pending calibration cannot authorize inventory. Approximate history/provenance handling remains as documented in [HX711-APPROXIMATE-WEIGHING.md](HX711-APPROXIMATE-WEIGHING.md).

Mode selection now restores a validated saved record for the selected qualification class. The strict-record invalidation helper also clears its RAM cache, so a record revoked by strict CANCEL/zero/calibration cannot be resurrected by switching modes in the same boot. This preserves strict revocation semantics; it does not relax a strict gate.

## Automated verification and compile-only commands

Run from the repository root in PowerShell:

```powershell
$cli = "$env:LOCALAPPDATA/Programs/Arduino IDE/resources/app/lib/backend/resources/arduino-cli.exe"
& $cli compile --fqbn esp8266:esp8266:nodemcuv2 --build-path "$PWD/work/approx-cal-build" firmware/dloop_usb_scale
node scripts/check-approximate-calibration.mjs
node scripts/check-firmware-protocol.mjs
node scripts/check-sampling-diagnostics.mjs
node scripts/check-scale-replay.mjs
node scripts/check-approximate-protocol.mjs
node scripts/check-scale.mjs
node scripts/check-scale-ui.mjs
./.tools/php/php.exe backend/tests/approximate-scale.php
npm.cmd run build
```

The Arduino build evaluates the **actual shared C++ state machine** in `approximate_calibration_self_test.cpp`, alongside the existing strict/filter/diagnostic assertions. Coverage includes the complete three-cycle path, no early acceptance, frozen factor, signed polarity, independent 960/1050 boundaries, zero-return failure, repeatability failure despite in-band individual results, skipped unloads, invalid references, ambiguous/no response, outliers, oscillation, excessive baseline drift, ID/time gaps, stale/rail faults, abort/timeout and record integrity/version/profile/cycle-count isolation. Record round-trip eligibility and fresh-session state model reboot; this is not physical EEPROM power-cycling.

Integration/source guards additionally check unchanged strict gates/storage, explicit commit gating, slot reads, boot isolation, pending output protection, accepted-sample feed and loss handling. Existing protocol/UI/server-validation regressions cover rejection of unqualified data and explicit approximate inventory acknowledgement. Tests use synthetic known factors, never manufactured raw reconstructions of hardware. Database persistence/end-to-end hardware/browser testing remains manual; the PHP cases use a read-only PDO stub.

Final results: Arduino compilation and all compiler-evaluated assertions pass; approximately 59% data RAM, 92% instruction RAM including cache reservation and 24% flash are used. All 19 integration/source guards, 101 firmware checks, 21 diagnostic checks, 170 replay checks, 154 USB checks, new/existing approximate protocol/UI checks, 12 PHP validation cases and production frontend build/static verification pass. No upload, serial command, physical calibration or inventory database write was performed.

## Exact Arduino IDE upload instructions — manual only

1. Keep a copy of the current sketch and recovery material. Open **`firmware/dloop_usb_scale/dloop_usb_scale.ino`** in Arduino IDE; the entire matching folder must remain together, including the new headers and self-test `.cpp` files. Do not copy only the `.ino` into another folder.
2. Use installed **ESP8266 Community core 3.1.2** and **HX711 Arduino Library by bogde 0.7.5**. The successfully used compile target is `esp8266:esp8266:nodemcuv2`.
3. Tools → Board → **NodeMCU 1.0 (ESP-12E Module)**; CPU **80 MHz**; flash **4 MB (FS:2 MB OTA:~1019 KB)** only if that matches the physical module; flash mode **DIO**; flash frequency **40 MHz**; debug port **Disabled**; upload speed **115200**; reset method **dtr/nodemcu**, if shown. Choose **Erase Flash: Only Sketch**, not All Flash Contents.
4. Close browser USB, Python capture and other Serial Monitor instances. Tools → Port → **COM3 only if it is the connected ESP8266**; verify that identification yourself. Do not select another device merely because it occupies COM3.
5. Click **Verify** first. If it fails, stop and retain the compiler error. After reviewing the wiring/support and accepting this manual upload, click **Upload**. No upload command was run by the implementation.
6. Open Serial Monitor at **115200/Newline**. CALIBRATION_REQUIRED is expected without a valid strict record. Warm up, then follow the exact approximate calibration sequence above. Do not send strict CANCEL merely to start this workflow; approximate BEGIN handles its own separate record.

## Remaining hardware acceptance blockers

Real support/strain, warm-up, wiring/excitation quality, reference-mass identity, calibration/verification drift, repeatability, actual sampling intervals and flash persistence have not been verified. Existing captures lack an independently accepted factor for this assembly and cannot establish compliance with gram-domain limits. The new workflow may correctly fail on the previously observed large drift.

Before production inventory use, independently repeat the 1000 g test after the fitting/acceptance session, test zero/removal/reloading and another relevant mass, retain at least five-minute unloaded/loaded traces, reboot and verify record isolation and explicit session approval, and exercise stale/disconnect/fault behavior. Use a test inventory spool to check gross/tare/net and APPROXIMATE history, no writes before acknowledgement/confirmation and no save after a fault. Neither successful compilation nor three operator-labelled intervals certifies a faulty sensor or an incorrectly identified mass.
