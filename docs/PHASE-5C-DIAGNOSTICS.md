# Phase 5C — HX711 sample timing and reset capture

Updated sketch: firmware/dloop_usb_scale/dloop_usb_scale.ino. Target NodeMCU 1.0
ESP-12E, DT D5/GPIO14, SCK D6/GPIO12, 115200 baud. No hardware was opened/flashed.
This phase instruments the existing algorithm; it does not implement the proposed
qualification-policy change from WIFI-USB-CALIBRATION-COMPARISON.md.

## What is unchanged

RawStability::Hold, filtering/statistics and scale_config.h are byte-for-byte
unchanged from the pre-Phase-5C local snapshot. Freshness, sample polling period,
ZERO EMPTY, CAL, VERIFY, ACCEPT, reference accuracy, saved calibration and physical
mass bounds remain unchanged. Baseline comparison also verified the calibration
decision blocks. No automatic zero or inventory mutation was added. PHP, MySQL,
D1, Wi-Fi firmware and hosting were not accessed/changed by this phase.

## Commands — Serial Monitor, not the browser

Use 115200 baud and Newline (Both NL & CR also accepted). Diagnostics default off.

| Command | Effect |
| --- | --- |
| DEBUG TRACE ON | Summary capture: immediate BEGIN, once-per-second STATUS and one record per new reset ID, with timing/window statistics |
| DEBUG TRACE FULL | Same, plus chronological raw/time arrays on RESET and a WINDOW snapshot at every 16th globally accepted sample |
| DEBUG SNAPSHOT | One full current-window snapshot; does not enable continuous capture |
| DEBUG TRACE OFF | Stop collecting new records; drain queued lines and emit END |
| DEBUG RAW / DEBUG RAW ON | Retained legacy display, now limited to one POLL summary per second, plus explicit command snapshots; stops TRACE capture |
| DEBUG RAW OFF | Disable legacy display; use TRACE OFF to stop TRACE |

TRACE enabling disables legacy RAW output to avoid two verbose streams. While a
TRACE is running, repeated TRACE ON/FULL commands are ignored. To change modes,
send TRACE OFF, wait for END, then enable the new mode. A new capture is also
ignored while the preceding END is still pending. None of these commands changes
calibration or resets qualification. Do not send CANCEL merely to enable logging:
CANCEL intentionally invalidates saved USB calibration.

## Device sample counter and timestamps

The accepted-sample counter is uint64 and increments once on the same accepted
branch that fills rawWindow. It runs even with logging disabled and does not
reset when the raw/qualification window is cleared. NOT_READY polls and rejected
raw values do not increment it. It starts at zero on a device boot and is separate
from USB protocol seq and hold resetId. At theoretical uint64 exhaustion it saturates
and capture stops explicitly rather than wrapping sample IDs.

Each accepted raw value is paired with the existing lastSample millis() timestamp
taken immediately after sensor.read(). This is MCU read-completion time, **not**
host reception time or a hardware timestamp of the ADC's internal conversion.
The last 16 accepted pairs since the last window clear are retained in a fixed
ring. Snapshots order them oldest to newest. For array position i:

```text
sample ID = firstId + i
raw value = raw[i]
device timestamp = times[i]
```

Intervals are unsigned 32-bit differences between consecutive timestamps in that
window. A full window has 15 intervals. dtMin/dtMax/dtAvg are their actual minimum,
maximum and mean; they are not inferred from the configured 100 ms polling target.
With fewer than two samples, intervals=0 and the three numeric statistics are zero,
not evidence of zero elapsed time. lastDt separately retains the latest global
accepted-to-accepted interval, including across a window clear; the first ever
sample has no preceding interval and reports zero.

millis() rolls over about every 49.7 days; raw timestamps can decrease at that
boundary. Modular subtraction handles a single rollover. Counter IDs provide
ordering. No device-side method can resolve multiple clock wraps between samples
from millis() alone; lastDt is modulo uint32. The short capture should not be
interpreted as an absolute wall-clock recording.

## Expected output and field interpretation

Existing v1 measurement/fault JSON frames keep their original fields and sequence
handling. All new records are **separate monitor-only text** starting #DIAG:
BEGIN, STATUS, WINDOW, SNAPSHOT, RESET or END. They are not inventory measurements.
The existing browser rejects them, so stop diagnostics before browser use.

Schematic excerpt below uses ellipses only for readability; **actual firmware emits
complete bounded lines with all fields and all retained array entries**:

```text
#DIAG BEGIN ms=... accepted=... count=... firstId=... ... version=1 mode=FULL pollMs=100 halfLimit=35.000000 slopeLimit=2.000000 bandLimit=40.000000 startResetId=350
#DIAG RESET ms=... accepted=... count=16 firstId=... lastMs=... lastDt=... intervals=15 dtMin=... dtMax=... dtAvg=... ... resetId=351 reason=SLOPE value=2.001471 limit=2.000000 discardedPending=4 discardedHold=0 ... raw=[...] times=[...]
#DIAG END ms=... ... reason=USER resetObserved=... resetQueued=... recordsLost=0 protocolLost=0 lostReset=false firstLostReset=0
```

| Field | Meaning |
| --- | --- |
| ms | Device millis when the record is constructed; queueing may delay host display |
| accepted | Global accepted-sample counter, printed as an integer without losing uint64 precision |
| count / firstId | Retained pair count and oldest ID; firstId=0 for an empty window |
| lastMs / lastDt | Most recent accepted timestamp and accepted-to-accepted interval |
| intervals / dtMin / dtMax / dtAvg | Timing over the retained window; mean printed to three decimal places |
| haveSample / windowAge / saturated | Whether any sample was accepted, age of that accepted timestamp, counter exhaustion flag |
| centre / central / mad / half / slope / latest / spread | Current raw-window metrics; valid only with count=16, otherwise zero placeholders |
| hold / pending | Current qualification progress; RESET records naturally show post-reset progress |
| resetId / reason | Event identity and actual reset path; not a repeated label on every poll |
| value / limit | Failed numeric comparison, printed to six decimal places |
| discardedPending / discardedHold | Progress immediately before that reset; pending includes a failed candidate observation |
| prevValid / prevCentre / delta / span | Latched pre-reset completed-centre context and band, not a previous raw sample |
| observed / observedRaw / observedMs | Most recent completed conversion, including one rejected from the accepted window |
| numeric | Whether value/limit describes a numeric failure; explicit calibration commands are categorical, not failed threshold checks |
| raw / times | Optional paired chronological arrays; sample IDs are reconstructed from firstId |

SLOPE/HALF_SHIFT records use exact latched values, not a later passing window.
STALE records compare device age of the last completed conversion with 500 ms.
ADC rail failures identify the signed raw value and boundary. Guarded gross-range
faults without a rail comparison are marked numeric=false; observedRaw remains
available. Command resets also have numeric=false; do not interpret their zero
value/limit placeholders as evidence of a failed sensor comparison.

A reset record captures the relevant mirrored raw/time window **before it is
cleared**, even for external stale/raw-range resets. Later SNAPSHOT/STATUS can
therefore have count=0 while the earlier RESET contained count=16. Starting TRACE
does not replay resets that happened while logging was disabled; startResetId
establishes the capture baseline. Reset IDs increment modulo uint32, independently
of sample IDs. Deduplication handles the reset ID wrapping to zero.

## Bounded, non-blocking output and completeness

The collector is fixed-size. Lines have a maximum 1279 bytes including newline;
formatting overflow is detected rather than truncating evidence. A queue reserves
two 255-byte protocol slots and eight diagnostic slots. The writer sends at most
32 bytes per loop and never more than Serial.availableForWrite(). It finishes a
line before switching, prioritizing protocol frames at line boundaries. JSON and
diagnostic lines cannot interleave byte fragments. No dynamic String loop is used.

Normally, conversion-driven reset events are at most the accepted-sample rate,
approximately 10/s. STATUS is limited to 1/s. FULL WINDOW snapshots are tied to
each 16th global accepted sample, not every poll. Additional reset snapshots
overlap intentionally so the exact failure can be reconstructed. Duplicate sample
IDs refer to the same raw/time pair; do not count them as additional conversions.
Use start/end SNAPSHOTs to include partial windows at capture boundaries.

Output and formatting still have CPU/UART cost; physical timing impact has not
been measured. The new timestamp intervals expose that impact. Serial host display
timestamps alone cannot distinguish MCU acquisition jitter from USB buffering.

Repeated STALE resets can occur far faster than UART capacity. An unbounded,
lossless log at that rate is impossible without blocking or changing reset logic.
If any diagnostic cannot be queued, capture **stops** and emits END with
reason=OUTPUT_OVERFLOW and nonzero recordsLost. A missing reset is identified by
lostReset/firstLostReset. Protocol-slot overflow is separately counted as protocolLost.
Already queued records drain once; capture does not silently continue with missing
evidence or change qualification behavior. Treat such a capture as incomplete,
retain it, and retry briefly in summary mode after END. There is no claim to log
every event under arbitrary overload. The complete-capture criterion is USER END,
recordsLost=0, protocolLost=0 and resetObserved=resetQueued.

## Capture a short complete log

1. Manually upload this sketch only when ready, following PHASE-5B-FIRMWARE.md.
   This implementation has not uploaded anything. Disconnect browser USB first.
2. Open Serial Monitor at 115200/Newline. Enable text capture/copy without cropping
   long lines; optional host timestamps can be retained separately.
3. With the assembled empty platform untouched, send DEBUG TRACE FULL. Preserve
   the complete BEGIN line, then send DEBUG SNAPSHOT.
4. Capture 15–20 seconds without touching the platform. Optionally send ZERO EMPTY
   once to correlate a calibration attempt; this is a real zero command, not a
   logging command. It will only succeed if existing safeguards pass.
5. Send DEBUG SNAPSHOT, then DEBUG TRACE OFF. Wait for the complete END line and
   save every line from BEGIN through END to a text file, including normal JSON.
6. Verify the completeness fields above. Include device timestamps/raw arrays,
   every RESET line, and whether/when an object was deliberately placed/removed.
   Do not use screenshots or cropped copies as the raw evidence.
7. Close Serial Monitor before browser Connect USB. If DEBUG RAW was enabled
   separately, send DEBUG RAW OFF too.

Do not send CANCEL, CAL, VERIFY or ACCEPT merely to collect diagnostics. No
inventory update is part of this capture. A later optional 275 g placement/removal
test should be clearly annotated and kept distinct from the untouched interval.

## Verification actually executed

| Check | Result |
| --- | --- |
| NodeMCU compile, --warnings all | PASS; installed Arduino CLI, ESP8266 core 3.1.2, bogde HX711 0.7.5 |
| Shared C++ assertions | PASS: 29 existing stability assertions +16 diagnostic assertions =45 |
| npm run test:diagnostics | PASS: 21 log-format, reconstruction, timing, uint64 precision, bounds and protocol tests |
| npm run test:firmware | PASS: 93 existing firmware/protocol/source checks |
| npm run test:scale | PASS: 154 parser, simulator and connection lifecycle checks |
| npm run test:scale:ui | PASS: existing confirmation/unsafe-state/retry/manual-fallback safety tests |
| Baseline decision comparison | PASS: raw_stability.h, scale_config.h, existing C++ stability tests and calibration decision blocks unchanged |

The 16 new C++ assertions exercise chronological ring reconstruction, partial
windows, nonuniform timing, millis rollover, counter continuity/saturation,
reset deduplication, latched reset evidence, exact failure context and bounded
atomic protocol/diagnostic output. They execute through constexpr evaluation by
the compiler, not on physical hardware. Node tests render the actual C format
strings and reconstruct the resulting fixtures; they do not execute the UART.

Initial full compilation emitted existing HX711 macro-portability warnings. Final
incremental build passed without new warnings: RAM 42,792/80,192 (53%); instruction
RAM including cache 60,331/65,536 (92%); flash code 250,964/1,048,576 (23%). Buffers
account for increased RAM; no heap allocation is added by the diagnostic classes.
Build output stays ignored under work/phase5c-build.

No physical sample timing, UART throughput, calibration or sensor-fault acceptance
was tested. No packages were installed, no flashing occurred, and no database or
production resources were touched. These diagnostics gather evidence; they do not
claim to resolve or identify the physical cause of calibration blocking yet.

Changed for Phase 5C: dloop_usb_scale.ino; new sampling_diagnostics.h,
diagnostic_reporter.h and sampling_diagnostics_self_test.cpp; new
scripts/check-sampling-diagnostics.mjs; package.json test:diagnostics; this guide
and documentation links. Prior uncommitted stability work is retained.
