# Strict stability gates on the new USB-port capture

The clean hard-range behavior does not produce strict qualification because overlapping short-window trend failures repeatedly erase all progress. There is no 2/4 cap: the longest uninterrupted passing run contains exactly 32 observations, commits two block centres, and fails on the very next observation. CENTRE_SPAN does not cause any reset. No firmware, thresholds or calibration requirements were changed.

## Evidence, boundary handling and validation

Inputs are `captures/empty-new-usb-port-5min-20261105-151307.csv` and the previous `empty-continuous-5min-d5d86874a80e454bb4feb1b8408ae372.csv`, their metadata and serial logs. Existing [capture integrity evidence](new-usb-port-range-analysis/integrity-comparison.json) verifies exact CSV/log sample agreement and completeness. CSV SHA256 values were checked again during this analysis.

Unlike the earlier cold-start CSV replay, this analysis reconstructs the 16 pre-BEGIN raw samples and initializes the hold from the logged BEGIN state: hold=0, pending=0 for both recordings. It then evaluates every exported accepted sample with a full rolling window. Thus denominators are **2995 new** and **2997 previous**, rather than 2980/2982 when the first 15 CSV observations are omitted. Do not mix these denominators. The thresholds and formulas are identical in both analyses; only capture-boundary handling differs.

Every actual RESET record agrees with replay on sample ID, first-priority reason, discarded hold and discarded pending. New: 1280/1280 resets matched; previous: 2815/2815. The importer verifies complete USER termination, no missing accepted samples and zero reported lost records/protocol/reset events. Replay uses the existing JavaScript firmware-formula mirror; this is not a new shared-C++ recorded-stream parity proof or an electrical test. Existing 170 offline replay regressions pass.

## All local gates, new capture

Values use raw counts, except slope in counts per accepted sample. Conditions fail strictly above the limit; equality passes. Distributions cover all 2995 exported observations, including full windows crossing BEGIN.

| Gate | Limit | Median | p95 | p99 | Maximum | Exceeding observations | Actual priority resets |
|---|---:|---:|---:|---:|---:|---:|---:|
| FULL_RANGE | 400 | 132 | 189.30 | 226 | 253 | 0 | 0 |
| CENTRAL_RANGE | 220 | 76 | 115 | 135 | 184 | 0 | 0 |
| MAD | 70 | 24.5 | 40 | 50 | 70.5 | 2 | 2 |
| HALF_SHIFT | 35 | 20 | 59.72 | 78.54 | 138.17 | 729 (24.34%) | 727 |
| SLOPE | 2 | 1.63088 | 5.18809 | 7.44291 | 13.26029 | 1236 (41.27%) | 551 |
| LATEST | 180 | 26.17 | 79.86 | 102.51 | 160.17 | 0 | 0 |

SLOPE is the absolute clipped index-regression coefficient. HALF_SHIFT is the absolute difference of independently trimmed eight-sample half means. Neither is direct physical-motion measurement. Small raw range/MAD does not force these temporal statistics to pass.

Exactly 1715 observations pass all local gates (57.26%), while 1280 fail (42.74%). The exact simultaneous-failure breakdown is:

| Failing gates | Observations |
|---|---:|
| SLOPE only | 551 |
| HALF_SHIFT only | 44 |
| HALF_SHIFT and SLOPE | 683 |
| MAD, HALF_SHIFT and SLOPE | 2 |

MAD precedes HALF_SHIFT, which precedes SLOPE. Hence 1236 slope exceedances do not produce 1236 SLOPE-labelled resets: 685 are labelled by an earlier gate. Every local failure still resets qualification once. Exceedance counts overlap and must not be added as independent reset counts.

## Reset rate, runs and progress

There are 1280 actual resets in 299.959 seconds: **256.03/minute**, about **4.27/second**. Rate uses first-to-last exported sample time; the complete BEGIN-to-END interval is 300.054 seconds. Reasons: HALF_SHIFT 727, SLOPE 551, MAD 2. There are no FULL_RANGE, CENTRAL_RANGE, LATEST, CENTRE_SPAN or external reset events during this trace. Logged sample cadence is mostly 99–101 ms, maximum 201 ms; stale resets are not the blocker.

There are 278 nonempty consecutive passing runs. Run length median is 4, p90 15, p95 18, p99 30, maximum **32**. These are runs of accepted observations whose full rolling windows pass, not independent windows. Consecutive windows share 15/16 raw values, so one temporal fluctuation can generate several correlated resets; overlap itself never unconditionally resets the counter.

After each reset, pending starts at zero. The next 16 consecutive passing observations commit centre 1; the next 16 commit centre 2; a third requires 48 and a fourth 64 uninterrupted passing observations, with centre-span consistency throughout. The firmware increments pending before testing, so resetPending includes the failing observation. A pending reset to zero at a successful block commit is progress, not a failure.

The capture contains 27 completed block commits: 26 transitions to hold=1 and one transition to hold=2. Across post-observation states, hold=0 occurs 2834 times, hold=1 occurs 160 times, and hold=2 occurs once. Hold=3/4 and hold=4/4 never occur. The full per-observation artifact retains pending and hold before and after each update; pending reaches 15 and then either commits or is cleared on failure, as designed.

### Exact longest run and reset

| Sample ID | Device ms | Post-observation hold | Pending | Meaning |
|---|---:|---:|---:|---|
| 2747 | 275652 | 0 | 0 | preceding HALF_SHIFT reset |
| 2748 | 275752 | 0 | 1 | first passing observation |
| 2762 | 277154 | 0 | 15 | fifteen pass |
| 2763 | 277254 | 1 | 0 | sixteenth pass commits centre 125132.083333 |
| 2778 | 278754 | 1 | 15 | thirty-one pass |
| 2779 | 278855 | 2 | 0 | thirty-second pass commits centre 125145.916667 |
| 2780 | 278954 | 0 | 0 | next observation fails; both centres discarded |

At ID 2780, HALF_SHIFT=46.833333 >35 and SLOPE=3.013235 >2. Priority labels it HALF_SHIFT. Its other statistics pass: full range 127, central range 88, MAD 32, latest delta 29.583333. The device reports discardedHold=2 and discardedPending=1. Centre span is only 13.833333 counts, so the 40-count gate is not responsible. Hold=2 lasts about 99 ms before this reset. No later run exceeds it.

The next-longest run has 31 passes, IDs 1904–1934. ID 1935 fails HALF_SHIFT=40 and SLOPE=2.372059 exactly where pending would have reached 16 for the second centre. It discards hold=1 and pending=16 before committing that centre. This distinguishes checking a full block from merely counting enough elapsed conversions.

## Centre history and safety gates

CENTRE_SPAN threshold remains 40 counts. There are **zero** span-triggered resets. Among locally passing observations, maximum tested centre span is **22.666667**; p95 is 2.441667. Many observations have span zero because no centre has yet been stored, not because the raw signal is perfectly flat. This is a short-history, selection-conditioned result: it does not establish that four completed centres would remain within 40 if trend policy changed.

No STALE, RAW_RANGE, CANCEL, ZERO_ACCEPTED, CAL_ACCEPTED or CALIBRATION_ACCEPTED resets occur within this trace. Accepted-stream integrity does not certify all physical ADC conversions or exclude unobserved analog faults. This empty-platform capture does not exercise known-reference verification, final ACCEPT, EEPROM persistence or gross-mass accuracy. Strict qualification remains false throughout, so no calibration bypass or safety relaxation is justified.

## Previous recording comparison, same boundary method

| Metric | Previous | New |
|---|---:|---:|
| Observations with full raw window | 2997 | 2995 |
| SLOPE exceedances | 2609 | 1236 |
| SLOPE median / p95 / maximum | 9.8691 / 39.1191 / 98.5941 | 1.6309 / 5.1881 / 13.2603 |
| HALF_SHIFT exceedances | 2486 | 729 |
| HALF_SHIFT median / p95 / maximum | 131.8333 / 449.9333 / 924.5 | 20 / 59.7167 / 138.1667 |
| Actual resets | 2815 | 1280 |
| Actual resets per minute | 563.25 | 256.03 |
| FULL_RANGE priority resets | 2300 | 0 |
| Longest passing run | 13 | 32 |
| Maximum hold | 0/4 | 2/4 |
| CENTRE_SPAN resets | 0 | 0 |

The earlier FULL_RANGE count of 2287 excludes 13 boundary windows; 2300 here includes them and matches every logged event. The improvement is large, while strict qualification is still starved by trend failures. Both a successful-window fraction and an occasional completed centre can improve without ever producing a 64-observation qualifying interval.

## Recommendation

Another controlled hardware test is needed before considering a production stability-policy change. Repeat a fixed-conditions **USB-port A/B/A** experiment using identical warm-up, cable placement, mounting, supply, firmware and logging. Independently note stationarity and retain complete five-minute logs. These existing captures differ in date, starting uptime (~1190.5 s versus ~61.9 s) and even raw baseline sign/offset, so they do not isolate the USB port as the only changed condition. If a repeat is unstable or ambiguous, use the previously proposed local bridge-simulator substitution to localize the analog sensor/cable path versus the retained ADC/power/digital path.

The current evidence shows that bounded irregular signals can repeatedly trip short-window temporal gates, but cannot separate physical slow drift, mechanical strain and electrical wander from harmless stationary measurement noise. Controlled static reproduction should precede policy work; any later candidate also needs independently annotated slow/fast loading, unloading, reversals, oscillation, steps and fault traces, including revocation from an already-qualified state. Preserve all present numerical thresholds, explicit ZERO/reference verification and ACCEPT requirements while gathering this evidence. Simply skipping overlapping trend failures would change motion protection without a measured safety case.

## Reproduction and artifacts

Run `node scripts/analyse-strict-capture.mjs` from the repository root. This writes offline reports only.

- [All gate distributions, counts, longest runs and hold transitions](new-usb-port-strict-analysis/comparison.json).
- [Every new-capture observation](new-usb-port-strict-analysis/new-observations.json), including failed gates, first reset reason, before/after pending/hold, retained centres and span.
- [Every previous-capture observation](new-usb-port-strict-analysis/previous-observations.json).

The output records firmware/config SHA256 provenance. No capture contents or production source files were modified.
