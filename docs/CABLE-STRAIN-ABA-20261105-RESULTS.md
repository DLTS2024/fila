# Cable-strain A1/B/A2 diagnostic

This cycle does **not** demonstrate a reversible cable-position effect. Typical rolling spread, trend failures, passing runs and reset rate are similar in A1, supported-cable B and restored-position A2. B and A2 each contain one identical anomalous raw value, -8132. Returning the cable to its original position neither eliminates that event nor returns the baseline toward A1. This is evidence against treating external slack repositioning as a demonstrated fix, not proof that wiring or mechanical strain is fault-free.

No firmware, calibration, production thresholds or stability policy was changed. Only existing hardware was used. Capture commands were diagnostic only. The operator confirmed an unloaded 10 kg load cell, unchanged mounting and solder joints, with powered-off external cable repositioning/restoration. Those physical actions are operator evidence rather than independently instrumented observations.

## Procedure and capture verification

Each accepted phase used 120 seconds of warm-up after opening the identity-verified serial connection, then 120 seconds recording on that same connection. COM3's CP210x adapter was verified at USB location **1-6** for all three accepted phases.

The initial B attempt enumerated at 1-2. It was stopped during warm-up, with only `captures/cable-strain-aba-20261105-B.csv.log` retained. The user confirmed the accidental USB-port change and returned to A1's port. **That partial attempt is excluded**. The valid B capture uses suffix `B-retry01`. Extra unplugging/time during that correction is a limitation of this cycle, not an additional accepted phase.

| Phase | Capture basename | Samples | Inclusive accepted IDs | First-to-last sample duration | BEGIN-to-END duration |
|---|---|---:|---|---:|---:|
| A1 | cable-strain-aba-20261105-A1.csv | 1198 | 10663–11860 | 119.963 s | 120.069 s |
| B | cable-strain-aba-20261105-B-retry01.csv | 1199 | 2110–3308 | 119.956 s | 120.052 s |
| A2 | cable-strain-aba-20261105-A2.csv | 1196 | 6022–7217 | 119.976 s | 120.052 s |

All three CSVs, metadata JSONs and serial logs exist. Metadata CSV hashes, source-log paths, labels, device identity, complete flag and sample counts pass. Every CSV ID, timestamp, raw value and external reset array agrees with the existing diagnostic log importer. IDs are contiguous, diagnostic overlaps agree, and all END records report USER, recordsLost=0, protocolLost=0 and lostReset=false. Distinct hashes and export times confirm separate captures. [Integrity evidence](cable-strain-aba-20261105/integrity-comparison.json) preserves hashes and BEGIN/END records. Completeness concerns accepted samples, not every physical ADC conversion.

## Identical analysis

The strict analysis uses each real pre-BEGIN ring to evaluate a full rolling 16-sample window for every exported observation. BEGIN hold is zero in all phases; pending is 0/0/1 for A1/B/A2. Replay retains those pending states. Every actual reset matches replay on sample ID, reason, discarded pending and discarded hold. This is shared importer plus JavaScript formula-mirror validation, not a new hardware or recorded-stream C++ parity test.

Existing limits are unchanged: FULL_RANGE 400, CENTRAL_RANGE 220, MAD 70, HALF_SHIFT 35, SLOPE 2 counts per accepted sample, LATEST 180 and CENTRE_SPAN 40. Failure means strictly above the limit. Local excursions use a leave-one-out median of up to ten samples before and ten after, truncated at boundaries; adjacent jumps use successive accepted readings. These descriptive screens are identical across phases and are not new production gates.

## Results

| Metric, counts unless stated | A1 | B | A2 |
|---|---:|---:|---:|
| Raw median | 124937 | 124917 | 124790 |
| Raw p5 / p95 | 124778 / 125047 | 124817.9 / 125004 | 124675 / 124931 |
| Raw mean | 124927.67 | 124803.93 | 124682.41 |
| Raw minimum / maximum | 124635 / 125159 | -8132 / 125096 | -8132 / 124999 |
| FULL_RANGE failures | 0 | 16 (1.334%) | 16 (1.338%) |
| Rolling spread median / p95 | 130 / 193 | 127 / 179 | 133 / 210 |
| Rolling spread p99 / maximum | 218 / 224 | 133077 / 133091 | 132878 / 132887 |
| HALF_SHIFT exceedances | 268 | 256 | 271 |
| HALF_SHIFT median / p95 / maximum | 18.92 / 57.72 / 101.33 | 19.67 / 54.72 / 82.67 | 19.75 / 59.83 / 115.67 |
| SLOPE exceedances | 484 | 475 | 469 |
| SLOPE median / p95 / maximum | 1.6044 / 4.9663 / 8.5456 | 1.6118 / 4.8326 / 8.2544 | 1.5404 / 5.8908 / 10.5647 |
| MAD exceedances | 0 | 0 | 0 |
| MAD median / p95 / maximum | 23.5 / 37.5 / 51.5 | 24 / 37 / 55 | 23.5 / 45 / 61.5 |
| CENTRAL_RANGE exceedances | 0 | 0 | 0 |
| LATEST exceedances | 0 | 1 | 2 |
| CENTRE_SPAN resets | 0 | 0 | 0 |
| Unique local excursions >400 | 0 | 1 | 1 |
| Adjacent jumps >400 | 0 | 2 | 2 |
| FULL_RANGE clusters | 0 | 1 (16 windows) | 1 (16 windows) |
| Longest passing run | 27 | 27 | 28 |
| Maximum hold | 1/4 | 1/4 | 1/4 |
| Total actual resets | 503 | 505 | 506 |
| Actual resets per minute | 251.58 | 252.59 | 253.05 |

Exceedances overlap. Actual first-priority resets are HALF_SHIFT=268/256/271, SLOPE=235/233/219, FULL_RANGE=0/16/16. There are no other reset reasons during accepted traces. For example, LATEST exceedances in B/A2 do not create extra resets beyond FULL_RANGE's earlier priority. The maximum locally passing centre spans are 12 / 13.0833 / 16.8333; the 40-count gate is not the blocker. Runs never approach the 64 consecutive passing observations required for four completed centres. None qualifies.

The auxiliary range/excursion summaries exclude windows crossing the CSV boundary; the strict table above consistently includes reconstructed boundary windows for every phase. These choices do not change the recorded spike counts, but their denominators should not be mixed.

### Recurrent anomalous value

```text
B:  ID 2677, 268418 ms: 124900
    ID 2678, 268518 ms:  -8132
    ID 2679, 268718 ms: 124913

A2: ID 6652, 666742 ms: 124728
    ID 6653, 666842 ms:  -8132
    ID 6654, 667041 ms: 124687
```

Each event is one unique sample, two adjacent jumps and sixteen failing overlapping windows. Each is followed by a roughly 200 ms interval (200/199 ms), but that association alone does not prove a communication error or identify whether an analog, power or digital disturbance occurred first. The exact repeated -8132 value is worth retaining as a diagnostic signature. A near-identical -8131 occurred in the earlier USB A1 test, so this signature is not exclusive to the supported cable position. No sample was removed or repaired.

Whole-record SD is dominated by the single spike in B/A2 (about 3841/3843 counts versus 82.52 on A1), and cannot be interpreted as ordinary sensor noise. The ordinary p95 rolling spread and robust raw quantiles give a clearer comparison. The baseline median changes -20 counts from A1 to B, then another -127 from B to A2; restoration does not yield a reversal. Slow drift, time since power connection, thermal/mechanical settling and contact state remain confounders. Equal waits do not establish equal component temperature or independent sample windows.

## Conclusion and next action

There is no repeatable improvement from supporting the external slack in this cycle, nor a reversible baseline change that identifies cable strain. One rare event in each of B and A2 is insufficient to estimate a cable-dependent fault rate. The powered-off intervention also intentionally does not record the immediate signal during cable movement, so it cannot exclude transient sensitivity. The incorrect-port warm-up was excluded but adds intervening power/time history. This test cannot rule out cable-entry strain, intermittent wiring, electrical interference, power disturbances or HX711 digital-read faults.

With only the existing equipment, the useful next step is a longer stationary capture on the fixed original port with the cable safely supported and no further movement, to measure recurrence of the -8132 signature and preserve pre/post raw/timing evidence. A repeated cable A/B/A cycle could assess reproducibility, but would still not isolate analog wiring from digital readout. Direct attribution would require additional independent electrical/timing measurements or a known-stable substitute. Neither this result nor the prior USB test justifies changing production thresholds, calibration requirements or stability policy.

## Artifacts

- [Strict gate distributions and state progression for all phases](cable-strain-aba-20261105/strict/comparison.json); per-observation traces are beside this file.
- [A1 range/excursion summary](cable-strain-aba-20261105/A1/summary.json), [B summary](cable-strain-aba-20261105/B/summary.json), [A2 summary](cable-strain-aba-20261105/A2/summary.json).
- [Capture integrity comparison](cable-strain-aba-20261105/integrity-comparison.json).

Reproduce strict analysis from the repository root:

```powershell
node scripts/analyse-strict-capture.mjs --output-dir docs/cable-strain-aba-20261105/strict captures/cable-strain-aba-20261105-A1.csv captures/cable-strain-aba-20261105-B-retry01.csv captures/cable-strain-aba-20261105-A2.csv
```

Existing 170-check replay regression and both capture workflow tests pass. Only captures and offline reports were written during this phase; production firmware and calibration were untouched.
