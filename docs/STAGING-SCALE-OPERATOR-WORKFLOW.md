# Staging scale: practical manual estimate workflow

Target: https://staging-fila.dlts.in, database dltsin_fila_stage. Local implementation only; hosting upload requires separate approval. No firmware flash, EEPROM change or migration is needed for this update.

## Normal operation

1. Sign in and choose Wi-Fi Scale. Enter the physical spool's permanent code and select the existing spool. Manual selection is the default. Phone NFC/QR are optional identifiers; PN532 is not required.
2. Empty the platform. Wait for a usable observation no older than five seconds, confirm the empty platform and set **browser display tare**. This is not firmware zero or saved spool tare. A new selection/connection requires a new baseline.
3. Place the selected spool plus filament on the platform. Exclude covers/packaging. Wait for the delayed displayed value to reflect the load. The page shows observation age, estimated capture timestamp, source, connection and verification status.
4. Check the selected spool, gross load and stored spool tare. The proposed absolute remaining balance is gross minus effective saved tare, once. Unknown tare, invalid mass, below-tare gross or above-capacity net blocks review.
5. Click **Review manual estimate**. Inspect the frozen gross, tare, net, timestamp, age and UNVERIFIED status. Confirm the explicit approval checkbox and then **Confirm and save manual estimate**. Nothing saves automatically.
6. Check the refreshed saved balance/history. The backend records a manual correction with measured=false and UNVERIFIED provenance, not a verified scale measurement or automatic consumption deduction.

## Status and limits

Browser-only tare may also be set without a selected spool when connected, with usable finite numeric raw no older than five seconds and explicit empty-platform acknowledgement. Spool selection is required for inventory review, not for this browser operation. Selecting a spool remounts the workflow and clears the baseline, so selecting first remains the simplest end-to-end sequence. Missing raw, faults, offline state, expiry or an in-flight save disables tare and clears its acknowledgement. The click handler rechecks age before accepting the baseline.

- FRESH: age at most 500 ms. For uncalibrated raw it is still UNVERIFIED, never an accuracy/stability claim.
- STALE: older than 500 ms, superseded/unusable data, or offline. A retained value is historical and is never relabelled fresh.
- Manual estimate: a separate explicit workflow may start from a usable observation at most five seconds old. This does not change the verified 500 ms limit. The raw-to-grams factor remains browser-only 213.656 counts/g.
- A review freezes the selected value; later valid arrivals do not silently change it. Confirm within ten seconds of review and a conservative fourteen-second total age. The backend's existing fifteen-second capture-time check still applies. Expired reviews require a new review, never an age override.
- Disconnects, unusable/fault packets, changed baseline, spool/version/tare/revision changes or invalid current mass disable confirmation. Duplicate in-flight clicks are blocked. Existing backend optimistic concurrency and inventory limits remain authoritative.
- Older-than-five-second values remain visible with their growing age for reference only; they cannot start a manual review. A null or sensor-fault packet never resurrects cached raw for saving.

## Data isolation

The authenticated staging GET adds a separate versioned `observation` envelope containing original raw and its accumulated age, sequence, conservative estimated capture timestamp, UNVERIFIED label and usability. Existing `reading.frame.live.raw` is still cleared after 500 ms. Production receives no observation envelope. The browser never puts delayed observations into the verified reading channel. No calibration record or device factor is created, accepted or changed.

Only uncalibrated STRICT-path CALIBRATION_REQUIRED raw is eligible for this manual observation. Existing STRICT/APPROX/SINGLE_POINT calibration workflows remain separate. If the device is still in SINGLE_POINT mode, normal telemetry requires the existing explicit MODE STRICT command in RAM; do not run another calibration session or erase records for this workflow.

## Minimum acceptance check after approved staging upload

Upload the updated private src/WifiScale.php and rebuilt staging frontend assets as a compatible pair, preserving backups and current config/routing. No migration, credential changes or firmware upload. Check:

1. Authenticated staging GET includes observation with verification=UNVERIFIED while any >500 ms v1 raw remains null. Signed-out requests are denied. Production response shape is unchanged.
2. A two-to-five-second observation shows STALE plus UNVERIFIED and its age rather than a blank verified preview. Browser tare and known-load check behave as expected; no verified accuracy is claimed.
3. Select a disposable staging test spool, review explicitly, and confirm only with approval to alter that test record. Verify exact absolute balance, measured=false and source/timestamp history. Do not use personal inventory or existing QR labels for acceptance testing.
4. Before approval of that write, cancellation/offline/expiry/spool-switch tests must leave inventory unchanged. Five-second-old observations cannot start a review; stale values cannot use the verified save path.

Local tests use synthetic observations, UI mutation spies and a no-connection PDO double. Actual hosted save/history and physical accuracy have not been verified by local tests. Reliable two-to-five-second operation still requires the device to deliver some usable numeric raw within five seconds; genuinely missing/faulty sensor data cannot be manufactured by the UI.
