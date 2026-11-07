# hold=0/4 investigation — diagnostics only

For opt-in Windows USB capture, labelled CSV export, completeness validation and
CSV replay, see [real HX711 raw capture](HX711-REAL-RAW-CAPTURE.md).

See [diagnostic-only offline replay design](RAW-STABILITY-OFFLINE-REPLAY.md) for
analysis of the latest SLOPE 3.73/4.31/2.61 and HALF_SHIFT 38.33/37.50 resets,
candidate comparisons, executable regressions and evidence required to choose limits.

Phase 5C now adds [device-side timing, chronological snapshots and once-per-reset
capture](PHASE-5C-DIAGNOSTICS.md). Use that guide for current diagnostic commands
and complete-log capture; the reset policy and thresholds below are unchanged.

New evidence: [Wi-Fi/USB comparison and stationary-noise reproduction](WIFI-USB-CALIBRATION-COMPARISON.md)
explains repeated SLOPE/HALF_SHIFT blocking. It proposes a qualification-policy
correction without implementing a behavior change.

No stability behavior or threshold was changed for this investigation. No device
was opened/flashed, and no PHP, MySQL/inventory or hosting operation was performed.
Earlier uncommitted stability/diagnostic work is retained.

## Exact code findings versus unproven hardware cause

The reported MAD ~35, half difference 3–29.5, slope 0.17–1.75, latest difference
17–92 and central range 83–89 pass their individual gates. Full spread (<=400),
freshness and held centre history must also pass; a centre near -29530 alone does
not establish centre variation. A current SETTLING line is not a reset history.

There is **no unconditional reset on overlapping windows**. observe increments
pending on each accepted conversion, checks the rolling window, and records one
centre every 16 samples. After startup, the first quiet full window can record
centre 1 at sample 16. Subsequent quiet centres are recorded at 32, 48 and 64.

However, every rolling window must pass. A single failure resets count AND pending.
After that, 16 consecutive passing rolling-window observations are needed before
count rises from 0 to 1 again. A currently passing line can therefore have count=0
and pending=1..15. Repeated failures within each 16-sample interval prevent progress.
The former display omitted pending and the preceding failure, concealing this.

The 40-count gate compares historical completed-window centres with the current
rolling centre. Before any centre is stored, its span is zero: that gate cannot
prevent the first centre by itself. Once a centre is stored, even a quiet current
window more than 40 counts away resets progress. count=1 could briefly occur
between viewed snapshots and then reset. Also, calculating drift AFTER clearing
history produces zero, hiding the exact span that caused the reset.

Thus the exact implementation issue established here is **missing reset evidence
and pending progress**, not a demonstrated accidental unconditional counter reset.
The supplied aggregate values do not uniquely identify the actual hardware reset.
Claiming it is definitely the 40-count limit or definitely a sensor fault would
exceed the evidence. Latched measurements now distinguish these possibilities.

## Every counter reset path

| Reason | Condition |
| --- | --- |
| FULL_RANGE | Full spread >400 counts |
| CENTRAL_RANGE | Middle-12 range >220 counts |
| MAD | Median absolute deviation >70 counts |
| HALF_SHIFT | Trimmed half means differ >35 counts |
| SLOPE | Clipped absolute slope >2 counts/sample |
| LATEST | Latest-to-centre deviation >180 counts |
| CENTRE_SPAN | Historical/current centre range >40 counts |
| STALE | Last completed conversion older than 500 ms; loop may reset repeatedly until recovery |
| RAW_RANGE | ADC <=-8388600 or >=8388600, or existing-factor gross outside the existing guarded limits |
| CANCEL | Explicit CANCEL command |
| ZERO_ACCEPTED | Successful ZERO EMPTY after storage invalidation |
| CAL_ACCEPTED | Successful candidate CAL, before new settling/verification |
| CALIBRATION_ACCEPTED | Successful ACCEPT/EEPROM commit |

BOOT is initial state; MANUAL is the default reset label used by direct/test calls.
Firmware resetWindow calls now require a reason so an unlabelled call cannot slip
through. When multiple window gates fail, the first in the table is latched.

Missing readiness below the stale threshold does not independently reset the hold.
HX711_TIMEOUT status is emitted after 1500 ms but the STALE path has already reset
the window at >500 ms. A full block sets pending to zero while retaining/incrementing
count; this is normal progress, not a reset. Sliding a completed four-centre history
also is not a reset. Clearing verified when unsettled does not reset the hold.
Failed ZERO EMPTY, DEBUG RAW commands and ordinary status emission do not reset it.

## Is 40 counts too restrictive?

At the earlier estimated 106.9 counts/g, 40 counts is ~0.37 g. This is a centre-
variation gate, not a raw spread or MAD gate. Comparing it directly with MAD=35
does not establish failure: trimmed means have different variability, overlapping
windows are correlated, and slow drift/mounting creep may move the centre.
The previously reported empty-return shift of 50 counts could exceed it, but that
does not prove the centre is varying by 50 counts during this current empty hold.

First measure resetSpan/resetValue and a timestamp-ordered trace of stationary
window centres. If CENTRE_SPAN is repeatedly the cause while the apparatus is
independently stationary, assess between-block centre variability and drift before
designing a bounded noise-aware centre test. Any later behavior change should
retain hard outlier/motion gates, reference verification and drift regressions.
No increase to 40, change to reset policy or bypass is proposed without that trace.

## Added DEBUG RAW evidence

Use Serial Monitor 115200/Newline, browser disconnected. Send DEBUG RAW (or
DEBUG RAW ON), leave the empty platform untouched, capture 20–30 seconds, then
send ZERO EMPTY once. DEBUG RAW OFF disables logging; close Monitor before browser
use. Do not send CANCEL just to log: it intentionally clears saved calibration.

Original fields remain, plus:

- pending=N/16: accepted observations accumulating toward the next completed block.
- prevValid, prevCentre: whether a prior completed block centre exists and its value
  immediately before the latest observation. This is NOT the previous raw sample.
- centreDelta: signed current rolling centre minus that prior completed centre.
  A zero numeric value is not meaningful when prevValid=false.
- resetId: latched reset-event counter, increments on every actual reset call.
- resetReason: latest reset path, retained across subsequent passing observations.
- resetHold, resetPending: progress discarded by that reset. Window-triggered
  resetPending includes the candidate observation that failed.
- resetPrevValid, resetPrev, resetDelta: prior-centre context saved at reset.
- resetSpan: centre band at the failing observation before history was cleared.
- resetValue, resetLimit: failed gate's actual value and threshold. External reset
  reasons have zero here; use raw/poll/age and the reason for that context.

The old drift field still computes current drift, which may be zero after reset;
read resetSpan instead when explaining the preceding loss. For external resets,
centre context comes from the latest analysed window. If a gap triggers repeated
STALE resets, resetId advances repeatedly; subsequent resets may discard zero
progress. resetReason is history, not necessarily a current fault. BOOT/resetId=0
means no reset has yet occurred since boot.

Interpretation examples (synthetic, not actual observations):

```text
zeroCheck=SETTLING hold=0/4 pending=5/16 resetReason=SLOPE resetValue=2.01 resetLimit=2
zeroCheck=SETTLING hold=0/4 drift=0 resetReason=CENTRE_SPAN resetSpan=41 resetLimit=40
```

The first is currently passing but rebuilding after a prior slope failure. The
second preserves the 41-count failure hidden by clearing history. A stable trace
should advance pending and count without changing resetId. Capture lines where
resetId changes and the following lines; these identify the real hardware cause.

Diagnostics are bounded monitor-only #DEBUG RAW text; existing v1 JSON frames
and browser rejection of non-protocol diagnostics are unchanged. Logging adds
serial timing load, so disable it before normal browser operation.

## Tests actually executed

- NodeMCU Arduino compile --warnings all: PASS, installed ESP8266 core 3.1.2 and
  HX711 0.7.5, no errors/warnings in this compile. No install/upload performed.
- 29 shared C++ compile-time assertions: PASS. New cases prove unchanged count,
  pending and settled decisions against a copy of the prior Hold algorithm on
  stable noisy data, slow drift, sudden loading and periodic HX711-style spikes.
  Additional cases check quiet overlap progress, transient slope reset history,
  centre-span evidence surviving a zero current drift, and stale/raw-range labels.
- Firmware formatter/parser/source guards: PASS, 93 checks; serial parser,
  simulator and connection lifecycle: PASS, 154 checks.
- RAM 29,656/80,192; instruction RAM including cache 60,331/65,536; flash code
  247,940/1,048,576. Output remains ignored in work/phase5b-build.

These are deterministic synthetic/compile-time tests, not runtime hardware tests
or an exact replay of a raw hardware trace. Actual on-device reset reasons remain
unconfirmed until the new diagnostics are captured. Calibration flags, fresh-data
checks, reference/ACCEPT rules, JSON contract and all numerical limits are retained.
