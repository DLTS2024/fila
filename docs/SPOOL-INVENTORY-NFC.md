# Spool inventory and NFC integration

Implementation report, 5 November 2026. Latest status: after separate explicit approvals, migrations 0004/0005 and the Numaker brand/first spool are saved in dloop_personal. Inventory revision is 2, with one user, one brand and one spool. No access configuration, running services or firmware were changed. Earlier inspection and proposal sections below are retained as historical context.

## Completed

- Reused existing inventory, model profiles, permanent human-readable spool code generation, database uniqueness, revision/version checks, idempotent mutations and hardware UID linkage. Codes use the existing material/colour sequence (for example `PLA_WHITE_01`); they are immutable, not renamed into a second scheme.
- Added independent nullable brand tare defaults and verification status. The new-brand form suggests 193 g only for Numaker, unverified. Other brands start unknown. Selected model profile takes precedence over brand default; an individual override takes precedence over both. Existing physical-spool snapshots and balances do not change when defaults/profiles change.
- Provisional tares support manual unverified inventory estimates. A gross-entry preview using provisional tare is converted to an explicitly confirmed manual balance with provenance, never a measurement row. Backend gross-measurement requests using provisional tare are rejected. Unknown tare displays **Tare Required** and blocks subtraction. Covers and packaging remain excluded.
- Added code selection/copy and one resolver for manual codes, opaque phone URL identifiers and optional hardware-reader identifiers. Identification selects an existing active spool; unknown, ambiguous, replaced or archived identifiers do not create records.
- Added selected-spool details, tare source, saved remaining percentage, fresh live display weight and an explicitly acknowledged gross-minus-tare preview. These displays never save inventory automatically.
- Added authenticated opaque URL identity generation/replacement with version checks and uniqueness. A tag contains only an HTTPS URL and random identifier. The identifier is not authorization: inventory still requires the existing session and backend access checks. Replacing it invalidates the previous URL without creating another spool.
- Prepared phone URL scan routing, mobile-responsive existing dashboard details, copying and a user-initiated Web NFC NDEF URL writer. Unsupported browsers receive an explanatory fallback. Physical phone/tag behavior has not been verified.
- Added an optional reader subscription interface. No PN532 driver, wiring, serial commands or physical communication is implemented.

The browser-only approximate scale factor remains 213.656 counts/g. Firmware, calibration acceptance, strict stability thresholds, stale-data handling and explicit inventory review remain unchanged by this task. Provisional tare additionally prevents verified gross updates.

## Database and approval boundary

Read-only inspection confirmed the private personal configuration selects **dloop_personal**, LOCAL_SINGLE_USER, one existing local operator, inventory revision 0, zero spools and zero Numaker brands. No duplicate exists at this inspection; recheck immediately before saving.

Personal database migration status:

| Migration | Status / effect |
|---|---|
| 0000–0003 | Already applied |
| 0004_brand_tare_defaults.sql | Applied with approval: nullable brand defaults, verification and spool estimate provenance |
| 0005_spool_tag_identity.sql | Applied with approval: nullable unique opaque URL identifier |

Both migrations passed isolated fixture checks before the approved personal application. The protected pre-migration backup is `backend/var/personal/backups/20261105-162218-before-brand-nfc/dloop_personal.sql` (23,613 bytes), with a checksum and pre-migration record manifest alongside it. Backup checksum verification passed; a restore rehearsal was not performed. Access is restricted to the existing private directory principals. Do not publish the SQL backup or manifest.

The existing migration runner applied only 0004 and 0005; all six ledger checksums now pass. All original column values across 15 non-ledger/session/throttle tables match the pre-migration fingerprints. There is still one user, zero brands, zero spools, revision 0. Both schema feature flags are available. No permanent operator credential file or runtime DDL permission was added; a temporary operator configuration adapter was removed after execution. Original phase5a databases were not modified. No services were restarted. Final inventory approval remains required.

## Proposed first spool — NOT SAVED

| Field | Proposed value |
|---|---|
| Name | Numaker PLA+ White - UNVERIFIED ESTIMATE |
| Brand / material / colour | Numaker / PLA+ / White |
| Nominal capacity / physical type | 1000 g / Unknown |
| Registration | Partially used; starting balance 982 g |
| Current remaining | 982 g, manually entered UNVERIFIED estimate (98.2% nominal capacity) |
| Tare | Numaker brand default 193 g, PROVISIONAL / UNVERIFIED |
| Reference gross | Approximately 1175 g without cover; provenance only |
| Cover | Approximately 43 g, excluded already; do not subtract again |
| Measurement / scale reading | false / none |
| Permanent code | Assigned by existing generator at save; no code reserved yet |

The 982 g registration baseline describes balance when this spool enters the studio, not original factory fill. No model-specific verified tare is inferred from the Unknown physical type. Draft: `work/drafts/numaker-pla-plus-white-unverified.json` (not a database save).

### Follow-up verification and proposed writes

Read-only follow-up confirmed all five new columns and both unique indexes (`uq_spool_code`, `uq_spool_tag_token`), with both schema availability flags true. All six migration checksums still pass. Personal state remains one user, zero brands/spools, revision 0. The existing sequence predicts `PLA_WHITE_01`; this is not reserved until the registration transaction runs.

Subject to separate explicit approval, use existing protected inventory mutations to create:

1. One active Numaker brand with `defaultTare=193`, `defaultTareVerified=false`.
2. One active partially used spool with `material=PLA+`, `colorName=White`, `color=#ffffff`, `spoolType=Unknown`, `capacity=1000`, `initial=982`, `remaining=982`, `mode=manual`, no model profile or individual override, and a provenance note recording approximate gross 1175 g without cover and provisional brand tare 193 g. Inherited tare snapshot is 193 g with `tareProvisional=true`; `measured=false`, no gross measurement or device-reading row. The cover is excluded, not subtracted twice.

The existing transaction also allocates the immutable unique code, advances the sequence/revision and records normal audit/idempotency history. No NFC identity is generated by this registration, and no model, user, calibration or access setting changes. Recheck current revision and duplicates immediately before any approved write.

Additional component coverage passes for a phone URL present before inventory mounts (simulating return from sign-in), stale/unavailable live weight, replacement invalidating the open old URL and the new URL selecting the same record without writes. These are jsdom tests, not a physical mobile/browser test. Build/static checks, dashboard UI, 154 scale lifecycle checks, scale-review/unverified safeguards, 19 loopback policy checks, disposable migrations, 16 brand/identity checks, 68 inventory HTTP, 24 scale endpoint and 97 local session/access checks were rerun successfully. This follow-up changed only the workflow tests, read-only inspection helper, draft and report; working production code was reused.

## Pending phone and hardware work

LOCAL_SINGLE_USER remains loopback-only. Phone access, tag writing on a real phone and phone-to-PC selection sync are **pending**. There is no cross-device selection transport in this implementation. Do not bind the passwordless service to the LAN or tunnel it publicly. Any future phone deployment needs a separately approved, reachable authenticated HTTPS configuration, explicit allowed origin and normal account sessions; `phone_nfc_origin` is unavailable in LOCAL_SINGLE_USER mode. No such origin was configured here.

Web NFC support is browser/device-dependent and requires a secure context and user interaction. See the [Chrome Web NFC documentation](https://developer.chrome.com/docs/capabilities/nfc). An NFC writer app can alternatively write the generated URL; do not write raw weights or credentials.

Verification steps after approval:

1. Migrations and backup are complete. Obtain separate final approval to save the brand and spool; recheck duplicates and revision immediately before using the existing inventory mutation workflow. Do not interpret migration approval as inventory approval.
2. Open NFC & Scale locally, copy the assigned permanent code, select another spool or clear selection, then enter the code. Confirm the same record is selected and inventory revision/balance do not change. Unknown codes must not create anything.
3. Confirm the live preview is fresh and UNVERIFIED; acknowledge gross spool-plus-filament weight only with cover removed. Compare display-minus-193 g with expected estimate. Disconnect the scale and verify live net becomes unavailable when stale; saved inventory stays unchanged. Do not accept calibration or save a scale measurement during this test.
4. Only after secure authenticated phone access is configured separately: sign in on a compatible Android phone, generate a URL for the existing spool, tap Write URL and present an NDEF-capable sticker. Scan it and verify the same code/record and no weight change. Repeat while signed out: inventory must require authentication. Denied permission, unsupported browser and unknown token must fail safely.
5. Replace that URL identifier with explicit confirmation. Verify the old sticker no longer resolves, rewrite the sticker and verify the new URL selects the same record. No duplicate spool should appear. Phone selection does not yet propagate to another PC session.
6. A future reader implementation must supply identifiers through `OptionalNfcReaderAdapter`; first test a mock identifier resolving the existing spool, then verify physical reader wiring/UID acquisition separately. Selection alone must never save a measurement.

## Verification performed

- Production frontend build/typecheck and static artifact checks pass.
- New identity tests and React/jsdom workflow tests pass: unified mapping, unknown/ambiguous/archived handling, URL replacement, HTTPS URL restrictions, mock NDEF writer, Numaker calculation, unknown other-brand tare and no automatic saves.
- Existing dashboard UI, 154 scale parser/lifecycle checks, scale review safety, unverified preview and 101 firmware protocol/source guard checks pass. No physical hardware or C++ execution is claimed by protocol tests.
- Disposable database migration/constraint checks and 16 new brand/model/override/provisional/code/tag tests pass. Rerunning migrations reports all six applied.
- Real PHP HTTP authentication, 68 inventory checks, 24 scale safety endpoint checks and 97 localhost bootstrap/access checks pass on isolated fixtures. Real React/jsdom inventory integration against the isolated PHP backend passes registration, retries, gross correction and conflict handling. The test now explicitly acknowledges independently measured override tare; it does not silently assume verification.
- Windows PowerShell blocks npm.ps1, so commands use npm.cmd without changing execution policy. The integration UI initially refused missing disposable opt-in, then encountered the authentication suite's intentional throttle; its successful run used the dedicated second fixture account. No real account or throttle data was changed.

## Files changed for this task

- Database/API: `backend/migrations/0004_brand_tare_defaults.sql`, `backend/migrations/0005_spool_tag_identity.sql`, `backend/src/Inventory.php`, `backend/src/Api.php`, `backend/src/Auth.php`, `backend/src/Config.php`.
- Frontend/types: `lib/inventory.ts`, `lib/api.ts`, `lib/spool-identification.ts`, `components/brand-library.tsx`, `components/filament-dialog.tsx`, `components/spool-identification.tsx`, `app/page.tsx`, `app/connections.tsx`, `app/live-weight-preview.tsx`, `app/authenticated-studio.tsx`.
- Tests/scripts: `backend/tests/database.php`, `backend/tests/brand-tare-identification.php`, `scripts/check-spool-identification.mjs`, `scripts/check-spool-workflows-ui.mjs`, `scripts/check-inventory-ui.mjs`, `package.json`.
- Report/draft: this document and the ignored local draft/read-only inspection helper under `work/`.

The repository contains earlier uncommitted scale, local authentication and diagnostic work. Those changes were preserved and are not all new changes for this inventory/NFC task.


## Approved first spool saved

After explicit approval for the brand and spool only, a fresh duplicate/revision check confirmed the expected empty inventory. The existing Inventory mutation service saved the Numaker brand and then the manually confirmed spool, with normal revision checks, idempotency, sequence allocation and audit history.

- Permanent code: **PLA_WHITE_01**.
- Numaker PLA+ White, nominal 1000 g, physical type Unknown, active partially used spool.
- Starting/current balance: **982 g, manual UNVERIFIED estimate** (98.2% nominal).
- Brand default/snapshot tare: **193 g, provisional/unverified**, no individual override or model profile.
- Approximate gross 1175 g without cover is provenance only; stored gross measurement is null. The approximately 43 g cover was already excluded.
- `measured=false`, `tareProvisional=true`; **zero measurement rows added**.
- No NFC token/tag was generated, no calibration or access configuration changed, no services restarted. Existing user row fingerprint is unchanged.
- Final state: **1 user, 1 brand, 1 spool, inventory revision 2**.
- Saved-code resolver check confirms case-insensitive manual entry resolves this existing spool without any write.

A private save receipt is retained at `backend/var/personal/numaker-first-spool-receipt.json`. Actual phone/NFC and future PN532 verification remain pending as described above.
