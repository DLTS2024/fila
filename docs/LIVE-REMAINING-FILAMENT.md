# Live remaining filament

Implemented 5 November 2026. No production inventory mutation, scale command, firmware edit, service restart, access change or migration was performed for this task.

## Behavior

The selected existing spool is shared by manual code, phone URL selection/sync and optional future reader selection. The new Live remaining filament panel consumes the existing filtered Live Weight Preview, including the unchanged browser-only 213.656 counts/g approximation. It does not require strict hold to display an explicitly unverified estimate and does not relax strict measurement or calibration gates.

Before using the calculation, confirm the scale was zeroed with an **empty platform** and the displayed value is gross spool plus filament, with cover and packaging excluded. This is a user confirmation, not an automatic tare/calibration command. The existing raw-estimate empty-platform confirmation is also retained. Never display-tare an empty spool before this calculation: that would subtract the spool twice. The new panel subtracts effective spool tare once.

Tare resolution: individual override first; an existing selected model-profile snapshot remains supported; otherwise the applicable brand default. Unknown/invalid tare displays Tare Required. Existing model support and saved physical-spool snapshots are not rewritten by preview. For PLA_WHITE_01, the applicable tare is 193 g provisional.

For valid gross at least tare, remaining is `max(0, gross - tare)`. Gross below tare is an error, not a saveable zero. Gross must be finite, nonnegative and at most 10,000 g (the stated load-cell capacity); remaining must not exceed the selected spool's nominal capacity. These are guards on this new preview/manual-estimate path, not firmware or calibration threshold changes. An overfilled spool needs independent review through the existing inventory workflow rather than a silently accepted implausible preview.

The prominent output switches g/kg using the existing formatting helper. Gross, effective tare, remaining percentage, saved balance and UNVERIFIED ESTIMATE status remain visible. The existing display-only near-zero deadband affects formatting only. No packaging adjustment is configured or inferred: the 43 g removable cover must remain physically excluded. If it is present, remove it before confirming gross; this implementation does not subtract it automatically.

Missing selection, unknown tare, disconnect, invalid/physical-fault data or preview older than 500 ms makes the calculation unavailable. Calibration-required/settling raw preview remains usable only as an unverified estimate. A spool change remounts the panel, cancels its review and gross acknowledgment and requires a sample received after that selection. Reconnection, calibration or display-tare baseline changes require the appropriate baseline confirmation again. No reading or review is transferred to another spool.

## Explicit manual save

Review & Save Estimate freezes gross, tare, calculated balance, source, sample timestamp, spool ID/version and inventory revision. The live display continues; the review expires after 15 seconds and requires an available fresh stream. A second checkbox and Confirm & save UNVERIFIED estimate are required. At click time freshness is checked again. The review is a frozen value, not a continuously changing amount to approve.

The existing authenticated, CSRF-protected `/stock` mutation workflow handles a dedicated `manual-estimate` action. It uses the frozen revision (not an automatically refreshed one), version, idempotency handling and explicit confirmation. The backend re-resolves tare and recalculates the balance in decimal cents, rejects old/future timestamps, wrong source, changed tare, invalid masses and stale versions/revisions. The source is self-reported manual provenance, not proof of verified hardware measurement.

Only current remaining balance, unverified provenance, measured=false, null measured gross, normal version/update time and correction audit history are written after approval. Initial balance, code, tare/profile/override, NFC association and calibration remain unchanged. Source (`live-preview-usb` or simulator), captured timestamp and gross-minus-tare calculation are stored in the existing estimate note/audit details. No measurements row is inserted. The backend does not import or invent the approximate factor. No database migration is needed.

## Verification

- `npm.cmd run build`: typecheck, production build, static artifact checks pass.
- `npm.cmd run test:scale:remaining`: arithmetic, precedence, unavailable/error states, no automatic writes, explicit save, revision conflict and spool-switch tests pass.
- `npm.cmd run test:scale:ui`: integrated simulated serial raw-count → browser approximation → selected-spool calculation passes for 850−193=657 and 1175−193=982; physical fault blocks remaining output; no automatic saves. Existing strict/approximate review safety tests pass.
- Existing dashboard, spool-workflow, API, 154 scale lifecycle, 24 live preview, unverified factor/formatting, 101 firmware protocol/source and 19 loopback policy checks pass.
- New `backend/tests/manual-estimate.php`: 17 checks pass on a disposable fixture, including arithmetic, unknown/changed tare, invalid masses/source, stale timestamp, confirmation/version/revision conflicts, preserved initial/tare and zero measurement additions.
- Real PHP disposable HTTP regression: authentication/CSRF, 68 inventory, 24 scale API, 102 localhost access checks pass; existing 20 brand/identity tests pass.

No real-phone, physical load-cell accuracy or real inventory-save action is claimed by these tests. A broad sensor-fault display guard initially blocked expected calibration-required raw preview; the regression caught it and it was corrected. Physical sensor faults still prevent the new gross calculation.

The old whole-record receipt checker expected revision 2 and no tags, so it correctly failed against newer pre-existing state. Read-only follow-up shows revision **6**, spool version **5**, with history of an NFC association and printer assignments. PLA_WHITE_01 still has initial/current 982 g, tare 193 g provisional, measured=false, null gross and its original estimate note. Those newer associations/assignments were preserved; no attempt was made to revert the database to the old receipt.

## Hardware verification

1. Connect USB using the existing dashboard. Leave the platform empty, use display-only tare if needed, then confirm the raw empty-platform baseline. Do not begin calibration or tare with a spool present.
2. Select PLA_WHITE_01 by manual code. Confirm gross semantics and cover exclusion in the new panel. Place the actual spool on the platform. Check automatic remaining/percentage updates and the visible UNVERIFIED label. Do not expect physical exactness from an unverified factor.
3. Add/remove a load and confirm response. Remove the spool: empty platform gross below 193 g must show an error/unavailable remaining, not a saveable zero. Disconnect or pause data and confirm unavailable within the preview freshness limit.
4. Switch to another existing spool, if one exists; the old reading/review must disappear and a fresh sample/new gross confirmation is required. Do not create a test spool in production just for this check. Phone/hardware identification follows the same selection path when securely configured.
5. Open Review & Save Estimate, inspect the frozen timestamp/source/proposed value, then Cancel. No inventory should change. A real save requires separate explicit user approval; none was performed here. Test concurrent changes and actual saving only in disposable fixtures unless separately authorized.

## Modified files for this task

- `lib/scale/remaining-filament.ts` — gross sample type, tare resolution and calculation guards.
- `components/live-remaining-filament.tsx` — live display, baseline acknowledgment and confirmed manual review.
- `app/live-weight-preview.tsx` — structured gross-preview callback; original numeric callback retained.
- `app/connections.tsx` — shared selection/gross wiring and panel reset by spool identity.
- `components/spool-identification.tsx` — hide the redundant legacy net calculation when the new panel is present.
- `app/page.tsx` — preserve the reviewed inventory revision for manual estimate requests.
- `backend/src/Inventory.php` — dedicated confirmed manual-estimate mutation and provenance.
- `scripts/check-remaining-filament.mjs`, `scripts/check-remaining-filament-ui.mjs`, `backend/tests/manual-estimate.php`, `scripts/check-scale-ui.mjs`, `package.json` — tests and test command.
- This report and a local read-only current-spool inspection helper under `work/`.

Earlier uncommitted work was preserved. Firmware, protocol thresholds, access settings, tag associations and production records were not edited by this task.
