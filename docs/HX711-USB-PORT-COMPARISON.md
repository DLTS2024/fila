# USB port B versus previous EMPTY_STATIC captures

The alternate rear USB-port recording shows some quieter raw-signal measures, but **does not demonstrate a reproducible USB-port improvement or restore qualification**. Its local gate rejection rate is **60.48%**, between the earlier recordings' **58.19%** and **72.09%**. It reaches one completed hold centre rather than zero, but never the required four. No hardware root cause is established.

Only diagnostic analysis was performed. Firmware, calibration, production thresholds, capture files and inventory logic were not modified. Full metrics and hashes are saved in [HX711-USB-PORT-COMPARISON-RESULTS.json](HX711-USB-PORT-COMPARISON-RESULTS.json).

## Integrity, provenance and scoring

All three CSVs match their FULL-log reconstructions exactly for accepted sample IDs, MCU timestamps, raw values and external reset arrays. CSV SHA256, metadata counts/device/labels/schema/completeness and recorded/unknown-initial-state provenance pass. The importer verifies diagnostic record coverage, duplicate consistency, reset ordering/counts, local reset metrics/limits/priority, timestamp summaries, normal USER termination, complete tail and zero reported diagnostic record/protocol loss or lost reset events.

Port B contains **166 non-JSON fragment lines before BEGIN**, starting with `UIRED"}`. These are an observed pre-capture logging anomaly. The replay importer ignores non-diagnostic text; the complete diagnostic section reconstructs without conflicts or missing accepted IDs. Therefore the accepted-raw analysis passes, but this does **not** certify the entire serial log as clean or explain those fragments. Do not equate zero reported protocol loss inside the capture with pristine serial output before BEGIN.

Metadata describes B as “Empty platform untouched, alternate rear USB port.” The earlier metadata describes an untouched empty platform; capture 02 additionally specifies fixed cables. It does not establish that every other condition or the exact prior port/cable geometry was controlled. All values below use the same current configuration and offline mirror. Operator stationarity is accepted as evidence, not independently verified by video.

Local rejection is any failed local gate divided by full 16-sample static windows. Individual gate exceedance counts overlap; priority reset counts are separate. Cold replay starts with empty history and excludes the 16 pre-BEGIN samples present in each log. It does not reproduce every historical hold/reset event at capture startup. Source/config and input hashes are recorded in the JSON.

## Gate failures and hold progress

Thresholds remain slope 2 counts/accepted sample, half-shift 35 counts, hard spread 400, central spread 220, MAD 70, latest delta 180, centre span 40, with four completed hold centres required.

| Metric | empty-static | empty-static-02 | empty-usb-port-b-02 |
|---|---:|---:|---:|
| Accepted samples | 601 | 599 | 602 |
| Full windows | 586 | 584 | 587 |
| Local gate rejects | 341 (58.19%) | 421 (72.09%) | 355 (60.48%) |
| HALF_SHIFT exceedances | 212 (36.18%) | 319 (54.62%) | 261 (44.46%) |
| SLOPE exceedances | 313 (53.41%) | 386 (66.10%) | 331 (56.39%) |
| Priority HALF_SHIFT resets in cold replay | 198 | 279 | 261 |
| Priority SLOPE resets in cold replay | 121 | 90 | 94 |
| Rejects with any non-trend gate failure | 26 | 56 | 0 |
| Longest consecutive passing full windows | 14 | 10 | 23 |
| Maximum completed hold centres, replay | 0 | 0 | 1 |
| Maximum hold in logged diagnostic fields | 0 | 0 | 1 |
| Qualified samples | 0 | 0 | 0 |
| Post-startup unqualified fraction | 100% | 100% | 100% |
| First qualification | Not observed | Not observed | Not observed |

First qualification delays are right-censored at 60.019, 59.936 and 60.137 seconds, respectively; “not observed” does not mean zero delay. B's 23-window passing run can commit a centre, but cannot sustain the 64 passing observations after a reset needed for four centres. A reset discards progress. The 40-count centre-span condition is also retained.

For B, every rejected full window fails HALF_SHIFT, SLOPE, or both; no hard-range, central-range, MAD or latest-delta gate fails. There are 237 windows failing both trend gates (261 + 331 − 355). The logged END counts 368 resets across the capture, while cold replay counts 355: the beginning of the actual stream retains pre-BEGIN raw history, whereas replay's first 15 observations have partial windows. These are different startup conditions; do not interpret the count difference as missing CSV samples.

## Raw noise, drift and timing

All amplitudes are raw counts; no calibration or grams conversion is applied. SD uses population normalization. The rolling centre is the same middle-12 trimmed mean used by the stability mirror. Local-baseline residuals subtract a centred 51-sample moving average, with shortened edge windows, solely as a descriptive separation of time scales.

| Metric | empty-static | empty-static-02 | Port B |
|---|---:|---:|---:|
| Raw mean | −21244.77 | −21363.33 | −19904.01 |
| Raw min…max | −21552…−20975 | −21628…−21084 | −20124…−19673 |
| Raw SD / MAD | 112.39 / 88 | 86.47 / 59 | 84.00 / 59.5 |
| Adjacent-difference SD | 59.14 | 74.90 | 52.39 |
| SD after global linear detrend | 98.75 | 82.87 | 73.69 |
| SD after ~5 s local baseline removal | 60.70 | 75.09 | 54.00 |
| Global linear drift, counts/s | −3.092 | −1.424 | −2.318 |
| Rolling-centre max−min | 352.58 | 206.33 | 264.00 |
| Rolling half-shift median / 95th | 26.92 / 100.63 | 38.83 / 109.12 | 30.67 / 77.00 |
| Rolling absolute slope median / 95th | 2.151 / 9.296 | 3.085 / 9.757 | 2.482 / 6.851 |
| Duration, seconds | 60.019 | 59.936 | 60.137 |
| Mean accepted interval, ms | 100.032 | 100.227 | 100.062 |
| Interval min…max, ms | 99…101 | 99…200 | 99…101 |

B's adjacent-difference SD is about 11.4% below capture 01 and 30.1% below capture 02. Its raw SD is about 25.3% below capture 01 but only 2.9% below capture 02; MAD is effectively unchanged from 02. These are real descriptive improvements in particular metrics, not proof that the port caused them.

B still wanders: five-second block means move from −19794 initially to −20009 around 30–35 seconds, then return to −19882 around 55–60 seconds. Its absolute linear drift and rolling-centre range are between the two earlier captures. Removing its fitted global line actually leaves 360/587 rejected windows, versus 355 originally. One monotonic drift is therefore not the explanation for its local failures; locally changing correlated fluctuations remain.

B has no points flagged by the global median ±3×1.4826×MAD outlier screen and no acquisition intervals longer than 101 ms. Its 355 rejected windows cannot be attributed to the isolated 200 ms gap seen in the older capture 02, or to rare global outliers. This screen does not exclude local transients hidden inside the overall drifting distribution. Contiguous accepted IDs and regular MCU completion times do not certify every ADC conversion or electrical timing detail.

After ~5-second baseline subtraction, lag-1 autocorrelation remains similar across all three records: 0.528, 0.502 and 0.526. Port B retains serial structure rather than becoming independent white noise. Its detrended Hann spectrum still places 53.5% of positive-frequency power below 0.2 Hz, compared with 52.3% and 27.6% earlier. These short, nearly uniform-sampling spectra describe slow variation, not proof of a fixed oscillator or RF/mains source. Earlier methodology and spectral caveats are detailed in [HX711-EMPTY-COMPARISON.md](HX711-EMPTY-COMPARISON.md).

## Did changing USB ports meaningfully help?

**Observed:** B is 11.61 percentage points better than capture 02 in local rejection, but 2.29 points worse than capture 01. The two previous recordings already differ by 13.90 points. B reduces the upper tails of half-shift/slope and removes observed non-trend failures, yet its median half/slope values and trend-gate exceedance rates remain worse than capture 01. One completed hold centre is limited progress; usable qualification remains absent.

**Conclusion:** there is a modest noise improvement in some recorded measures, especially relative to the noisier capture 02, but no consistent improvement over both baselines and no demonstrated operational improvement. There is insufficient evidence to attribute any difference to USB port selection. “The new port fixed power noise” and “USB ports have no effect” are both unsupported.

Important confounders and limitations:

- These are single, approximately one-minute recordings, not a contemporaneous matched port A–B–A experiment. Overlapping windows and serial correlation prevent treating hundreds of windows as independent experimental repeats.
- B was exported around 19:14 local time; the earlier captures were around 14:29 and 14:53. Device BEGIN uptime is approximately **31 s**, **54 s**, and **1522 s** for B, capture 01 and capture 02. Accepted counters also restart. Warm-up, session/restart state, environment and mounting history are not matched.
- B's raw mean shifts upward by approximately 1341/1459 counts relative to the two earlier means. The offset is observed, but its cause is unidentified. It cannot be interpreted as improved accuracy or a port-induced change without independent controls.
- No rail voltage/ripple, ground potential, mechanical vibration, temperature, RF activity or cable strain was measured. Port changes can coincide with other setup changes. Power/ground effects, coupling, sensor drift and mechanical effects remain hypotheses.
- Unknown prehistory limits historical hold parity. Existing numerical/replay tests and raw-log metric consistency checks are not a new recorded-stream C++ parity test or weighing accuracy validation.

## Next low-cost isolation experiment: change separation, not parts

Using the existing ESP8266, HX711 and load cell, perform a **near–far–near placement crossover** to test whether the recorded noise depends on proximity to the ESP8266 assembly. This requires no bridge simulator or replacement sensor and probes a different physical factor after the inconclusive port comparison. It is a diagnostic hypothesis test, not a claim that Wi-Fi causes the noise. Espressif documents placement and supply considerations in its [ESP8266 hardware design guidelines](https://documentation.espressif.com/esp8266_hardware_design_guidelines_en.html); that guidance does not identify the source of these recorded fluctuations.

1. Keep the load cell/platform and HX711 fixed, unloaded and untouched. Use one USB port (B is acceptable), the same USB cable, firmware, Wi-Fi activity, host logging, gain, supply connections and sampling settings throughout. Photograph and measure the initial board separation and cable routing. Warm up for a fixed period, for example ten minutes.
2. Record three minutes at the current ESP8266 position (**near A1**). Move only the ESP8266 farther from the HX711 and load-cell signal leads, using existing wire slack without changing wire length, pin connections or supply source. Aim for 10–20 cm if the existing leads permit; otherwise record the achievable distance. Do not extend leads merely to reach that distance. Support the board so the move does not pull on the load cell or HX711.
3. After an equal settling interval, record three minutes (**far B**), restore the original position and record another three minutes (**near A2**) after the same settling interval. If the assembly cannot move without stressing wiring or moving the sensor, this is not a clean separation experiment; document that constraint rather than treating it as one. No tare, calibration or firmware commands that change behavior are needed.
4. Predeclare the comparison: local gate rejection, HALF_SHIFT/SLOPE distributions, longest passing run, maximum hold/qualification, adjacent-difference SD, local-baseline residual SD, centre drift and sample timing. Seek a repeatable reduction in B with return toward A1 in A2, not a different mean offset or one brief quiet period. Repeat the crossover if practical, keeping startup and settling periods separate from scored intervals.

If far improves and near restores the noise, the result supports **placement-dependent coupling or a setup effect**. It still cannot distinguish radiated RF, digital wiring coupling, altered wire geometry or mechanical/thermal effects. If far does not improve, proximity becomes a less promising lead under those conditions; conducted supply noise, mechanics and sensor behavior remain untested. Keep the port constant to avoid combining interventions. The earlier bridge-substitution experiment would provide a different electrical/mechanical split but requires an additional matched simulator, so it is not the first recommendation under the existing-parts constraint.

## Reproduction and checks

Run from the repository root:

```powershell
node scripts/compare-empty-hx711.mjs docs/HX711-USB-PORT-COMPARISON-RESULTS.json empty-static empty-static-02 empty-usb-port-b-02
node scripts/check-scale-replay.mjs
python scripts/test-capture-hx711.py
```

Results: three capture integrity validations and five numerical checks pass; 170 replay regression checks pass; both capture test methods pass. The diagnostic script now accepts an output path followed by capture names; its original two-capture defaults are retained. No thresholds were fit or selected. The replay suite's message about no real labelled loading trace describes its own fixtures, not this static comparison.
