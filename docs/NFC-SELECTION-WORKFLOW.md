# Existing-spool NFC and selection workflow

5 November 2026 follow-up. No production database mutations, tag association changes, physical NFC writes, service restarts, access changes or new migrations were performed in this task.

## What is implemented

- Manual spool-code entry in **NFC & Scale → Identify this physical spool** resolves the existing active spool, case-insensitively, without creating inventory. Enter `PLA_WHITE_01`; Copy spool code supports physical labels.
- Existing-spool NFC registration generates a random 48-hex opaque identifier using the existing unique `spools.tag_token` schema. The existing explicit confirmation, version/revision checks and audit trail apply. No identifier was generated for the real spool during this task.
- Securely configured URL format is `https://<approved-studio-origin>/#/spool/<opaque-id>`. No mass, account credentials or calibration data is stored on a sticker. The token identifies a record and does not authorize access. The dashboard requires authentication before loading inventory, preserves the URL through sign-in, opens NFC & Scale and resolves the same spool. Unknown, archived, replaced or unlinked tokens clear the previous selection and display an error; they never create a spool.
- The scan landing uses the existing dashboard with a scan-specific explanation, responsive single-column spool details, wrapping code/URL fields and touch-friendly controls. Physical mobile rendering still needs real-device verification.
- Tag replacement generates a new URL identity for the same spool. The new **Unlink NFC URL and hardware tag** action clears the URL token and optional hardware UID, increments version and records audit history, without deleting or reweighing inventory. Both operations require explicit user confirmation. Existing physical sticker contents are not erased by unlinking.
- Phone writing uses a user-initiated NDEF URL write on a compatible browser. Unsupported contexts receive a fallback message. No tag was physically written or read here.
- Future PN532 integration remains an optional `OptionalNfcReaderAdapter` subscription feeding the same resolver. No hardware driver or physical communication is claimed.

## Secure selection synchronization

New `/api/v1/spool-selection` GET/POST endpoints share only a short-lived selection between sessions belonging to the **same authenticated administrator account**. POST requires the normal CSRF/session checks and an existing active spool. GET requires authentication. There are no unauthenticated endpoints or pairing capabilities embedded in NFC tags.

The transport refuses LOCAL_SINGLE_USER, HTTP request contexts and deployments without `phone_nfc_origin`. Both devices must use the same approved authenticated HTTPS studio deployment and inventory. It does **not** connect a remote phone directly to the current passwordless localhost UI or mirror data between different databases. No outbound relay or public tunnel was installed.

The PC explicitly opts in to receiving; the phone explicitly sends the selected spool. Polling runs every three seconds while enabled and stops on errors/unmount. The shared event expires in 120 seconds. Account-specific private files under the existing session directory hold one event (spool UUID, random event ID, expiry), protected by file locks; no SQL table or inventory revision is changed. There is no balance, tag, calibration or automatic inventory write in this transport.

**Current operational limitation:** dloop_personal remains LOCAL_SINGLE_USER, so phone URLs/writing and phone-to-PC synchronization are inactive here. A separately approved reachable authenticated HTTPS deployment of the same studio is required. Do not expose or tunnel the current passwordless PHP/Vite services. No access configuration or process was changed to enable this feature. Existing private local account setup is not claimed to provide a usable phone sign-in automatically.

## Tests

- Frontend production build/typecheck/static artifact checks pass; API client, dashboard UI, identity resolver and workflow component tests pass.
- UI coverage includes manual selection without writes, scan URL present before inventory mounts, stale live data, old/new URL replacement, explicit unlink confirmation, disabled/unconfigured sync, opt-in receiving, explicit sending and expired-event rejection. These use React/jsdom and API spies, not a real browser, NFC chip or networked phone.
- 20 isolated database brand/model/override/identity checks pass, including unconfirmed/stale-version unlink refusal and preservation of the 982 g balance/provisional tare after unlink.
- 10 isolated sync service checks pass: local-mode/unconfigured/HTTP refusal, same-account exchange, account isolation, expiry, invalid spool and unchanged inventory. HTTPS request metadata is simulated; TLS deployment has not been validated.
- Real PHP HTTP authentication/CSRF checks include the new endpoint: anonymous reads fail, missing CSRF fails and configured-local HTTP cannot enable sync. 68 inventory, 24 scale API and 102 localhost bootstrap/access checks pass on disposable fixtures. 19 frontend loopback, 154 scale lifecycle, scale UI/unverified estimate and 101 firmware protocol/source checks pass.
- A read-only personal verification compares every saved spool field to the approval receipt. It confirms revision 2, one user, one brand, one spool, no measurement rows, no hardware tags and no opaque tag token.

Reproduction: `npm.cmd run build`, `npm.cmd run test:spool:identity`, `npm.cmd run test:spool:ui`, standard existing UI/API/scale/local-policy scripts. Backend additions require a disposable `dloop_test_local_mode_*` configuration: `php backend/tests/brand-tare-identification.php` and `php backend/tests/spool-selection.php`. Never point fixture mutation tests at dloop_personal or phase5a.

## Real-device verification still required

1. Today, locally enter `PLA_WHITE_01` in NFC & Scale and check the selected record: Numaker PLA+ White, 982 g UNVERIFIED, tare 193 g provisional. Selection must not change inventory or its revision.
2. Obtain separate approval and configure an authenticated HTTPS deployment reachable by the phone and PC, preserving the localhost service restrictions. Verify authentication, HTTPS/certificate behavior, allowed origin, secure session cookies and that a phone cannot bootstrap passwordless local access. No configuration changes are authorized by this report.
3. Obtain explicit approval to generate/link the existing spool's opaque identity. Obtain explicit approval to write a physical sticker. On a compatible Android phone, use the displayed URL/write action, present an NDEF sticker, scan it, sign in if necessary and confirm the same spool code. The tag must contain only its URL. Test unsupported browser, denied permission and signed-out access.
4. On the same authenticated HTTPS studio account, opt in to receiving on the PC, scan/select on the phone and explicitly send. Confirm selection arrives, balance/revision/measurements stay unchanged, events expire and another account cannot receive them. Current localhost-only UI is not a receiver for this transport.
5. With separate approval, replace the URL identifier and confirm the old sticker no longer resolves, then approve rewriting it. Test explicit unlink: the old URL and hardware UID fail to resolve while the spool and balance remain. Erasing a physical sticker is a separate action.
6. Test a mock hardware-reader adapter first; actual PN532 electrical/UID tests wait until hardware exists. Reader selection must never create inventory or commit weight.

## Files changed in this follow-up

Production: `backend/src/SpoolSelection.php`, `backend/src/bootstrap.php`, `backend/src/Api.php`, `backend/src/Inventory.php`, `lib/api.ts`, `components/spool-selection-sync.tsx`, `components/spool-identification.tsx`, `app/globals.css`.

Tests: `backend/tests/spool-selection.php`, `backend/tests/http.mjs`, `backend/tests/auth-database.mjs`, `backend/tests/brand-tare-identification.php`, `scripts/check-spool-workflows-ui.mjs`, `scripts/check-local-single-user.mjs`.

Documentation: this report. Local read-only helper: `work/verify-personal-spool-preserved.php`. Earlier uncommitted work was preserved; firmware and calibration files were not edited in this follow-up.
