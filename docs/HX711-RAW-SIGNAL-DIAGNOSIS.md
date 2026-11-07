# HX711 raw-signal diagnosis: bare and soldered captures

The dominant new feature is **large, curved drift in the two soldered recordings**, rather than a comparable increase in short-window random noise or repeated abrupt sampled jumps. The earlier bare-cell records contain smaller baseline wander and correlated fluctuations; the warm-up record additionally contains brief spike-and-return disturbances. Intermittent connection disturbance remains possible, but the recordings do not establish it as the common cause. Soldering did not demonstrably solve the instability, and the sequence does not prove soldering caused the drift.

No firmware, calibration, production thresholds, production logic, capture files or inventory behavior was changed. Analysis outputs are [full metrics and provenance](HX711-RAW-SIGNAL-DIAGNOSIS-RESULTS.json) and [supplementary temporal diagnostics](HX711-RAW-SIGNAL-DIAGNOSIS-TEMPORAL.json).

## Formats and validation

The extensionless capture files are **CSV**, not arbitrary binary RAW files: `device_id,sample_id,device_ms,raw,label,reset_before`. Each has a JSON metadata sidecar and a `.log` containing FULL diagnostic snapshots/reset records plus other serial output. `raw` is the accepted integer HX711 reading; `device_ms` records MCU accepted-read completion, not independent analog-event or conversion time.

The existing `scripts/scale-replay/import-log.mjs` reconstructs overlapping diagnostic windows and checks duplicate consistency, contiguous accepted IDs, timestamps/timing summaries, normal USER termination, complete tail, reset event ordering/counts, zero reported lost records/protocol/reset events, and local reset metric/limit/priority agreement with the current mirror. `scripts/compare-empty-hx711.mjs` validates CSV/metadata and computes unchanged-threshold replay, distributions, rolling metrics, ACF and spectra. It was reused without changing its behavior. Supplementary script `scripts/diagnose-hx711-raw.py` adds time-based line fits, window residual noise, adjacent-change examples and ten-second epochs.

**All five pass** the importer and exact CSV-to-log comparisons, including IDs, raw values, timestamps and external reset arrays. Metadata counts, SHA256, schema, device/label consistency, completeness and unknown-initial-state provenance pass. The JSON results preserve input and firmware/config hashes. This certifies the reconstructed accepted-sample evidence, not every unrelated serial line or the authenticity of the operator's physical annotations. Sixteen real pre-BEGIN samples in each log are excluded from the exported CSV analysis.

Abbreviations below:

| Abbreviation | Capture | Operator evidence |
|---|---|---|
| Empty | `bare-loadcell-empty-02` | Bare 40 kg cell, brackets removed, untouched on table, no applied load |
| Warm | `bare-loadcell-warmup-01` | Bare cell, untouched, powered at least five minutes before recording |
| USB | `bare-loadcell-usb-port-test-01` | Bare cell, alternate PC USB port, HX711 supplied from ESP8266 3V3 |
| Solder | `bare-loadcell-soldered-01` | Soldered connections, bare cell, untouched, no applied load |
| Retest | `soldered-static-retest-02` | Connections visually inspected, bare cell untouched, HX711 stationary |

## Quantitative comparison

All amplitudes are raw counts, not grams. SD is population standard deviation. “Centre” is the firmware mirror's middle-12 trimmed mean in a rolling 16-sample window. Global slope uses actual elapsed MCU time. The firmware's clipped absolute slope uses **counts per accepted sample**, so it must not be confused with the global counts/second slope.

| Metric | Empty | Warm | USB | Solder | Retest |
|---|---:|---:|---:|---:|---:|
| Samples | 600 | 600 | 600 | 601 | 598 |
| Duration, s | 59.934 | 59.939 | 59.922 | 60.028 | 59.939 |
| First sample uptime, s | 6314.968 | 11802.195 | 104.150 | 11.104 | 382.003 |
| Raw mean | −3592.9 | −3948.9 | −4755.1 | −63896.6 | −69559.6 |
| Raw min…max | −3785…−3375 | −4160…−3349 | −5035…−4329 | −65144…−62588 | −73601…−67273 |
| Raw SD | 63.3 | 77.8 | 118.2 | 851.0 | 2156.3 |
| Global signed slope, counts/s | −1.64 | −2.02 | +3.21 | −43.13 | +115.21 |
| First-to-last sample change | −11 | −20 | −483 | −776 | +6022 |
| Last-50 mean minus first-50 mean | −49.8 | −108.5 | +86.3 | −1568.3 | +5075.4 |
| Rolling-centre max−min | 200.6 | 187.2 | 354.3 | 2377.0 | 5643.5 |
| Adjacent-difference SD | 51.3 | 72.1 | 64.1 | 52.6 | 53.9 |
| Median 16-point line-residual SD | 40.8 | 50.4 | 49.2 | 44.0 | 42.0 |
| 95th percentile line-residual SD | 61.2 | 95.7 | 70.2 | 66.6 | 60.9 |
| Median / 95th rolling full spread | 170 / 249 | 195 / 393 | 183 / 280 | 207 / 344 | 208 / 610 |

Residual SD fits and subtracts an ordinary least-squares line within each 16-point window, using actual times. It describes variation left after a local ramp; it is **not** a proposed production filter, independent noise source estimate or reconstruction of physical input. Curvature and disturbances can remain in residuals.

The last two recordings have vastly larger whole-record SD and centre movement, but median short-window residual SD stays approximately 42–44 counts. Adjacent-difference SD also stays around 53–54 counts. Thus their thousands-of-count excursion is primarily accumulated baseline movement, not thousands-of-count independent sample noise. Retest's rolling spread sometimes exceeds 600 counts because a window spans a substantial ramp; a FULL_RANGE or MAD failure is not automatically an isolated outlier.

Endpoint comparisons alone are misleading: USB has a negative first-to-last change yet a positive fitted slope and positive first/last block-mean difference, because its first sample is unusually high and the intervening trajectory curves. Solder also first rises and then falls, so neither global slope nor endpoint difference fully describes it.

## Time-domain patterns and abrupt changes

**Empty:** five-second block means rise from approximately −3547 to −3517, descend toward −3639 around 40–45 seconds and recover to −3597. The largest adjacent change is −183 counts at row 476, 47.527 s (−3561 to −3744), followed by −3785, −3733, −3652, −3629 and −3583. This is a short excursion within correlated fluctuations, not evidence of a sustained level discontinuity. No adjacent change exceeds 200 counts.

**Warm:** the clearest transient is at rows 14–16: −3787 → −3349 → −3834, a +438 then −485-count spike-and-return over two reads. Subsequent values return near −4000. Another disturbance at row 318, 31.724 s, rises −4103 → −3755, then −3657, −3755 and −3950. There are 11 adjacent changes with magnitude >200 counts, including two >400; adjacent pairs are not independent events. This record contains intermittent **signal disturbances**, but there is no synchronized contact, supply or motion observation that identifies their cause. Background ten-second means also drift from roughly −3928 to −4020.

**USB:** the largest adjacent change is at row 2, 0.100 s: −4329 → −4877 (−548), followed by −5031 and −5035. Because it is at the capture boundary, the CSV alone does not bracket the full initiating event. It is not evidence of repeated connection chatter through the minute. All other adjacent changes are at most 188 counts in magnitude. Five-second means then climb from roughly −4904 to −4614 around 30–35 seconds and descend to −4818. The dominant later pattern is curved wander with correlated fluctuations.

**Solder:** values rise rapidly at the start: −64363 initially, with successive changes such as −64212 → −64043 → −63902 → −63891 → −63706. The biggest adjacent change is +185; none exceeds 200. Five-second means rise from −63463 to −62773 around 15–20 seconds, then descend through −63446, −64040 and −64591, ending around −65028. The 30–40-second segment fits approximately **−110 counts/s**. This is a smooth sampled excursion and reversal, not a single multi-thousand-count jump.

**Retest:** starts −73601, −73412, −73205, −73114 and continues upward; the largest adjacent change is +207. Only one adjacent change exceeds 200 and none exceeds 400. There is an early reversal around 10–20 seconds, then a sustained steep rise. During **20–30 seconds**, the fitted slope is **+365.75 counts/s**, while line-residual SD is only **73.4 counts**; all 85 entirely contained full windows reject. Later it approaches a fluctuating plateau: 50–60 seconds fits **−3.58 counts/s**, with residual SD 61.2, yet still rejects 52/85 contained windows. Thus the severe ramp subsides, but ordinary-scale local instability remains.

The 200/400-count adjacent-change screens above are fixed descriptive cutoffs applied to all recordings. They are not newly fitted acceptance thresholds, sensor fault definitions or a claim that smaller changes cannot be connection-related.

## Rolling gates and temporal structure

Current limits are unchanged: hard spread 400, central spread 220, MAD 70, half-shift 35, clipped absolute slope 2 counts/sample, latest delta 180, centre span 40; four hold centres required.

| Metric | Empty | Warm | USB | Solder | Retest |
|---|---:|---:|---:|---:|---:|
| Rejected full windows | 335/585 | 366/585 | 385/585 | 478/586 | 491/583 |
| Local rejection rate | 57.26% | 62.56% | 65.81% | 81.57% | 84.22% |
| HALF_SHIFT exceedances | 222 | 240 | 255 | 409 | 435 |
| SLOPE exceedances | 304 | 327 | 357 | 464 | 486 |
| FULL_RANGE exceedances | 0 | 29 | 1 | 11 | 114 |
| Median / 95th half-shift | 26.5 / 72.4 | 29.5 / 81.0 | 31.3 / 81.0 | 55.6 / 147.6 | 68.3 / 305.8 |
| Median / 95th clipped absolute slope | 2.11 / 6.48 | 2.30 / 7.38 | 2.68 / 7.11 | 5.10 / 14.39 | 6.21 / 33.57 |
| Longest passing full-window run | 16 | 21 | 11 | 16 | 17 |
| Maximum completed hold centres | 1 | 1 | 0 | 1 | 1 |
| Qualified samples | 0 | 0 | 0 | 0 | 0 |

Individual gate counts overlap. Solder/retest trend-gate exceedances increase strongly along with coherent baseline changes. A large monotonic change can also expand MAD, central spread and latest delta; those labels do not isolate physical mechanisms. No set of production limits was changed or tuned here.

After removing a global line, lag-1 autocorrelation is approximately 0.588, 0.458, 0.788, 0.976 and 0.995. At lag 10 (~1 second), it is 0.150, −0.017, 0.578, 0.857 and 0.954. The last two remain strongly correlated because nonlinear baseline movement survives a straight-line subtraction. They are not consistent with a model of independent, stationary random noise alone.

Descriptive Hann spectra after global linear detrending place approximately 14.7%, 10.9%, 61.0%, 97.8% and 99.7% of positive-frequency power below 0.2 Hz. This reinforces the difference in slow time structure; it does not establish a periodic oscillator. A minute-long nonstationary excursion can put substantial power in the lowest bins without repeating even once. Spectra assume nearly uniform accepted-sample spacing, use mean sample rate and have roughly 0.0167 Hz resolution. No resonance, mains alias or Wi-Fi frequency is identified.

Subtracting one global fitted line leaves 335, 369, 384, 456 and 510 rejected windows respectively. The nonlinear trajectories and short-scale fluctuations matter; one linear drift correction cannot explain or remove the observed rejection pattern. These are diagnostic sensitivity calculations, not validated firmware corrections.

## Sampling and experimental limitations

- All but Retest have accepted-read intervals of 99–101 ms. Retest has two 200 ms intervals at rows 401 and 414, with raw increments +28 and +58. These occur after the steepest 20–30-second ramp, and cannot explain the large earlier excursion. Accepted IDs remain contiguous. No stale-reset evidence is needed at these sub-500-ms gaps. MCU completion times cannot prove every conversion was read or expose electrical disturbances during acquisition.
- Recording lengths are about one minute each. Solder starts at only 11.1 seconds uptime; Retest at 382.0 seconds. Large drift is therefore not confined to the earliest seconds after reboot. Warm's recorded uptime is much longer than the stated five-minute minimum; that statement does not mean recording began exactly five minutes after power-up. Actual component temperature and thermal equilibrium were not measured.
- Means change from around −3600…−4800 before soldering to roughly −64000…−70000 afterward. These are across-session offsets, not a captured instantaneous 60,000-count step. Wiring/configuration, supply, loading/support, contact and temperature histories are not independently established. The raw logs do not justify explaining those offsets as a calibration change or treating them as equal physical operating points.
- Removing brackets and visually inspecting solder are operator observations, not electrical continuity, bridge resistance, mounting-force or strain measurements. “Untouched” does not exclude relaxation, thermal drift, vibration or electrical coupling.
- Replay begins cold with unknown historical hold state. Qualification delays are right-censored at each capture's duration, not zero or infinity. The source hashes document the current mirror/config; no flashed-binary identity or new full C++ recorded-stream parity proof is available.
- Correlated samples and overlapping windows are not independent experiments. There is no randomized matched before/after soldering, port crossover or simultaneous supply/temperature trace. No statistical confidence about a hardware intervention is inferred from the large window counts.

## What the evidence supports—and does not

**Most consistent description:** smaller serially correlated fluctuations and wander in the earlier records, with some transient disturbances in Warm/at USB startup; much stronger **gradual, nonlinear sampled drift** in Solder and Retest. Broad stationary random noise alone is an inadequate explanation for the soldered trajectories. Repeated abrupt connection-like steps are not their dominant visible pattern.

**Not distinguishable here:** thermal/bridge drift, mechanical strain relaxation or changing support, excitation/reference/ground changes, slowly changing contact resistance, electrical coupling, or a sensor/ADC defect. A disturbance at the analog input can have a different time shape at the accepted output, so smooth sampled drift does not rule out an electrical connection problem. Conversely, a transient does not prove a loose connection. Without independent electrical or mechanical observations, neither a failed load cell, bad solder joint, noisy ESP8266 supply nor faulty HX711 can be diagnosed. The results do not show that a different USB port or waiting five minutes fixes the system.

## One recommended next hardware test

Run a **controlled lead/connection perturbation test with fixed sensor support and timestamped sham intervals**, using the existing assembly. This directly tests the remaining intermittent/strain-sensitive connection hypothesis without buying replacement components or changing firmware. It can establish whether disturbances are reproducibly coupled to handling one lead segment; it cannot by itself prove a bad joint.

Keep the bare cell and HX711 stationary on the same non-stressed supports; strain-relieve the cable at the cell and board so movement of a free cable section does not pull on either. Keep power source, USB port, cable routing elsewhere, firmware, logging and Wi-Fi activity fixed. After a fixed warm-up, collect one continuous FULL recording: an untouched baseline, then several gentle flexes of a single accessible existing lead/connection segment interleaved with equal-duration sham/no-touch intervals, ending with another untouched baseline. Record segment identity and independently timestamp every action, preferably on video. Do not disconnect powered conductors, flex the sensing element or probe/touch exposed electrical nodes. No tare or recalibration is needed.

Predeclare the comparison: transient amplitude/duration and recovery, change in rolling centre, local slope/half-shift and full-spread excursions, and whether events repeatedly align with active flexes rather than sham intervals or ongoing drift. Retain the full pre/post signal; a large background ramp must not be relabelled as a handling effect. Repeat the same segment rather than moving multiple components at once.

Reproducible action-locked disturbances would prioritize the manipulated lead/connection path or handling-dependent coupling for inspection. They would not separate contact resistance from capacitance/pickup or imperfect mechanical isolation. If the large smooth drift continues similarly in untouched/sham periods without action-locked effects, intermittent handling-sensitive connection disturbance becomes less compelling, but an electrically unstable connection is not ruled out. This is one recommended experiment, not an experiment performed or a root-cause conclusion.

## Reproduction and relevant non-destructive checks

Run from repository root:

```powershell
node scripts/compare-empty-hx711.mjs docs/HX711-RAW-SIGNAL-DIAGNOSIS-RESULTS.json bare-loadcell-empty-02 bare-loadcell-warmup-01 bare-loadcell-usb-port-test-01 bare-loadcell-soldered-01 soldered-static-retest-02
python scripts/diagnose-hx711-raw.py docs/HX711-RAW-SIGNAL-DIAGNOSIS-RESULTS.json docs/HX711-RAW-SIGNAL-DIAGNOSIS-TEMPORAL.json
node scripts/check-scale-replay.mjs
```

Five capture integrity validations and five existing numerical checks pass; three supplementary numerical checks pass. The relevant replay regression suite passes 170 checks. No device commands, capture regeneration, threshold fitting, production writes, network/device tests or unrelated application tests are used.
