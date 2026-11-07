# Five-minute HX711 FULL_RANGE audit

The accepted readings contain frequent, predominantly negative excursions and baseline movement. FULL_RANGE is behaving as configured; the evidence does not identify the physical cause. No firmware, production limits or calibration requirements were changed.

## Evidence and reproducibility

Source: `captures/empty-continuous-5min-d5d86874a80e454bb4feb1b8408ae372.csv`, its metadata and serial log. Metadata describes a bare 40 kg load cell, unloaded and untouched, with stationary HX711/cables. This is operator evidence, not independent instrumentation. The capture is 2,997 samples over 299.868 seconds. CSV SHA256 matches metadata: `20f99bd2588a124c6552bd2f3aae3945a2463c5d6e402c54b94255b81dfa039c`.

Run `python scripts/analyse-five-minute-range.py`. Only offline report files are written. The existing FULL-log importer also passed; accepted CSV raw/ID/time values matched its reconstructed data during review. All 2,287 entirely-in-CSV failing windows matched the existing JavaScript formula mirror. This is not a new recorded-stream C++ parity or physical hardware test.

Audit files:

- [All 2,300 logged FULL_RANGE events](five-minute-range-analysis/all-logged-full-range-events.json): reset ID, limit, actual spread, extrema IDs, and all 16 contributing raw values with timestamps for **every event**.
- [2,287 entirely-in-CSV failing windows](five-minute-range-analysis/full-range-windows.csv), also available as [JSON](five-minute-range-analysis/full-range-windows.json).
- [Every sample and local excursion](five-minute-range-analysis/sample-excursions.csv).
- [Failure clusters](five-minute-range-analysis/failure-clusters.json) and [full numerical summary](five-minute-range-analysis/summary.json).

There are **2,300 logged events**, versus **2,287 failing windows entirely contained in the CSV**. Thirteen logged windows use pre-CSV samples retained by the firmware. The audit verifies every logged range/value/limit and verifies that removing those boundary windows produces exactly the CSV failure list. CSV distribution and clustering statistics below exclude that prehistory; the serial log importer recovers 16 pre-BEGIN samples in addition to the exported 2,997 samples.

## Configured gate and window evidence

`RAW_HARD_RANGE=400` counts, window length 16. Failure is `max(raw)-min(raw)>400`; equality passes. FULL_RANGE is the first reset priority. It does not mean the latest sample alone is anomalous, and it does not identify which physical component failed.

2,287/2,982 full CSV windows fail FULL_RANGE: **76.69%**. Among failing windows, spread is minimum 402, median 1,214, p95 2,359, maximum 3,321 counts. These are actual full spreads, not trimmed ranges.

The first entirely-in-CSV window (IDs 11884–11899) has minimum -71552 at ID 11884 and maximum -71046 at ID 11894: spread 506. This window spans a changing baseline rather than one obvious isolated impulse.

One maximum-spread window is IDs 12976–12991, device times 1299865–1301367 ms:

```text
[-70210,-70164,-70228,-70285,-70281,-70209,-70227,-70263,
 -70174,-70453,-72182,-73297,-72044,-70848,-70217,-69976]
```

Minimum -73297 is ID 12987; maximum -69976 is ID 12991. Spread 3,321 exceeds the 400 limit by 2,921 counts. This is a multi-sample dip and recovery; blaming a single bad latest sample would misdescribe it. Other maximum-spread windows can share those same extrema.

## Raw distribution and descriptive spike screens

All quantities are counts; no saved calibration or grams conversion is assumed.

| Raw statistic | Value |
|---|---:|
| Minimum / maximum | -73403 / -69463 |
| Whole-record range | 3940 |
| Mean / median | -70424.75 / -70335 |
| Population SD | 521.89 |
| p1 / p5 | -72162.8 / -71257.2 |
| p25 / p75 | -70755 / -70014 |
| p95 / p99 | -69744 / -69585.92 |

Whole-record SD includes baseline movement and excursions; it is not an independent electronic noise estimate. Ten-second means move from -71164.39 initially to -69892.85 finally, a +1271.54-count difference.

“Spike” has no unique definition in these data. Two explicit descriptive screens are reported; neither is a new production threshold nor proof of a bad conversion.

| Absolute adjacent change | Transitions / 2,996 | Rate per minute | Unique endpoint samples |
|---|---:|---:|---:|
| >200 | 811 | 162.27 | 1139 |
| >400 | 479 | 95.84 | 740 |
| >800 | 150 | 30.01 | 268 |
| >1600 | 16 | 3.20 | 32 |

The 479 changes above 400 have median magnitude 644, p95 1413.4 and maximum 2483. The maximum change is ID 12730: -70395 to -72878 in 100 ms. Across all adjacent changes, median absolute change is 72 and p95 is 798.75. A departure and recovery can count twice here; 479 transitions are not 479 independent physical events.

A second screen measures each sample against the median of its nearest ten preceding and ten following samples, excluding itself and truncating at capture edges. This approximately two-second local reference reduces confusion with slow baseline movement, but can still be displaced by bursts or real motion. It uses future data and is analysis only.

| Absolute local-median excursion | Unique samples | Consecutive sample runs | Failing windows containing one |
|---|---:|---:|---:|
| >200 | 868 | 307 | 2279 |
| >400 | 491 | 211 | 2207 |
| >800 | 217 | 128 | 1626 |
| >1600 | 41 | 32 | 496 |

At >400, 478 of 491 excursions are negative. All 217 >800 excursions are negative. The >400 excursion magnitude has median 743.5, p95 1900.25, maximum 3058.5 counts. There are also 43 three-sample spike/return centres with both adjacent jumps >400, opposite signs, and the two neighbors within 400 of one another. This deliberately narrow pattern excludes longer dips; its tolerance changes with the chosen screen, so counts at different screens are not nested.

The correct distinction is **2,287 failing rolling windows versus 491 unique samples under the declared >400 local-excursion definition**, not a claim of 491 proven corrupt ADC readings. Eighty failing windows contain no such sample: a >400 max–min spread can occur with both extrema within 400 of the local reference. The 668 unique samples serving as a failing-window minimum or maximum and the 2,363 samples appearing anywhere in failing windows are separate descriptive counts, not anomaly counts.

## Clustering

The 2,287 failing windows form 14 consecutive-window runs. Only one run is a single failing window. The largest has 809 windows, end IDs 12421–13229, spanning 80.948 seconds between window ends; the next largest has 326 windows over 32.518 seconds. A rolling-window run is not a single disturbance event: disturbances spaced less than a window apart merge in this view.

The first 50 seconds contain only one entirely-in-CSV FULL_RANGE failure. Around 53.7 seconds, a long failing run begins; the 60–130 second bins have every full window failing. Later failures recur with short gaps. This changing regime and strongly negative tail are more specific than a claim of homogeneous random noise throughout five minutes. Overlap expands each excursion's impact: one sample can belong to up to 16 windows, and multiple nearby excursions combine. Do not treat window counts as independent event statistics.

## Earlier DEBUG SNAPSHOT comparison

The earlier [583623–585123 ms snapshot](HX711-SNAPSHOT-583623-ANALYSIS.md) has 16 samples, range -21967 to -21812, spread **155**, MAD **30**, half-shift **22**, and clipped slope **5.010294 counts/sample**. It fails SLOPE while passing FULL_RANGE. Intervals are 99–101 ms. It contains transient dips/recovery and an overall negative tendency, not a clean ramp.

The five-minute capture has much larger excursions and frequent >400 full spreads; it is not merely the same slope-only problem repeated. Its usual sample interval is also 99–101 ms (median 100), with maximum 201 ms and no >500 ms accepted-sample interval. Regular completion timestamps do not establish correct serial bit timing. Different raw offsets and intervening hardware/session conditions prevent direct claims of gain change, calibration change or a particular component failure. A 16-point snapshot cannot estimate a five-minute spike rate, and the earlier baseline cannot be subtracted from the later capture as if conditions were identical.

## What can and cannot be diagnosed

| Hypothesis | What this evidence supports | Missing discriminator |
|---|---|---|
| Electrical interference / supply or reference disturbance | Bursty excursions and baseline wander are compatible | Synchronized excitation, supply, ground and differential-input measurements; no mains-frequency attribution from ~10 Hz accepted samples |
| HX711 communication/read fault | Accepted values could in principle be affected; ordinary timestamps do not rule this out | Actual DOUT/PD_SCK waveform and independent 24-bit decode correlated with logged samples |
| Load-cell wiring/contact issue | Intermittent bridge/contact changes could produce dips, recovery or drift | Controlled substitution of sensor/cable path, connector resistance/continuity evidence and electrical measurements |
| Mechanical strain, support changes, vibration or creep | Smooth baseline movement and multi-sample excursions are compatible | Independent motion/strain observation or a mechanically invariant electrical bridge substitute |

No ADC saturation values occur in the accepted CSV, but the firmware rejects rail values before export; absence here does not prove none occurred upstream. The validated serial diagnostic log provides acquisition integrity, not an analog measurement or a wire-level integrity check. There is no established bit-error signature, no proven EMI frequency and no basis to name a failed load cell, HX711 or solder joint from raw shape alone. “Untouched” makes deliberate loading less likely; it does not eliminate strain relaxation, vibration, supply changes or contact effects.

## Most useful next hardware test

Perform an **A/B/A bridge-substitution test**: A = current unloaded cell and cable; B = a known-stable bridge simulator/dummy bridge connected locally at the HX711 input; A = reconnect the original cell and cable. Power off to swap. Use a bridge simulator with excitation/common-mode and differential output appropriate for this HX711 configuration; do not leave inputs floating or improvise a connection to ground. Do not tare, calibrate, flash firmware or change gain/limits. Keep power, host, cable routing, logging, warm-up protocol and surroundings fixed; record at least five minutes in each phase and repeat if the two A phases disagree.

Compare exactly the same distribution, local excursion, adjacent-change and failure-cluster metrics. If B improves and returning A reproduces excursions, the removed cell/cable/mechanical path is implicated, but wiring versus mechanical versus interference pickup remains unresolved. If B retains comparable excursions, investigate the retained HX711/power/ground/digital path; this does not by itself prove the HX711 silicon is defective. Substitution changes impedance and pickup geometry, so interpret improvement as localization evidence, not a conclusive component verdict.

If instrumentation is available, correlate DOUT/PD_SCK and supply/excitation with this capture. Independently decode the 24-bit signed result and check 25 clocks for channel A/gain 128 and pulse timing: the manufacturer's datasheet specifies PD_SCK high time up to 50 microseconds, and high longer than 60 microseconds invokes power down. See the [AVIA HX711 datasheet](https://datasheet.lcsc.com/lcsc/Avia-Semicon-Xiamen-HX711_C43656.pdf). These are diagnostic checks, not faults established by this recording.
