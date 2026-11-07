# Raw stability: diagnostic-only threshold experiment

No production limits, calibration behavior or firmware are changed by this
experiment. Use the existing `scripts/replay-scale-stability.mjs` CLI and
`scripts/scale-replay/` mirror. Candidate values are experimental comparisons,
not recommended limits.

## What the latest resets establish

| Diagnostic | Current limit | Excess | Isolated candidate comparison |
| --- | --- | --- | --- |
| Slope 3.73 | 2 | 86.5% | Passes 4.5, fails 3 |
| Slope 4.31 | 2 | 115.5% | Passes 4.5, fails 3 |
| Slope 2.61 | 2 | 30.5% | Passes 3 and 4.5 |
| Half-shift 38.33 | 35 | 9.5% | Passes 40 |
| Half-shift 37.50 | 35 | 7.1% | Passes 40 |

Slope is the absolute clipped regression in counts per accepted sample, not
counts/second. Half-shift is the absolute difference between independently trimmed
eight-sample half means. They measure different temporal structure. Quiet MAD or
spread does not imply either trend gate must pass. Threshold comparisons use `>`;
equality passes. HALF_SHIFT precedes SLOPE in reset priority, so a half-shift reset
can conceal a simultaneous slope failure. Replay reports every failed local gate
as well as the first reset reason.

Every accepted observation increments pending; every full rolling window is
tested. One failed window clears pending and all completed centres, retaining the
raw ring. Failures after 1–12 passing observations prevent the next 16-observation
block from completing. `resetPending` includes the failing observation: a reported
discarded pending of 12 means at most 11 preceding passing observations in that
block. After a reset, 16 consecutive passing observations produce centre 1 and
64 produce centre 4, subject to the unchanged 40-count centre-span gate. Startup
also counts the first 15 partial-window observations. At approximately 10 SPS,
64 conversions span approximately 6.4 seconds after a reset; use recorded times
for actual latency. This behavior explains starvation without an unconditional
overlap reset or proof of physical motion.

The supplied five aggregate values cannot reconstruct raw windows or prove
stationarity. Do not manufacture raw samples from them. The available recorded
16-sample snapshot instead has slope 5.010294118, half-shift 22 and unknown motion
state; it cannot measure false rejection or complete a four-centre hold.

## Reproducible offline comparison

```powershell
node scripts/check-scale-replay.mjs
node scripts/replay-scale-stability.mjs scripts/fixtures/scale-replay/recorded-snapshot.json scripts/fixtures/scale-replay/candidates.json --details
node scripts/replay-scale-stability.mjs --log capture.txt --labels annotations.json scripts/fixtures/scale-replay/candidates.json --details
```

See [capture instructions](PHASE-5C-DIAGNOSTICS.md) for existing FULL diagnostic
capture commands. A normalized JSON dataset uses the schema illustrated by
`recorded-snapshot.json`: provenance, initial state, independent label evidence,
and chronological samples containing accepted ID, device milliseconds, integer
raw value and label. Annotation input for a FULL log is, for example:

```json
{"name":"session-01","labels":[
  {"fromId":"101","throughId":"700","label":"static","evidence":"Operator/video: untouched empty platform"},
  {"fromId":"701","throughId":"720","label":"loading","evidence":"Video: weight placement in progress"}
]}
```

Use actual captured IDs. Leave ambiguous intervals `unknown`; never derive labels
from QUIET, hold, or reset output. Import rejects missing samples, conflicting
duplicates, lost records, incomplete tails and inconsistent reset metrics. Split
captures at reboot. Preserve external resets and acquisition gaps with evidence;
do not inject current SLOPE/HALF_SHIFT resets into a candidate's hold state. Each
candidate must replay the same complete sample stream with its own state. Unknown
initial history is explicitly a cold-start reconstruction, not exact historical
hold parity. Accepted-raw replay does not model all calibration validity checks.

Compare current (2,35), slope-only (3,35) and (4.5,35), half-only (2,40), and paired
(3,40)/(4.5,40). The existing (5.25,40) candidate only probes the recorded snapshot
boundary. Keep all other gates, four-centre requirement, reset policy and freshness
rules fixed. Record source/config hashes from output. Confirm mirror parity against
the shared C++ implementation before interpreting new captures; the existing
600-sample fixture agrees on 118 SLOPE and 129 HALF_SHIFT resets and max hold 1,
but is not general proof of parity on every recording.

## Capture and scoring plan

Capture repeated independent sessions with empty, representative and maximum
normal static loads; warm-up, thermal drift, power/noise and mounting conditions.
Include slow and fast loading AND unloading, small incremental changes, creep,
oscillation, touches, vibration, spikes and acquisition faults. Begin motion trials
after an established static qualification, retain full pre/post plateaus, and
include long sustained small movements. Independently timestamp motion onset and
cessation. Keep acquisition/logging conditions consistent across comparisons.

Score the following separately for each candidate and condition:

- **Static false rejection:** all-static 16-sample windows rejected by any local
  gate / all-static full windows. Also report centre-span resets, discarded
  progress, post-64-sample unqualified fraction, time to first qualification and
  never-qualified (right-censored) segments. Local rejection alone misses hold
  starvation. Include static plateau repeatability and long-term raw-centre drift.
- **Loading/unloading rejection:** report each direction separately, including
  motion onset to first revocation, qualification during sustained movement,
  and recovery latency after independently confirmed cessation. The existing
  aggregate movement score combines drift, faults and disturbance too; use
  detailed rows for per-label/event scoring. Do not average away a missed event.
- **False-stable risk:** any raw qualification while independent labels say motion,
  changing load or fault; report sample count, elapsed duration, longest run and
  affected events. Unknown labels do not contribute a denominator. Count onset
  exposure even if the rolling window still contains static samples. Qualification
  of an oscillating or slowly changing signal matters even when its centre stays
  within 40 counts. Raw qualification is not calibrated accuracy or permission to
  accept calibration or save inventory.

Overlapping windows are correlated. Report session/event counts and uncertainty
across independent sessions, not binomial confidence from thousands of overlapping
windows. Split tuning and held-out validation by entire capture/session. Agree
allowable static latency, smallest relevant load change, maximum motion detection
delay and false-stable event budget before selecting a candidate. Zero observed
false-stable events alone does not establish zero risk; report exposure and an
event/session-based upper bound with its independence assumptions.

## Current executable evidence and decision requirement

`node scripts/check-scale-replay.mjs` passes 170 checks, including all five supplied
values, failures after each of 1–12 passing observations, equality/priority,
candidate isolation, input integrity and synthetic loading/unloading and faults.
The synthetic irregular static fixture rejects 247/585 windows (42.22%) under
current local gates. Large synthetic loading/unloading has zero false-stable
samples. Conversely, the bounded changing-load sinusoid has 0 false-stable samples
under current limits and 257/320 under (4.5,40). That candidate can admit sustained
motion while improving apparent stability. These are synthetic demonstrations,
not hardware performance estimates. The existing periodic noise fixture repeats
every eight samples and under-tests half-shift; it is insufficient alone.

Safe limits require complete labelled real static AND motion recordings, current
baseline reproduction, recorded-trace C++/mirror parity, acceptable held-out static
availability and recovery, and no unacceptable increase in onset delay or sustained
false stability across the required disturbance envelope. Supply counts, exposure,
uncertainty and worst cases for every candidate. No safe numerical replacement can
be selected from the present reset summaries or the single unlabelled snapshot.
