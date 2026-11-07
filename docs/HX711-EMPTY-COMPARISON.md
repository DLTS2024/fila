# Independent empty-platform captures: noise and failure structure

The repeat capture confirms a static qualification problem, but **lower whole-capture noise does not mean better qualification**. Capture 02 has less minute-scale wander and lower overall standard deviation, yet more short-scale fluctuation, larger half-shift/slope and a higher rejection rate. Both show correlated, broadband variation; neither establishes a repeatable narrowband oscillation or a hardware root cause.

Analysis is diagnostic only. Firmware, calibration, production thresholds and inventory behavior were not changed. [Machine-readable results](HX711-EMPTY-COMPARISON-RESULTS.json) include full autocorrelations, spectra, five-second blocks, window metrics, source/config hashes and exact counts. [Reproduction script](../scripts/compare-empty-hx711.mjs) uses the existing importer and stability mirror, without additional packages.

## Input validation and method

Both FULL logs pass existing importer integrity checks: normal termination, complete sample coverage, no lost records/protocol/reset events, contiguous accepted IDs, duplicate consistency, timing summaries and local reset value/formula/priority checks. Both CSVs match log reconstruction sample-for-sample, including reset arrays. Metadata schema, device, labels, counts, source, unknown initial state, evidence, completeness and SHA256 match. Pre-BEGIN snapshots are excluded from CSV scoring. Stationarity is operator evidence; capture 02 explicitly records untouched platform and fixed cables. These are separate recordings, not proof of statistical independence of environmental conditions.

Distribution standard deviations use population normalization. Quantiles interpolate ordered values. ACF uses mean-subtracted lag products divided by total zero-lag energy, with no lag-count correction. Reported ACF values below follow removal of one least-squares line. Spectrum uses the line-detrended sequence, Hann taper, direct DFT, positive-frequency bins, and normalizes by their summed power. Frequencies use the mean accepted-sample rate: approximately 10 Hz; this is a descriptive, nearly uniform-sampling spectrum, not an exact irregular-time spectrum or calibrated noise-density measurement. Spectral resolution is approximately 0.0166 Hz, with substantial uncertainty at the lowest bins. No interpolation or invented ADC conversions is used.

The additional centred 51-sample moving-average subtraction is a descriptive decomposition, with shorter edge windows. It is not an independent noise model or a proposed production filter; its negative long-lag ACF can be induced by the subtraction itself. Global robust outliers mean distance from median exceeding 3 × 1.4826 × MAD; this conventional screen is not a calibrated tail probability for these correlated, drifting data.

## Distribution and time scales

All amplitude values are raw counts, without converting to grams.

| Metric | empty-static | empty-static-02 |
|---|---:|---:|
| Samples / duration | 601 / 60.019 s | 599 / 59.936 s |
| Mean | −21244.77 | −21363.33 |
| Median | −21247 | −21361 |
| Min…max | −21552…−20975 | −21628…−21084 |
| 1st…99th percentile | −21497…−21029 | −21582…−21188.92 |
| Standard deviation | 112.39 | 86.47 |
| MAD | 88 | 59 |
| Adjacent-difference SD | 59.14 | 74.90 |
| Global linear trend, counts/s | −3.092 | −1.424 |
| SD after removing global line | 98.75 | 82.87 |
| SD after removing ~5 s local baseline | 60.70 | 75.09 |
| 16-sample trimmed-centre range | 352.58 | 206.33 |
| 16-sample trimmed-centre SD | 95.71 | 48.93 |

Capture 02's mean is 118.56 counts lower. Separate-session offsets cannot identify a thermal, electrical or mechanical mechanism, and do not by themselves imply a mass change.

Capture 01 has a broad descent and recovery: successive five-second block means start −21102, reach −21372 around rows 351–400 (35–40 s), and recover to −21184 at rows 551–600. Its first ten seconds are quieter (block SD 36.9/43.1) than many later blocks (roughly 62–77). A single negative fitted slope therefore hides a curved path.

Capture 02 has more frequent reversals: five-second means include −21374, −21327, −21376, −21321, −21300, −21401, then end −21444. Short-scale variation persists even while its minute-scale centre range is smaller. Neither record is adequately described as white noise around one constant mean or as one monotonic ramp.

## Autocorrelation and periodicity

| Line-detrended ACF | Capture 01 | Capture 02 |
|---|---:|---:|
| Lag 1 (~0.1 s) | 0.819 | 0.591 |
| Lag 2 (~0.2 s) | 0.666 | 0.266 |
| Lag 10 (~1 s) | 0.587 | 0.088 |
| Lag 20 (~2 s) | 0.548 | 0.057 |
| Lag 40 (~4 s) | 0.464 | −0.031 |

Capture 01 retains strong correlation after linear detrending because the curved, slow baseline remains. Removing the ~5 s local baseline leaves similar short-lag structure in both recordings: lag 1 is 0.528/0.502 and lag 2 is 0.137/0.106. The difference sequences have lag-2 correlation −0.299/−0.347. This supports serial structure and short-scale reversals, but does not establish a sinusoidal vibration, its source, or a particular internal filter.

| Fraction of detrended Hann positive-frequency power | Capture 01 | Capture 02 |
|---|---:|---:|
| <0.2 Hz | 52.28% | 27.56% |
| 0.2–0.5 Hz | 12.96% | 8.41% |
| 0.5–1 Hz | 9.70% | 19.58% |
| 1–2 Hz | 14.75% | 23.17% |
| 2–~5 Hz | 10.32% | 21.28% |

Capture 01's largest bin is 0.01663 Hz (37.58% of summed power), followed by 0.03327 Hz (9.44%). Those represent roughly one/two cycles over the entire record; the time-domain curve supports slow wander, **not proof of a 60-second oscillator**. Smaller peaks occur around 0.233/0.250 and 0.432/0.449 Hz, with broad higher-frequency content.

Capture 02's largest bins are 0.04997 Hz (6.11%) and 0.11660 Hz (5.82%). Its separate half-record spectra both peak near 0.133 Hz (about 7.5 s), accounting for 7.3% and 10.0% of their respective half-spectrum power. That is a possible recurring timescale within capture 02, not a confirmed stable oscillator: it is not dominant across both independent captures, and the full-record peak moves across adjacent low-frequency bins. Capture 01's first-half peaks near 1.63/1.67 Hz do not persist as leading peaks in its second half. No frequency is selected for a notch or identified as mains, Wi-Fi, structural resonance or ADC behavior. Frequencies above the accepted-stream Nyquist limit cannot be resolved from these logs; aliasing remains possible, not demonstrated.

## Why current stability gates fail

The unchanged thresholds are slope 2 counts/accepted sample, half-shift 35 counts, full spread 400, central spread 220, MAD 70, latest delta 180, centre span 40. Only entirely static full windows are scored.

| Metric | Capture 01 | Capture 02 |
|---|---:|---:|
| Rejected full windows | 341/586 (58.19%) | 421/584 (72.09%) |
| Half-shift median / 95th / max | 26.92 / 100.63 / 174.5 | 38.83 / 109.12 / 201.5 |
| Absolute slope median / 95th / max | 2.151 / 9.296 / 16.690 | 3.085 / 9.757 / 19.166 |
| Windows exceeding slope | 313 | 386 |
| Windows exceeding half-shift | 212 | 319 |
| Correlation: half-shift vs absolute slope | 0.869 | 0.827 |
| Rejects exclusively from half/slope | 315/341 (92.38%) | 365/421 (86.70%) |
| Rejects with any other failed gate | 26 | 56 |
| Longest consecutive passing full windows | 14 | 10 |
| First qualification | Not observed in 60.019 s | Not observed in 59.936 s |

Gate exceedance counts overlap. The half/slope correlation is partly structural because both summarize temporal changes in the same rolling window; it is not independent causal evidence. Failures are predominantly the trend gates responding to local ramps/reversals in a serially correlated signal, rather than occasional isolated extreme values. Neither recording sustains the passing run needed to complete the four-centre hold. All scored post-startup samples remain unqualified. Cold replay starts with empty history; historical state before the log is unknown, so this is not exact historical hold reconstruction.

A diagnostic sensitivity calculation subtracting only the fitted global line still rejects 334/586 and 420/584 windows, compared with 341 and 421 originally. Thus the single minute-scale linear drift explains little of the local gate failure count. This offline subtraction is not a proposed correction, tuning exercise or validation result. Curved slow wander contributes to centre drift, while fluctuations on window and shorter timescales remain important.

**Outliers:** capture 01 has no global robust outliers, despite 341 rejected windows. Capture 02 flags rows 62 and 326; only 32 full windows intersect these points. They cannot account for hundreds of rejections. Global screens can miss local spikes; this does not prove every residual is benign.

**Sampling:** capture 01 has only 99–101 ms intervals. Capture 02 has one 200 ms interval at row 283; its raw increment is +58 counts, not an extreme adjacent change. Accepted IDs remain contiguous. Excluding all windows touching either that gap or the two global outliers leaves 380/536 rejected windows (70.90%). The recorded gap therefore does not explain the failure population. Slope uses sample index, so the isolated longer interval changes its physical time interpretation. MCU timestamps cannot establish exact conversion timing, electrical pickup during reads, or effects from unrecorded ADC conversions.

No analysis here identifies the ADC, power supply, cable, platform mechanics or ambient environment as the cause. Mechanical motion/creep, sensor or excitation drift, electrical coupling and acquisition-related noise are hypotheses consistent with portions of the signal, not diagnoses. “Fixed cables” in capture 02 makes deliberate cable motion less plausible for that session; it does not eliminate cable pickup, thermal effects or platform motion.

## Single most informative controlled experiment

Perform an **A–B–A bridge-substitution experiment**, comparing the original empty load-cell assembly with a stable resistive bridge simulator at the sensor end of the existing cable, then restoring the original assembly. This directly separates the sensor/mechanical assembly from the retained cable, HX711, excitation, host and acquisition path. It is more discriminating at this stage than chasing one unconfirmed spectral frequency.

Use a simulator matched as closely as practical to the original bridge's excitation load and output impedance, with valid common mode and a small in-range differential offset. The manufacturer specifies a constrained common-mode and differential input range; use a proper bridge simulator rather than grounding both signal inputs. See the [AVIA HX711 datasheet, electrical characteristics](https://datasheet.lcsc.com/lcsc/Avia-Semicon-Xiamen-HX711_C43656.pdf). No exact resistor values can be specified without the installed bridge and wiring details.

Keep board, cable routing, excitation, power source, firmware, sampling/trace settings, Wi-Fi activity, host connection, gain, mounting and ambient conditions fixed. Allow the same recorded stabilization period after each connection, then capture five minutes per A/B/A phase, untouched, without tare or calibration. Preserve full raw logs and mark connection/settling periods separately. Extend this script's input list for those captures; compare the same predeclared metrics: local-baseline residual SD, half/slope distributions, rejection fraction, ACF and spectra, plus rolling-centre drift. Compare within-phase time blocks and whether the return A reproduces the initial A; do not rely on one p-value from overlapping windows.

If B strongly reduces short-scale residual noise and half/slope failures, and A returns to the earlier pattern, the evidence points toward the removed sensor/mechanical assembly or its coupling. If B retains the pattern, the retained electronics/cable/excitation/acquisition path remains implicated, without identifying which component. If A does not reproduce or source impedance/thermal conditions differ materially, the result is confounded. The simulator is not a physical weighing acceptance test and may change coupling or temperature sensitivity; improvement would narrow the investigation, not prove a defective load cell. This experiment is recommended, not performed.

## Commands and checks

```powershell
node scripts/compare-empty-hx711.mjs
node scripts/check-scale-replay.mjs
python scripts/test-capture-hx711.py
```

Comparison: both integrity validations and five deterministic numerical checks pass (linear detrending, quantile, known-frequency spectrum and ACF). Existing replay/capture regressions are also run separately. No recorded-stream C++ parity claim or threshold selection is made. The two minute-long captures are insufficient to establish long-term stationarity, environmental independence or physical noise origin.
