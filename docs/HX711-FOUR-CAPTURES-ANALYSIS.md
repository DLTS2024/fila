# Four recorded HX711 captures — offline analysis

All four captures pass reconstruction and CSV/metadata integrity checks. Current thresholds and every existing candidate fail to qualify on every stationary interval. Wider slope/half limits reduce local rejection but do not restore availability. These recordings cannot select safe replacement thresholds or measure revocation from an already qualified state. No firmware, production thresholds, calibration, or inventory behavior was changed.

Full reproducible counts, thresholds, hashes, interval IDs, and metrics are in [HX711-FOUR-CAPTURES-RESULTS.json](HX711-FOUR-CAPTURES-RESULTS.json). Analysis code: [analyse-recorded-hx711.mjs](../scripts/analyse-recorded-hx711.mjs).

## Integrity and provenance

| Capture | Samples / accepted IDs | Duration | Interval min–max / mean (ms) |
|---|---|---|---|
| empty-static | 601 / 537–1137 | 60.019 s | 99–101 / 100.032 |
| 275g-static | 599 / 1596–2194 | 59.920 s | 99–200 / 100.201 |
| loading | 300 / 2932–3231 | 29.913 s | 99–101 / 100.043 |
| unloading | 299 / 3656–3954 | 29.916 s | 99–199 / 100.389 |

The FULL-log importer verifies one BEGIN/END, normal USER termination, zero record/protocol loss, no lost resets, contiguous reset IDs/counts, consistent overlapping raw/time snapshots, accepted IDs, timing summaries, full tail coverage, and reported local reset formula/value/limit/priority. CSV sample IDs, raw values, MCU times and external reset arrays match reconstructed logs exactly. Metadata schema, completeness, source, initial state, device, labels, counts and CSV SHA256 all pass. Log SHA256 and firmware/config hashes are retained in JSON. Hashes establish consistency, not independent authenticity or proof of firmware binary identity. Export times follow capture ordering; absolute sourceLog paths are provenance only.

Each raw log includes 16 real samples before BEGIN's accepted counter; the CSV correctly excludes these. IDs are contiguous within each capture; gaps between captures are separate unrecorded periods, not interpolated data. The 199/200 ms intervals are real acquisition timing gaps, below the 500 ms freshness limit; contiguous accepted IDs do not prove every ADC conversion was acquired. Timestamps mean MCU accepted-read completion, not host time or physical motion onset. Metadata weight and stationarity are operator claims, not independently verified mass or video evidence.

## Signal change points and provisional intervals

Intervals below use **1-based CSV rows**, determined by inspecting raw chronology and ten-sample medians before replaying candidates. They do not use hold, QUIET or reset outputs. They describe stationary-load plateaus, not constant ADC output. Raw noise, drift and creep remain present; raw values alone cannot certify physical immobility or a precise settling time. Shoulder intervals are deliberately unscored as either static or motion.

| Capture | Stationary plateau | Uncertain onset | Clear transition | Uncertain settling | Stationary-load plateau |
|---|---|---|---|---|---|
| loading | 1–168 | 169–173 | 174–178 | 179–190 | 191–300 |
| unloading | 1–78 | 79 | 80–82 | 83–100 | 101–299 |

Loading: pre-step median is about −21,000 counts. Rows 169–173 rise to −20,831…−20,806, potentially contact or ordinary fluctuation. Row 174 drops to −22,814, then −36,279, −49,210, overshoots to −54,544 and rebounds to −52,120 at 178. Row 179 is −50,738. The clear step starts 17.309 s after the first CSV sample, not at the nominal ten seconds. The post-step plateau continues to wander (ten-sample medians approximately −50,842 to −50,640); row 191 is a conservative descriptive cutoff, not proven cessation.

Unloading: the pre-step plateau is about −51,000. Row 79 follows a 199 ms interval and leaves onset timing uncertain. Rows 80–82 are −47,731, −32,502, −22,069; row 83 reaches −21,225. Clear departure starts at 8.007 s, not ten seconds. Post-step values drift and fluctuate around −21,000 to −21,300. Rows 83–100 are a conservative settling shoulder. Exact physical cessation needs independent observation. Empty-static and 275g-static are scored as static based on their capture evidence.

## Threshold comparison

All gates except slope and half-shift remain fixed: full spread 400, central spread 220, MAD 70, latest delta 180, centre-span 40 counts; 16-sample windows and four-centre hold. Slope is counts per accepted sample. Equality passes. Existing candidate definitions were used unchanged; 5.25/40 is a snapshot-boundary probe, not a recommendation.

Local false rejection = rejected all-static 16-sample windows / all-static full windows. Mixed and unknown windows are excluded. Loading/unloading numbers are provisional plateau false rejection, conditional on inferred labels.

| Slope / half | Empty / 586 | 275g / 584 | Loading plateaus / 248 | Unloading plateaus / 247 |
|---|---:|---:|---:|---:|
| **2 / 35 current** | **341 (58.19%)** | **413 (70.72%)** | **170 (68.55%)** | **161 (65.18%)** |
| 3 / 35 | 257 | 352 | 145 | 142 |
| 4.5 / 35 | 226 | 318 | 135 | 131 |
| 2 / 40 | 336 | 403 | 163 | 156 |
| 3 / 40 | 249 | 330 | 134 | 135 |
| 4.5 / 40 | 214 (36.52%) | 289 (49.49%) | 117 (47.18%) | 120 (48.58%) |
| 5.25 / 40 | 211 | 281 | 117 | 116 |

Current empty-static resets: HALF_SHIFT 198, SLOPE 121, MAD 19, CENTRAL_RANGE 2, LATEST 1. Loaded-static: HALF_SHIFT 255, SLOPE 108, MAD 21, FULL_RANGE 17, CENTRAL_RANGE 11, LATEST 1. Priority counts can mask simultaneous failures; JSON also reports every local gate failure. Wider trend gates cannot eliminate other noise failures or guarantee 64 uninterrupted qualifying observations and acceptable centre span.

**First qualification:** never observed for any set on any of the six stationary intervals. Delays are right-censored, not zero or infinity: empty 60.019 s; 275g 59.920 s; loading pre/post 16.710/10.903 s; unloading pre/post 7.707/19.810 s. Every set is unqualified on 100% of scored static samples after each segment's first 63 observations. No recovery qualification was observed after either transition.

**Transition exposure:** all sets have 0 qualified samples and 0 ms false-stable exposure in the clear loading interval (5 samples, 0.402 s first-to-last) and unloading interval (3 samples, 0.199 s). Including both uncertain shoulders gives 0/22 samples in each direction. These short steps do not test sustained slow movement or establish safety. Samples and overlapping windows are correlated; there are only two transition events from one recording session.

**Motion rejection latency:** not measurable for any set because all are already unqualified before the transition. Every set locally rejects the first clearly displaced sample (0 ms sampled delay from that signal-defined onset); that is not a measured revocation time, nor a bound on physical motion detection latency between reads. Do not report this as successful immediate revocation.

## Cold start, separation and limitations

CSV replay begins with empty ring/hold state although metadata says initialState unknown. It does not reproduce historical qualification at capture start. Sensitivity replay including each log's real 16-sample prefix still produces zero qualified CSV samples for every set. Earlier centres/pending history remain unavailable. Current raw-log local reset metrics are verified against the mirror, but no C++ compiler was available on PATH for a new recorded-stream C++ parity run. Existing 170-check replay regressions cover formula, priority, hold progression and synthetic risks; they are not full recorded-trace C++ parity proof.

Candidates pre-exist this analysis; none was fit, expanded or selected using these recordings. All four captures are **exploratory evidence**. They were recorded close together on the same device, so assigning one to tuning and one to validation would not establish independent session generalization. No held-out production validation claim is made. Plateau labels were inferred from the same raw data and must be independently checked; broad shoulders test label sensitivity only. Raw qualification does not measure mass accuracy or calibrated eligibility. Logged USB reports include CALIBRATION_REQUIRED; replay does not bypass it.

## Decision and further captures

Retain production settings pending stronger evidence; none of these candidates solves observed static qualification starvation. Do not widen further on these same traces. First establish acceptable qualification delay, smallest relevant mass change, maximum revocation delay and allowable false-stable events.

Collect independent sessions on different warm-up/thermal/power/mounting conditions: repeated long empty, 275g, representative and maximum-load plateaus; slow and fast placement/removal, small increments, creep, oscillation, touch and vibration, in both directions. Use synchronized video or independently timestamped operator events for onset/cessation and preserve uncertain timing bounds. Start each revocation trial after **observed raw qualification**, retain sufficient prehistory to reconstruct hold, and continue through a long post-motion plateau. If qualification cannot be achieved, document that failed prerequisite rather than declaring motion safety. Capture faults/gaps separately.

Use one declared development batch for any future tuning; freeze thresholds and scoring rules before collecting untouched validation sessions. Report per-event and per-session worst cases and failures, not confidence intervals treating overlapping windows as independent. Even under the unjustified assumption of two independent representative motion events, zero failures would yield a one-sided 95% event-failure upper bound of 1−0.05^(1/2) ≈ 77.6%; the present unqualified starts make even that illustration unsuitable as an acceptance claim.

## Commands and verification

Run from repository root, offline:

```powershell
node scripts/analyse-recorded-hx711.mjs docs/HX711-FOUR-CAPTURES-RESULTS.json
node scripts/check-scale-replay.mjs
python scripts/test-capture-hx711.py
```

Results: analysis integrity assertions pass on all four recordings; 170 replay regression checks pass; two capture test methods pass. The regression command's message about no real labelled loading trace refers to its own synthetic fixture suite, not these newly analysed captures. Only this report, its JSON output and the standalone offline analysis script were added; pre-existing workspace changes were left intact.
