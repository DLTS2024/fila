# UNVERIFIED approximate grams preview

UI update: the primary value is now weight-first, with a prominent **UNVERIFIED
ESTIMATE** badge until accepted strict calibration is available. Values below
1000 g use one decimal in grams; magnitudes at or above 1000 g use three decimals
in kilograms (385008 tared counts displays **1.802 kg**). Only magnitudes within
the explicitly displayed **±0.5 g inclusive, display-only zero deadband** format
as **0.0 g**. The unrounded estimate, tare baseline and inventory/calibration
values remain unchanged. No zero tracking or new sensor threshold was added.
Raw counts, hold/pending, factor provenance, unrounded values and the existing
calibration guide are under **Advanced Diagnostics**, collapsed by default.
Display-only tare and tared-count confirmation remain directly accessible.
Formatting regressions cover positive/negative zero boundaries, signed kg,
missing/stale values and the 1000 g unit boundary. No firmware upload is required.

The Live Weight Preview now has an optional **UNVERIFIED approximate preview** for an uncalibrated scale. Its display-only factor is exactly the user-supplied **213.656 counts/g**, based on the user's independently weighed 1802 g object and approximately 385008 tared counts. This is not accepted production calibration and is not a physical accuracy claim.

The browser calculates:

```text
estimated grams = tared display counts / 213.656
385008 / 213.656 = 1801.9994757928632 g → display 1802.0 g
```

The user must explicitly check **I confirm the displayed raw counts are tared to the empty-platform baseline**. Before confirmation the estimate is hidden. The checkbox does not perform tare or send any device command; it asserts that the displayed counts have the correct baseline. Raw sensor counts and tared display counts remain visible separately.

If a display-only tare has been captured, the tared display counts are the filtered raw counts minus that saved display baseline. Otherwise the calculation uses the displayed raw counts as-is, relying on the user's explicit assertion that they are already tared. Absolute ADC counts with an unknown offset must not be treated as tared counts. There is no absolute-value conversion, zero clamp or automatic sign correction; negative tared counts yield a negative estimate.

## Safety and lifecycle

- This factor exists only in `lib/scale/unverified-preview.ts` and its display/tests. It does not enter firmware, EEPROM, private configuration, `factor`, `countsPerGram`, calibration candidates, protocol fields or API measurement context.
- The estimate is always labelled UNVERIFIED and cannot set calibrated=true, qualify strict hold or supply inventory gross. There is no button that copies it to an inventory measurement.
- Accepted strict calibration and the ZERO/CAL/different-reference VERIFY/ACCEPT workflow are unchanged. Once accepted calibrated grams are available, the established calibrated preview takes precedence and the unverified option is hidden.
- Confirmation is session-local and clears on display tare/clear, reconnect, calibration commands/state changes or stale data. Returning fresh data does not silently re-enable it. Stale estimates are hidden using the existing combined device/receipt freshness check.
- No production stability threshold, calibration acceptance requirement or automatic inventory protection was changed. The existing distinct APPROXIMATE calibration mode is not enabled or altered by this browser-only estimate.

## Short device verification

No new firmware upload is needed if the already-installed Live Weight Preview firmware is running. No serial command is required to enable this estimate.

1. Refresh `http://localhost:5173`, open **NFC & scale**, connect the physical device, and check that the UNCALIBRATED raw preview is fresh. Leave the strict calibration guide and inventory controls untouched.
2. Remove the object. If empty-platform display counts are not already zero, confirm the empty platform as the display tare baseline and press **Tare preview display**. Do **not** tare with the 1802 g object present. This affects the display only; do not use ZERO EMPTY for this approximate check.
3. Place the object and allow the existing median/smoother to respond. Check the **tared display counts**, not just the absolute sensor raw. If they are approximately 385008, confirm the tared-count checkbox. The estimate should be approximately **1802.0 g · UNVERIFIED estimate** alongside the counts. The firmware should still report calibrated=false unless it already has a separately accepted strict record.
4. Remove and replace the object a few times. Check return toward zero and repeatability. Removal, noise or a steady display does not establish accepted calibration.
5. Test a second independently weighed object to assess error beyond the fitting point. Matching 1802 g is largely built into the supplied factor; it does not independently validate linearity, offset stability or accuracy. If the load response is negative or inconsistent, leave the estimate untrusted and inspect the setup rather than silently changing the sign/factor.
6. Disconnect/pause the incoming stream: the estimate must disappear. Reconnect and confirm that it stays disabled until you affirm tared counts again. A tare change must also clear confirmation.

The test has not been performed on physical hardware as part of this implementation. No device connection, tare, calibration, inventory save or firmware upload was performed by the implementation tools.

## Automated verification

- NodeMCU ESP8266 compile with all shared C++ assertions: PASS, installed ESP8266 core/HX711 library. Existing library portability warnings remain. Firmware source and footprint are unchanged: RAM 49380/80192, instruction RAM including cache 60355/65536, flash code 261844/1048576.
- TypeScript/Vite/static production build: PASS.
- `scripts/check-unverified-preview.mjs`: PASS for exact supplied factor/reference arithmetic, zero/negative behavior, opt-in and freshness requirements, invalid values and isolation from production firmware/protocol/inventory.
- UI tests: PASS for 385008 → labelled 1802.0 estimate only after acknowledgement, raw counts alongside estimate, unchanged uncalibrated/fault reading state, no serial writes or inventory callbacks, tare invalidation, zero estimate after explicit tare acknowledgement, calibration-command invalidation, stale hiding and no automatic reactivation.
- Existing preview protocol/transport 24 checks, serial/parser 154 checks and firmware formatter/parser/source 101 checks: PASS. The existing guided strict calibration and inventory review tests also pass.

These are arithmetic, source, protocol and component tests plus compile verification, not physical accuracy certification. No calibration flag or production factor was fabricated.

Files changed in this request: `app/live-weight-preview.tsx`, `lib/scale/unverified-preview.ts`, `scripts/check-unverified-preview.mjs`, `scripts/check-scale-ui.mjs`, `package.json`, and this document. Other existing working-tree changes are preserved.
