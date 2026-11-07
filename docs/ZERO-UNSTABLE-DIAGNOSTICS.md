# Robust zero and stability — review before flashing

Latest diagnostic-only investigation: [hold reset paths, latched reasons and
pending progress](HOLD-RESET-INVESTIGATION.md). All stability limits below remain
unchanged; use that report to identify why a currently passing window has hold=0.

NodeMCU ESP8266, HX711 DT D5/GPIO14, SCK D6/GPIO12, 115200 baud,
reported 20 kg cell. Nothing was flashed, physically tested, or saved to inventory.
The software limit remains 5000 g; the cell label does not raise platform capacity.

## Analysis

The supplied 275 g response is (-58900 - -29500)/275 = approximately **-106.91
counts/g**. This is an estimate for analysis, not a factor automatically saved.

| Supplied observation | Approximate interpretation |
| --- | --- |
| Empty spread 141–151 counts | 1.32–1.41 g peak-to-peak |
| Loaded spread 159–270 counts | 1.49–2.53 g peak-to-peak |
| Previous 50-count gate | 0.47 g peak-to-peak, below observed empty noise |
| Empty returns -29500 to -29450 | 0.47 g shift, close to the unchanged 0.5 g zero band |

Summary min/max cannot reveal noise distribution or drift. Instead of relaxing
one spread gate, the new algorithm separately bounds central noise, outliers,
within-window trend, latest movement, and sustained changes of the centre.
The return error means accuracy/hysteresis still needs physical investigation.

## Acceptance criteria — all must pass

The existing 16-sample window remains. Its centre is the mean of the middle 12
samples. Median absolute deviation (MAD) is calculated around the window median.

| Check | Maximum |
| --- | --- |
| Full raw spread, including outliers | 400 counts (~3.74 g) |
| Middle-12 range | 220 counts (~2.06 g) |
| MAD | 70 counts (~0.65 g) |
| Difference between trimmed means of the two halves | 35 counts (~0.33 g) |
| Absolute clipped linear slope | 2 counts/sample (~20 counts/s) |
| Latest raw deviation from trimmed centre | 180 counts (~1.68 g) |

Each 8-point half trims one high/low. Slope uses chronological sample indices
with extrema clipped to the middle-12 endpoints. Full range/latest checks still
use the original values, so trimming cannot hide a large spike.

**Four non-overlapping quiet windows must settle**, with all four centres and
the current rolling centre inside a **40-count band** (~0.37 g). Earliest approval
is sample 64, about 6.4 seconds at nominal sampling; readiness gaps take longer.
Every rolling window is checked at each sample. Noise, movement or excessive
centre drift resets the hold. Stale data (>500 ms), rails/extreme values and
existing window resets also require new settling. Motion revokes a pending VERIFY.

With a candidate factor, CAL/VERIFY/ACCEPT and calibrated live stability additionally
require middle-12 range <=2.1 g, MAD <=0.7 g and actual centre drift <=0.4 g.
Explicit zero, valid/different known references, verification accuracy tolerance,
ACCEPT and successful EEPROM commit are retained. No adaptive ceiling learns to
approve an unstable platform. No automatic zero or calibration was added.

Individual samples may fluctuate around zero without constantly clearing the
window. ADC rails still fault immediately; extreme individual weights beyond
the gross limits plus max(0.5 g, 400/absolute factor) also fault immediately.
The trimmed mean remains subject to the existing negative/maximum mass limits.
Only accepted calibration permits the existing +/-0.5 g centre-to-zero clamp.

These are bounded heuristics, not proof of accuracy or rejection of arbitrarily
small motion: drift below their resolution is indistinguishable from noise.
A stationary object can pass; ZERO EMPTY remains the operator's assertion that
the platform is actually empty. Do not loosen limits merely to obtain PASS.

## DEBUG RAW and expected readings

Close browser Web Serial; open Serial Monitor at **115200 / Newline**. Send
`DEBUG RAW` (or `DEBUG RAW ON`); disable with `DEBUG RAW OFF`. It defaults OFF
at reboot and does not zero, calibrate, save data or take extra HX711 samples.

The original raw/min/max/spread/count/readiness/age fields remain. Added fields:

- centre: middle-12 mean; central: middle-12 range; mad: median absolute deviation.
- half: half-window difference; slope: counts/sample; latest: latest-to-centre distance.
- hold: consistent windows out of 4; drift: held/current centre range.
- zeroCheck: WAIT_WINDOW, STALE, OUTLIER, NOISE, DRIFT, MOVING, SETTLING or PASS.

For a quiet empty platform, expect centre near **-29500**, possibly **-29450**
after unloading, count=16/16, fresh age and often readyAtPoll=true. Spread can
remain **141–151**, not below 50. Hold should progress to 4/4 only when central
noise, trend and centre drift pass. On the 275 g plateau, expect centre near
**-58900**, with full spread potentially **159–270** and the same temporal checks.
Actual MAD, central range and slope **cannot be predicted from the summaries**.

Illustrative synthetic passing window, not measured output:

```text
centre=-29500 central=70 mad=27.5 half=0 slope<2 latest=5 hold=4/4 drift=0
```

This fixture passes with spread=151; an analogous loaded fixture passes with
spread=270. A different distribution with identical extrema can correctly fail.
readyAtPoll is readiness before the last read, not after it. Occasional NOT_READY
is normal between conversions; age measures the last conversion, including one
rejected from the window. NA means no samples; partial-window stats are provisional.

Collect 10–20 seconds untouched, then send ZERO EMPTY when zeroCheck=PASS and
hold=4/4. Its ZERO_EMPTY line snapshots the attempt. Successful zero still means
CALIBRATION_REQUIRED. Place the 275 g reference, settle again, then CAL 275.
Use a separately known, sufficiently different safe mass for VERIFY, settle again,
then ACCEPT without moving it. Never invent a verification mass. See
PHASE-5B-FIRMWARE.md for the full calibration/storage workflow.

Disable logging and close Serial Monitor before browser use. Diagnostics are
monitor-only #DEBUG RAW text, rejected by the browser. Measurement/fault v1 JSON,
device ID, sequences, flags and explicit inventory confirmation remain unchanged.

## Executed verification

- Arduino compile --warnings all: PASS, esp8266:esp8266:nodemcuv2, core 3.1.2,
  bogde HX711 0.7.5. Initial full rebuild emitted existing HX711 macro-portability
  warnings; final incremental build passed. No new firmware errors.
- **21 C++ static assertions** evaluated the exact shared raw_stability.h during
  compilation: reported empty/loaded noise ranges, returned baseline, four-window
  hold, loading/steps, slow/cumulative drift, vibration, spikes, latest movement,
  reset and re-settling. These are compiler constexpr evaluations, not MCU runtime
  or electrical tests. Sequences are synthetic matches to reported ranges, not
  captured ordered hardware traces.
- Firmware format/parser/source guards: PASS, 91 checks; existing serial suite:
  PASS, 154 checks; scale UI safety regression: PASS.
- Build: RAM 29,176/80,192; instruction RAM including cache 60,331/65,536;
  flash code 247,140/1,048,576. Output is ignored under work/phase5b-build.
- No port opened, firmware flashed, physical measurement, PHP/database connection,
  inventory update or hosting operation occurred. Actual accuracy, trend statistics
  and browser-to-device behavior still need physical acceptance.

Changed: dloop_usb_scale.ino, scale_config.h, new raw_stability.h and
stability_self_test.cpp, scripts/check-firmware-protocol.mjs, this guide and
PHASE-5B-FIRMWARE.md. Original Wi-Fi firmware remains unchanged.
