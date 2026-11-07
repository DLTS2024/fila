# Wi-Fi versus USB calibration blocking — investigation, no behavior change

## Finding

The immediate blocker reported on hardware is SLOPE/HALF_SHIFT clearing the new
USB hold, not failure to detect load-cell response. A deterministic stationary-
noise test reproduces this without physical motion: short-window trend estimates
fluctuate under ordinary bounded noise, and every failure erases all qualification
progress. This is an excessively strict qualification design for the tested noise,
not evidence of a changed HX711 gain or an unconditional overlap-counter bug.

The exact on-device noise source and every individual reset still require a raw
trace. Removing the plate does not eliminate this software sensitivity; it also
does not prove every electrical/mechanical component is fault-free. The current
root-cause conclusion is stronger than earlier aggregate-only inspection because
the user now reports repeated SLOPE/HALF_SHIFT resets and a new deterministic
stationary-noise counterexample confirms the failure mechanism in shared C++.

No firmware behavior, thresholds, PHP, inventory or hosting were changed here.
No hardware was opened or flashed. The proposed change below is NOT implemented.

## Exact comparison of retained source

| Detail | Original public/scale/esp8266_wifi_sync.ino | Current USB sketch |
| --- | --- | --- |
| Pins | DT D5/GPIO14, SCK D6/GPIO12 | Same |
| Gain | begin(D5,D6), default 128 in the installed bogde HX711 library | Explicit gain 128, same channel A |
| Conversion primitive | bogde read, preceded by wait_ready_timeout(1200,10) | Same read primitive, preceded by is_ready poll |
| Read cadence | One 8-conversion burst per ~5 s send interval, only while Wi-Fi connected; readiness waits and 70 ms delay between reads | Continuous poll at 100 ms, skips a read if not ready; actual cadence depends on conversion readiness/logging |
| Hardware sample rate | Not explicitly selected in sketch | Not explicitly selected; 100 ms polling is not evidence that the HX711 RATE pin changed |
| Filtering | Arithmetic mean of 8 values | Trimmed mean of middle 12 of 16, median/MAD, central range and trend estimates |
| Stability | Only 8-sample full range <=2 g for a send | Multiple rolling noise/trend gates plus 4 completed-window centres inside 40 counts |
| Failure effect | Skip that send; try a later burst | A single failed rolling window resets count and pending; repeated overlapping failures prevent any hold |
| Zero | Automatically average 15 raw conversions at boot, no stability check for that average | Explicit ZERO EMPTY, fresh robust window and settled hold; no auto-zero |
| Factor | Fixed -108.55 | Known-mass candidate and separate verification; no trusted default factor |
| Calibrated flag | Means startup offset averaging succeeded | Means explicit verification/ACCEPT and storage commit succeeded, or accepted stored record loaded |
| Gross bound | 0–20000 g | 0–5000 g, unchanged by this investigation |
| Transport | Wi-Fi client, network may delay/restrict bursts | Radio disabled, serial frames every 250 ms, optional verbose diagnostics |

The installed library's default gain and read implementation were inspected
locally; the exact library binary used for an earlier physical Wi-Fi flash is
unknown. Neither sketch explicitly changes the HX711 hardware RATE setting.
The old 70 ms delay does not guarantee exactly 70 ms between fresh conversions:
wait_ready_timeout also waits for the converter. USB readiness polling can skip
conversions or leave larger gaps, and debug output adds timing load. These are
cadence differences to measure, not evidence of a gain or ADC-driver defect.

The old startup behavior is less safe: it can zero a spool present at boot, and
its calibrated flag is not physical reference verification. Do not restore that
behavior merely because it allowed readings through.

## What the physical observations imply

- Empty near -29500 and 275 g near -58900 imply ~-106.91 counts/g. This is broadly
  comparable to -108.55, supporting a functioning signal path; neither approximate
  readings nor the old hardcoded factor establish accurate calibration.
- Empty spread 141–151 counts corresponds to ~1.32–1.41 g peak-to-peak. This fits
  inside the old 2 g send gate. Loaded spread 159–270 corresponds to ~1.49–2.53 g;
  some loaded bursts would fail even the old gate. It did not accept every burst.
- The new half-window gate permits only 35 counts (~0.33 g) between half means;
  slope permits 2 counts/sample (~20 counts/s at nominal cadence). These are
  short, noisy trend estimates, not direct evidence of physical movement.
- Requiring all those estimates to pass on every shifted window for ~6.4 s
  compounds sensitivity. Consecutive windows share 15/16 samples: one noisy
  sequence may produce several correlated failures. It is incorrect to treat
  these as independent confirmations of motion.
- MAD measures within-window scatter, not variation of trimmed centres. The
  40-count centre gate can independently be restrictive, but it was NOT the
  cause of the stationary-noise reproduction below: all its resets were trend
  failures before meaningful centre history accumulated.

## Deterministic evidence

600 samples at nominal 100 ms spacing (~60 s), baseline -29530. Bounded
pseudorandom noise is generated with fixed seed 1 and integer values -75..75.
This is representative stationary noise, NOT a recording of the actual hardware.

| Fixture | Passing rolling windows / 585 | SLOPE resets | HALF_SHIFT resets | Maximum hold | Settled samples |
| --- | --- | --- | --- | --- | --- |
| Stationary centre + bounded random noise | 338 | 118 | 129 | 1/4 | 0 |
| Same noise + 1 count/sample slow drift | 328 | 113 | 144 | 1/4 | 0 |
| Same noise + sudden 275 g-equivalent step | 329 | 114 | 127 | 1/4 | 0 |
| Same noise + periodic 1000-count glitches | 304 | 110 | 107 | 1/4 | 0 |
| Earlier balanced repeating-noise shape | 585 | 0 | 0 | 4/4 | 537 |

The load-step fixture additionally has 15 FULL_RANGE resets; glitches have 64.
The balanced fixture first settles at sample 64. Its 8-sample pattern repeats
exactly, making the two halves identical. It therefore under-tests HALF_SHIFT
sensitivity compared with irregular real noise. This was a test-coverage weakness.

Five additional C++ static assertions compile the **actual shared raw_stability.h**
and check the exact quiet/settled/maximum-hold/SLOPE/HALF_SHIFT counts above.
They confirm the analysis independently of the JavaScript mirror used to print
results. These are compiler constexpr evaluations, not runtime/electrical tests.

Local reproducible artifacts are retained, ignored by Git:

- work/hold-noise-analysis/probe.mjs — deterministic generator and analysis.
- work/hold-noise-analysis/results.json — printed results.
- work/hold-noise-analysis/probe.cpp — generated shared-C++ assertions.
- work/hold-noise-analysis/analysis_sketch — copy of the firmware plus assertions.

## Proposed minimal correction — not implemented

Correct qualification policy rather than changing gain, zero offset or blindly
raising the slope/half/centre limits:

1. Keep raw readiness/freshness, ADC rails, gross bounds, large outlier and sudden
   movement detection active on every sample. Such faults invalidate qualification
   immediately; never average a real load step into approval.
2. Qualify using genuinely completed, non-overlapping 16-sample blocks. Keep four
   required blocks and their bounded centre consistency initially. Do not wipe all
   history merely because one overlapping short-window slope/half estimate crosses
   its threshold.
3. Replace that unconditional reset with explicit sustained-motion validation across
   completed blocks: retain slope/half observations, compare signed centre changes
   and persistent direction over the full qualification interval. Central noise
   limits remain mandatory. An isolated ambiguous estimate must not authorize
   confirmation; it can defer qualification while the next block resolves it.
4. Start with the existing 40-count centre limit; revise it separately only if a
   stationary raw trace demonstrates it is incompatible with measured centre
   uncertainty. Do not conflate individual-sample MAD with mean uncertainty.
5. Retain explicit ZERO EMPTY, known reference CAL, different reference VERIFY,
   final live/reference ACCEPT checks, EEPROM success and calibrated=false until
   approval. Keep browser confirmation and JSON unchanged.

This is a proposed design, not a claimed verified replacement. Before implementing,
define the precise persistent-motion decision and tests proving irregular stationary
noise can qualify in a reasonable time while slow ramps, gradual loading, reversals,
steps, spikes and stale samples remain ineligible. Simply checking the old rules
less often, deleting SLOPE/HALF_SHIFT, or ignoring all failed blocks is insufficient.
No detector can distinguish arbitrarily small movement from noise; acceptance
resolution must remain explicit and physically verified with multiple known masses.

## Verification run for this investigation

- Analysis sketch with original 29 assertions plus 5 noise-probe assertions:
  Arduino CLI NodeMCU compile passed, using existing ESP8266 core 3.1.2 / HX711 0.7.5.
  Full build emitted existing library macro-portability warnings; no new errors.
- Existing firmware formatter/parser/source suite: PASS, 93 checks.
- Existing parser/connection/simulator suite: PASS, 154 checks.
- No production firmware source was changed during this investigation. Tests ran
  on an ignored local copy; prior uncommitted work is preserved.

Hardware-noise diagnosis, revised algorithm validation and a physical known-mass
acceptance test remain outstanding. No flash, credentials, inventory writes,
database connection or production deployment occurred.
