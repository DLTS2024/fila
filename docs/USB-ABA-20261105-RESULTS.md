# Controlled A1/B/A2 USB-port test

The earlier severe noise pattern **did not reproducibly follow USB port B**. Typical rolling spread is similar across all phases, B and A2 have no FULL_RANGE failures, and the only large excursion occurs on A1. B has somewhat more short-window trend failures, but also the longest passing run and highest hold. This single A/B/A cycle does not establish a port-dependent fault. Strict qualification never reaches 4/4.

No firmware, calibration, thresholds or stability policy was changed. Only host capture/analysis tooling was extended to support warm-up and multiple input paths. Each phase was started after explicit operator confirmation, and port changes were performed by the user between phases.

## Procedure and verification

All phases used `scripts/capture-hx711.py capture --port COM3 --warmup-seconds 120 --seconds 300 --label EMPTY_STATIC`. Warm-up occurred after opening the serial adapter and verifying device identity, on the same connection used for recording. This avoids silently placing warm-up before a possible adapter-open reboot. Firmware was not uploaded and no ZERO, CAL, ACCEPT or CANCEL commands were sent. Operator evidence states that mounting and load-cell cable placement were preserved and the platform was empty and untouched.

USB adapter hardware identity remained CP210x VID:PID 10C4:EA60, serial 0001. The earlier A enumeration was location 1-6; B was confirmed at 1-2, and A2 returned to 1-6. COM3 stayed the same, illustrating why the COM number alone cannot establish physical-port continuity.

| Capture | Warm-up requested | Accepted samples | Contiguous IDs | First-to-last sample duration | BEGIN-to-END duration |
|---|---:|---:|---|---:|---:|
| A1 | 120 s | 2997 | 11133–14129 | 299.964 s | 300.054 s |
| B | 120 s | 2996 | 1466–4461 | 299.956 s | 300.052 s |
| A2 | 120 s | 2998 | 1672–4669 | 300.048 s | 300.072 s |

For all phases: CSV, metadata JSON and serial log exist; metadata hash/count/complete flag, device/label and source-log path pass; every CSV sample ID, raw value, timestamp and external-reset array agrees with the existing shared diagnostic importer. Each END is USER, recordsLost=0, protocolLost=0 and lostReset=false. All CSV hashes are distinct. [Integrity evidence and hashes](usb-aba-20261105/integrity-comparison.json) preserves exact boundaries and export times. Completeness concerns accepted samples, not every physical conversion.

Saved captures are `captures/usb-aba-20261105-A1.csv`, `captures/usb-aba-20261105-B.csv`, and `captures/usb-aba-20261105-A2.csv`, each with `.csv.json` and `.csv.log` sidecars.

## Identical methods

The strict comparison reconstructs each full 16-sample ring using real pre-BEGIN samples, so there is one full-window evaluation per exported observation. Limits remain FULL_RANGE 400, CENTRAL_RANGE 220, MAD 70, HALF_SHIFT 35, SLOPE 2 counts/sample, LATEST 180 and CENTRE_SPAN 40; equality passes. Every actual reset is checked against replay for sample ID, reason, discarded pending and discarded hold.

BEGIN pending states are A1=4, B=0, A2=10; BEGIN hold is A1=0, B=0, A2=1. For A2 the inherited completed-centre value is not logged at BEGIN. The analyzer preserves the known count/pending but explicitly marks inherited centre values unknown, excluding them from numeric span statistics until the first reset. A2 commits a second centre at ID 1677, then the first reset at 1678 discards hold=2/pending=1. Subsequent centre history is fully reconstructible. No centre-span decision is inferred from invented prehistory. All logged reset reasons/discarded counts match, and there are no CENTRE_SPAN events. The first passing segment is left-censored where pre-BEGIN progress exists; the longest reported passing runs below are fully contained in the recordings and occur after resets.

This is the JavaScript mirror plus real-log parity, not a new shared-C++ recorded-stream or electrical validation. Host capture tests and the existing 170-check replay suite pass.

## Results

| Metric | A1 | B | A2 |
|---|---:|---:|---:|
| FULL_RANGE exceedances / observations | 17/2997 | 0/2996 | 0/2998 |
| FULL_RANGE failure percentage | 0.567% | 0% | 0% |
| Median / p95 rolling spread | 126 / 191 | 129 / 181.25 | 129 / 188 |
| Maximum spread | 3825602 | 220 | 235 |
| HALF_SHIFT exceedances | 550 (18.35%) | 714 (23.83%) | 604 (20.15%) |
| HALF_SHIFT median / p95 / maximum | 17.50 / 55.03 / 126.83 | 20.17 / 59.33 / 127.83 | 18.67 / 55.36 / 107.33 |
| SLOPE exceedances | 1014 (33.83%) | 1269 (42.36%) | 1127 (37.59%) |
| SLOPE median / p95 / maximum | 1.3794 / 4.6924 / 12.0809 | 1.6596 / 5.2938 / 11.3456 | 1.5022 / 4.8593 / 9.9926 |
| MAD exceedances | 0 | 0 | 0 |
| MAD median / p95 / maximum | 23 / 38 / 59.5 | 23.5 / 40 / 68 | 23.5 / 38.5 / 62 |
| CENTRAL_RANGE exceedances | 0 | 0 | 0 |
| LATEST exceedances | 2 | 0 | 0 |
| CENTRE_SPAN resets | 0 | 0 | 0 |
| Actual resets, all reasons | 1078 | 1321 | 1173 |
| Reset frequency per minute | 215.63 | 264.24 | 234.56 |
| Longest uninterrupted passing observations | 35 | 58 | 33 |
| Maximum hold | 2/4 | 3/4 | 2/4 |
| Qualified observations | 0 | 0 | 0 |

Individual gate exceedances overlap. Actual reset reason counts, in firmware priority order:

| Priority reason | A1 | B | A2 |
|---|---:|---:|---:|
| FULL_RANGE | 17 | 0 | 0 |
| HALF_SHIFT | 545 | 714 | 604 |
| SLOPE | 516 | 607 | 569 |

MAD, CENTRAL_RANGE, LATEST and CENTRE_SPAN produce no priority resets. No stale, raw-range or command resets occur within these recordings. Reset rates use actual first-to-last sample duration.

### A1's extreme excursion

The raw sequence around the event is:

```text
ID 12536:  125142 at 1255584 ms
ID 12537:   -8131 at 1255683 ms
ID 12538: 3817471 at 1255784 ms
ID 12539:  125166 at 1255883 ms
```

Two adjacent anomalous samples affect 17 consecutive full windows (one cluster), producing the enormous maximum spread. Under the identical local-median >400 screen A1 has two unique excursions, and its adjacent-jump >400 screen has three transitions. B and A2 have zero for both screens and zero FULL_RANGE clusters. Two samples, three jumps and seventeen failing windows are different views of the same short event, not seventeen independent hardware faults. The log validates that these are accepted readings, but does not locate the physical/communication cause. They are retained without filtering or repair.

Whole-record raw medians are A1=125200, B=125122, A2=124980. Their sequential shift shows that baseline evolution continues through the experiment; it is not safe to ascribe every between-phase difference to the USB port. Whole-record SD on A1 is dominated by the two extreme samples and should not be used alone as an ordinary-noise comparison.

## Interpretation and next test

The predicted signature of a simple port-specific large-noise problem would be low noise on A1, severe noise on B, then recovery on A2. That signature was not observed. B's ordinary median spread is nearly identical to A2, its p95 spread is slightly lower, and the rare large excursion appears only on A1. Trend statistics are modestly worse on B in this cycle, but three sequential sessions with correlated rolling windows cannot establish a reproducible port effect or quantify independent-session uncertainty. The best maximum hold on B also shows why one progress statistic is insufficient to rank signal quality.

All phases remain blocked by frequent trend failures before 64 uninterrupted passing observations. The absence of qualification is not a calibration or mass-accuracy result, and an empty static trace cannot validate motion safety. Keep firmware, calibration and stability policy unchanged.

The most useful next diagnostic is the already proposed **local known-stable bridge-simulator substitution**, with original cell/cable -> simulator at HX711 -> original cell/cable, while keeping host/power/logging fixed. It can localize the removed sensor/wiring/mechanical path versus the retained ADC/power/digital path. If instruments are available, capture DOUT/PD_SCK and supply/excitation around any recurrence of the extreme two-sample event; accepted timestamps alone cannot distinguish wire-level faults from analog disturbances. Another USB-port cycle could assess repeatability, but this cycle provides no basis to declare B defective or to relax stability policy.

## Artifacts and reproduction

- [All phases: distributions, reset counts, longest runs and hold transitions](usb-aba-20261105/strict/comparison.json).
- [A1 detailed range/excursion summary](usb-aba-20261105/A1/summary.json), [B summary](usb-aba-20261105/B/summary.json), [A2 summary](usb-aba-20261105/A2/summary.json).
- Per-observation strict traces are saved beside `strict/comparison.json`.

```powershell
node scripts/analyse-strict-capture.mjs captures/usb-aba-20261105-A1.csv captures/usb-aba-20261105-B.csv captures/usb-aba-20261105-A2.csv
python scripts/analyse-five-minute-range.py --source captures/usb-aba-20261105-A1.csv --output-dir docs/usb-aba-20261105/A1
python scripts/analyse-five-minute-range.py --source captures/usb-aba-20261105-B.csv --output-dir docs/usb-aba-20261105/B
python scripts/analyse-five-minute-range.py --source captures/usb-aba-20261105-A2.csv --output-dir docs/usb-aba-20261105/A2
```

The range/excursion summaries use entirely-in-CSV windows, while the strict comparison includes reconstructed boundary windows. Reported strict table values consistently use the latter method for all phases.
