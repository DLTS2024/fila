# Real HX711 snapshot: 583623–585123 ms

Conclusion: the reported firmware SLOPE=5.010294 is mathematically correct.
The acquisition intervals in this window are regular. The raw trace contains
transient dips/recovery and an overall negative tendency, not a clean monotonic
ramp. This one window cannot establish sustained physical drift or its cause.
Every slope estimator tested still exceeds the current 2-count/sample limit.
No firmware/threshold correction is justified by a calculation error here.

## Exact input

```text
raw = [-21842,-21826,-21812,-21826,-21957,-21966,-21848,-21880,-21835,-21872,-21861,-21861,-21866,-21895,-21967,-21956]
times = [583623,583723,583824,583923,584023,584123,584223,584323,584423,584523,584623,584723,584823,584923,585023,585123]
```

## Existing firmware calculations

Sorted raw values:

```text
[-21967,-21966,-21957,-21956,-21895,-21880,-21872,-21866,
 -21861,-21861,-21848,-21842,-21835,-21826,-21826,-21812]
```

| Metric | Recalculation | Current gate |
| --- | --- | --- |
| Minimum | -21967 | — |
| Maximum | -21812 | — |
| Full spread | 155 | <=400, passes |
| Median | -21863.5 | — |
| Middle-12 mean / centre | -21874.916666667 | — |
| Middle-12 range | 131 | <=220, passes |
| MAD about median | 30 | <=70, passes |
| First-half trimmed mean | -21863.166666667 | — |
| Second-half trimmed mean | -21885.166666667 | — |
| Absolute HALF_SHIFT | 22 | <=35, passes |
| Latest-to-centre deviation | 81.083333333 | <=180, passes |
| Absolute clipped SLOPE | 5.010294118 counts/sample | <=2, FAILS |

The full-window median averages sorted positions 8 and 9 (one-based). MAD is
the median of all 16 absolute deviations from it. The centre drops the two highest
and two lowest raw values. Each half-window mean drops one high and one low from
its own eight chronological observations. They are different estimators: passing
HALF_SHIFT does not require the regression slope to pass.

For slope, the clipping endpoints are sorted[2]=-21957 and sorted[13]=-21826
(zero-based). The clipped chronological values are:

```text
[-21842,-21826,-21826,-21826,-21957,-21957,-21848,-21880,
 -21835,-21872,-21861,-21861,-21866,-21895,-21957,-21956]
```

With zero-based sample index i and median m=-21863.5:

```text
x_i = i - 7.5
N = sum(x_i * (clipped_i - m)) = -1703.5
D = sum(x_i * x_i) = 340
signed slope = N / D = -5.010294117647059
firmware slope = abs(N / D) = 5.010294117647059
```

Subtracting the median instead of the clipped mean does not introduce a slope
bias here: sum(x_i)=0, so either constant produces the same numerator.
The firmware strips the sign for its threshold comparison; negative signed slope
means raw readings tend toward more negative values as sample index increases.

## Which samples dominate the failed slope?

These are additive terms of the **existing fixed-centred numerator**, not causal
percentages or claims about what removing samples would do after refitting.
Sample numbers are one-based.

| Sample | Raw | Clipped | Numerator term | Signed slope term /340 |
| --- | --- | --- | --- | --- |
| 16 | -21956 | -21956 | -693.75 | -2.040441 |
| 15 | -21967 | -21957 | -607.75 | -1.787500 |
| 2 | -21826 | -21826 | -243.75 | -0.716912 |
| 3 | -21812 | -21826 | -206.25 | -0.606618 |
| 14 | -21895 | -21895 | -173.25 | -0.509559 |
| 5 | -21957 | -21957 | +327.25 | +0.962500 |
| 6 | -21966 | -21957 | +233.75 | +0.687500 |

The final low pair has substantial leverage because it occurs at the far end of
the time/index axis. The high early observations reinforce the negative fit.
Importantly, the earlier low pair at samples 5–6 **counteracts**, rather than
causes, the negative slope. The data do not support blaming one isolated outlier.
Leaving out any single observation and refitting ordinary regression still gives
an absolute slope above 4 counts/sample in this calculation.

## Ordinary and robust comparisons

All table entries below are signed slopes versus sample index, in counts/sample.
For comparability, the current threshold tests the absolute value against 2.

| Estimator | Result | Would its magnitude pass 2? |
| --- | --- | --- |
| Ordinary least squares, raw | -5.361764706 | No |
| Existing clipped least squares | -5.010294118 | No |
| Theil–Sen, median of all 120 signed pairwise slopes | -5.414285714 | No |
| Repeated median, median of each point's 15 slopes, then median over points | -4.116666667 | No |

These are explicit robust estimators, not a claim that every robust method gives
the same answer. Simply replacing the firmware estimator with either tested
robust method would still reject this window. Robust regression cannot decide
whether a multi-sample excursion represents electrical noise or real loading.

Raw ordinary regression has R²=0.22827; clipped regression has R²=0.22462.
A straight line explains only about 23% of this window's squared variation.
That is evidence against describing the trace as a clean linear ramp, not proof
that its underlying signal has zero drift or that the platform is safe/stable.

## Timing and signal shape

Consecutive intervals are:

```text
[100,101,99,100,100,100,100,100,100,100,100,100,100,100,100] ms
```

Minimum=99 ms, maximum=101 ms, mean=100 ms, total span=1500 ms. Ordinary
regression against actual elapsed seconds gives -53.615162 counts/s; clipping
with the same endpoints gives -50.103531 counts/s. Theil–Sen using actual times
gives -54.169884 counts/s. This closely agrees with the index-based results at
nominal 10 samples/s. There is no appreciable interval irregularity in these data
to explain away the failed slope. A future change to time-based units would need
a correspondingly converted limit; comparing counts/s directly against 2 would
be a unit error.

The raw trace has substantial reversals:

- Sample 4→5 drops 131 counts, followed by sample 6→7 recovering 118 counts.
- Sample 14→15 drops 72 counts; the final two samples remain relatively low.
- Four successive 4-sample means are -21826.5, -21912.75, -21857.25 and -21921.
  This down/up/down structure is not a sustained monotonic ramp.

The first dip recovers within this window; whether the final dip recovers requires
subsequent samples. Physical creep/loading, transient mechanical disturbance,
electrical interference and correlated sensor noise cannot be distinguished from
these 1.5 seconds alone. Absolute raw offsets also cannot establish a physical
zero without the saved platform/calibration context.

## Pending/hold and smallest justified action

Only the SLOPE gate fails among the calculable per-window criteria. Hold::observe
checks it before adding a completed centre, then resets pending and hold. The
reported pending=0/hold=0 is consistent with that path. Historical centre-band
variation, discarded progress and freshness at the moment of logging cannot be
recalculated without the surrounding RESET record and preceding windows.

**No formula or threshold correction is warranted from this snapshot.** Keep this
window ineligible under the existing rules and preserve it as a regression fixture.
The previously proposed longer-horizon/persistent-motion qualification design can
still be investigated using adjacent windows, but must not be presented as a proven
fix for this particular trace. Do not delete the final pair, classify the whole
window as harmless noise, or automatically accept it because MAD/HALF_SHIFT pass.

The next discriminating evidence is consecutive non-overlapping windows before
and after this one, with paired raw/timestamp arrays and reset history. That shows
whether centres continue moving or the excursions recover. No hardware reboot or
specific hardware fault is inferred.

## Reproduce and verification

Analysis files are retained locally under ignored work/hx711-snapshot-analysis:

- analyze.mjs: exact firmware formulas, ordinary/time-based regression, Theil–Sen,
  repeated median, per-observation terms and leave-one-out comparisons.
- results.json: full numeric output, including all 16 contributions.
- contributions.csv: per-sample raw/clipped values and numerator terms.
- snapshot_probe.cpp: ten assertions evaluated by the actual current C++ helpers.
- snapshot_sketch/: analysis copy of current firmware plus those assertions.

Run from the project root:

```powershell
node work/hx711-snapshot-analysis/analyze.mjs
$cli = "$env:LOCALAPPDATA/Programs/Arduino IDE/resources/app/lib/backend/resources/arduino-cli.exe"
& $cli compile --warnings all --fqbn esp8266:esp8266:nodemcuv2 `
  --build-path "$PWD/work/hx711-snapshot-analysis/build" `
  work/hx711-snapshot-analysis/snapshot_sketch
```

Both calculations and compilation were executed successfully. The ten additional
C++ assertions confirm extrema, centre, median/MAD, central range, HALF_SHIFT,
SLOPE, latest deviation, failed eligibility, SLOPE reset and timestamp reconstruction.
They use the actual shared headers, not a changed production algorithm. Compilation
also includes the existing 45 stability/diagnostic assertions (55 total).
Existing HX711 macro-portability warnings occurred during the full build.

No production source, threshold, calibration safeguard, PHP/MySQL data or hosting
was modified. No port was opened, hardware flashed or physical acceptance test
performed. Only this report and ignored analysis artifacts were added.
