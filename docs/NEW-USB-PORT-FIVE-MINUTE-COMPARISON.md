# New USB-port five-minute comparison

The new recording is materially quieter than the previous recording: FULL_RANGE failures fall from 76.69% to zero, the median rolling spread falls from 998 to 132 counts, and the large local excursions and adjacent jumps disappear under identical screens. This establishes improvement in the recorded signal, but one before/after pair does not establish that the USB port alone caused it. Strict four-centre qualification is still never achieved. No firmware or calibration was changed.

## Integrity before analysis

Both CSVs, metadata sidecars and serial logs exist and pass verification. [Integrity evidence](new-usb-port-range-analysis/integrity-comparison.json) retains their hashes, metadata export timestamps, sample boundaries, and BEGIN/END records.

| Check | Previous capture | New capture |
|---|---|---|
| CSV filename | empty-continuous-5min-d5d86874a80e454bb4feb1b8408ae372.csv | empty-new-usb-port-5min-20261105-151307.csv |
| Accepted samples | 2997 | 2995 |
| Contiguous sample IDs, inclusive | 11884–14880 | 614–3608 |
| First / last device milliseconds | 1190503 / 1490371 | 61931 / 361890 |
| First-to-last duration | 299.868 s | 299.959 s |
| BEGIN-to-END trace duration | 300.052 s | 300.054 s |
| Median / maximum sample interval | 100 / 201 ms | 100 / 201 ms |
| Metadata export time, UTC | 2026-10-31 18:21:49.320408 | 2026-11-05 09:52:15.562238 |
| END reason | USER | USER |
| recordsLost / protocolLost / lostReset | 0 / 0 / false | 0 / 0 / false |

Metadata schema/source, complete flag, device identity, EMPTY_STATIC labels, source-log path, CSV SHA256 and exact row count pass. Every CSV row agrees with the existing shared log importer's reconstructed sample ID, raw value, device timestamp and external reset array. The importer passes its completeness, timing, reset and overlapping-record consistency checks. Both captures cover BEGIN accepted+1 through END accepted without a missing exported sample. Completeness concerns accepted conversions; it does not certify every analog conversion or unrelated serial text.

New CSV SHA256 is `8a778756ff17e0e351c39eb90b9c97c68ac1d353081b80fbbef8b4f8a797867e`; previous is `20f99bd2588a124c6552bd2f3aae3945a2463c5d6e402c54b94255b81dfa039c`. Their contents, device-ID sequence and export timestamps are distinct. The filename's 151307 suffix was reserved during the earlier failed attempt; the metadata identifies the actual successful export. The operator annotation explicitly identifies the new PC USB port and stationary empty condition.

## Identical criteria

Both captures were rerun through `scripts/analyse-five-minute-range.py` using the same unchanged source/config. FULL_RANGE means maximum minus minimum >400 counts in each chronological rolling 16-sample window; equality passes. Windows involving pre-CSV samples are excluded from the comparative denominator. Local excursions use the median of up to ten preceding and ten following samples, excluding the current sample and truncating at boundaries. Adjacent jumps use absolute differences of successive accepted raw readings. These are descriptive excursion/jump screens, not added production acceptance thresholds. A failure cluster is a maximal run of consecutive failing window ends.

## Results

| Metric, raw counts unless stated | Previous | New |
|---|---:|---:|
| Full CSV windows | 2982 | 2980 |
| FULL_RANGE failing windows | 2287 | 0 |
| FULL_RANGE failure percentage | 76.69% | 0.00% |
| All-window spread p5 / median / p95 | 157 / 998 / 2317 | 88 / 132 / 190 |
| All-window spread p99 / maximum | 3113 / 3321 | 226 / 253 |
| Failing-window median / maximum spread | 1214 / 3321 | N/A: no failures |
| Unique local-median excursions >200 | 868 | 0 |
| Unique local-median excursions >400 | 491 | 0 |
| Unique local-median excursions >800 / >1600 | 217 / 41 | 0 / 0 |
| Maximum absolute local-median excursion | 3058.5 | 152.5 |
| Adjacent jumps >200 | 811 | 0 |
| Adjacent jumps >400 | 479 | 0 |
| Adjacent jumps >800 / >1600 | 150 / 16 | 0 / 0 |
| Jumps >400 per minute | 95.84 | 0 |
| Maximum absolute adjacent jump | 2483 | 148 |
| FULL_RANGE clusters | 14 | 0 |
| Median / maximum windows per cluster | 72 / 809 | N/A |
| Longest cluster, first-to-last failing end | 80.948 s | N/A |
| Unique samples at failing-window extrema | 668 | 0 |

The median all-window spread falls 86.77%; maximum spread falls 92.38%. Do not compare the old failing-window median 1214 with a new all-window median as if denominators matched. The previous serial log has 2300 FULL_RANGE events, including 13 windows with pre-CSV history; the new log has none, including its boundary windows.

The previous >400 local excursions form 211 consecutive-sample runs, and its >400 adjacent jumps form 261 consecutive-transition runs; both counts are zero in the new recording. A departure and return can count as two jumps. Neither jump counts nor rolling-window counts represent independent physical fault events.

Raw min/median/max change from -73403/-70335/-69463 to 124828/125129/125328. Whole-record population SD falls from 521.89 to 75.22 counts, but includes baseline wander and must not be called pure electronic noise. The large sign/offset change cannot be attributed to a particular gain, wiring change, calibration or USB supply mechanism from these recordings. Neither raw offset is an accurate mass without valid calibration.

## Remaining stability and causal limits

With all current gates retained, cold-start replay rejects 1280/2980 new full windows (42.95%), versus 2800/2982 previously (93.90%). New first-priority resets are HALF_SHIFT 727, SLOPE 551 and MAD 2. Maximum hold improves from 0/4 to 2/4, but neither recording qualifies at 4/4. Replay starts without pre-capture hold history and does not reproduce the exact historical startup state. Cleaner FULL_RANGE behavior is not successful calibration, accuracy verification or permission to save a measurement.

The new trace begins around 61.9 seconds of device uptime, while the old begins around 1190.5 seconds. These sessions occurred on different dates and have a large raw offset difference. Operator annotations support an unloaded stationary condition, but do not independently control temperature, mounting strain, contact state, cable geometry or power history. The comparison demonstrates a large observed improvement after the USB-port change, rather than a reproducible isolated USB-port causal effect. An A/B/A repeat with fixed hardware/cable placement and warm-up conditions is needed to attribute it to the port; retain the current safety/calibration rules throughout.

## Artifacts and reproduction

- [New numerical summary](new-usb-port-range-analysis/summary.json), [all sample excursions](new-usb-port-range-analysis/sample-excursions.csv), and [FULL_RANGE event audit](new-usb-port-range-analysis/all-logged-full-range-events.json).
- [Previous numerical summary](five-minute-range-analysis/summary.json) and [previous detailed analysis](FIVE-MINUTE-FULL-RANGE-ANALYSIS.md).

```powershell
python scripts/analyse-five-minute-range.py
python scripts/analyse-five-minute-range.py --source captures/empty-new-usb-port-5min-20261105-151307.csv --output-dir docs/new-usb-port-range-analysis
```

Only offline reports were written. Capture files, firmware, thresholds and calibration requirements were preserved.
