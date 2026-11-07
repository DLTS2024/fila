# QR / mobile camera / Wi-Fi staging readiness

Production remains blocked by explicit user instruction. Local development uses only disposable local database credentials and does not need a production password. The local implementation and automated regression suite are ready for staging verification; actual staging hosting, radio and camera checks remain pending.

## QR workflow implemented

- Existing spool selection is shared by manual code, QR, approved NFC URL, phone selection sync and the optional future reader adapter.
- Generate QR label produces a local SVG label and download. If a pre-existing opaque URL is available for an approved HTTPS origin, it is reused. Otherwise the payload is `DL3D:SPOOL:PLA_WHITE_01`. Neither mode contains weight, tare, credentials or a write capability. Generating a QR does not generate or link an NFC identity.
- Camera scanning loads the decoder only after Start QR camera. It requests camera access explicitly, prefers the environment-facing camera, decodes locally and stops after a known selection, Stop, page hide or unmount. Late permission grants after cancellation are stopped. No camera image is uploaded.
- Paste scanned text/code remains available when permission is denied or camera APIs are unavailable. Unknown, ambiguous and archived spools fail closed; active scanning uses current inventory rather than an old captured snapshot. URLs must be HTTPS and belong to the current/approved studio origin with the exact opaque spool route; external, credentialed, query-bearing and unrelated-path URLs are rejected rather than navigated.
- Scanning selects an existing spool only. It does not create another Numaker/spool, alter NFC associations, change calibration, or save inventory. The selected-spool preview/review safeguards apply unchanged.

The QR generator is [node-qrcode](https://github.com/soldair/node-qrcode); camera decoding uses [ZXing browser](https://github.com/zxing-js/browser). Versions are pinned by package-lock.json (qrcode 1.5.4, @zxing/browser 0.2.1, @zxing/library 0.23.0). The camera decoder is a lazy bundle; no third-party camera service is used. Mobile browser/permission behavior still needs real-device verification.

## Staging without production credentials

Use `npm.cmd run prepare:staging` for the approved staging origin and staging-only template. Configure only `DLOOP_STAGING_*` values described in `STAGING-PROVISIONING-PLAN.md`. Never use production packaging or credentials for staging. The firmware private header must later select the separately approved staging endpoint and verified CA.

No production credentials are needed for the local disposable fixture tests. Production secrets remain environment-only; the generated template contains no secret values. Do not expose the passwordless LOCAL_SINGLE_USER service to the phone or LAN. Actual mobile staging access requires authenticated HTTPS, separately configured with approval. A phone's own localhost is not the PC.

## Tests and remaining staging checks

Automated checks pass for actual QR encode/decode round trip, code/opaque URL mapping, payload rejection, UI generation/download, paste selection, simulated camera callbacks, denied permission, cancellation/late grant cleanup and current-inventory handling. Camera tests use mocked camera acquisition; no actual phone camera was opened. Device/Wi-Fi tests simulate HTTPS metadata, power cycle, reconnect and API results; actual TLS/radio checks are not claimed. Both unconfigured Wi-Fi and radio-off USB firmware variants compile locally for NodeMCU on ESP8266 core 3.1.2.

Repeated polling of the same stored Wi-Fi packet preserves its mapped original receipt time rather than treating each HTTP response as a new sensor sample. Dedicated transport tests confirm this cannot refresh an expired sample or carry a pre-selection sample into a newly selected spool. Offline/reconnect changes the baseline identity and revokes the old review context.

Final local regression results: 21 backend Wi-Fi authentication/HTTPS/replay/retired-boot/power-cycle/rotation/revocation checks; production backup-gate refusal/attestation tests; 18 manual-estimate backend checks; 68 inventory HTTP checks; 24 strict scale endpoint checks; 102 local session/access checks; actual-app/real-PHP/MariaDB manual-save integration with mocked USB; QR and Wi-Fi transport/UI suites; existing 154 parser/lifecycle, 101 firmware protocol/source and 19 loopback policy checks; production build/typecheck and artifact checksum/secret-exclusion scan. These passed on isolated fixtures. Timer-driven React act warnings appeared in one integration run; assertions and persisted-record verification passed. Physical camera/radio/certificate behavior remains unverified.

Run `npm.cmd run test:spool:qr`, `npm.cmd run test:scale:wifi`, existing scale/identity/UI tests and production build. Backend device/backup-gate/manual-estimate and HTTP suites must target only the guarded disposable fixture. The complete inventory end-to-end test uses simulated USB plus real PHP/MariaDB and confirms explicit manual save, refresh/history, concurrency and reconnect/stale protections.

For staging verification:

1. Approve/provision a separate HTTPS staging environment, confirm PHP/PDO/MySQL versions, API rewrites/session cookies and a verified backup if any existing staging data is migrated. Inspect row counts and ledger before changes. Do not alter production.
2. Sign in on phone and PC. Generate a code-only QR for the existing staging spool, scan it through the in-app camera and verify the same code, tare and saved balance, with no inventory write. Test no camera permission, unsupported camera, external QR, archived/unknown code and switching pages while scanning. Check that the camera indicator turns off.
3. For URL QR/NFC tests, use an already approved opaque identity or separately approve generating one. Scan while signed out and signed in; verify authentication and matching record. Do not change or write an NFC association/sticker without separate approval.
4. After separate flash approval, configure the ESP8266 with staging-only endpoint/CA/token and 2.4 GHz Wi-Fi. Test certificate/clock failure, wrong/revoked token, offline/power cycle, duplicate/stale frames, real latency and watchdog/heap behavior. The 500 ms preview freshness and strict calibration gates must remain enforced.
5. Confirm live gross − effective tare once, with cover excluded, while saved balance remains separate. Review then Cancel first. Any actual personal/production balance change requires explicit approval of its proposed value; automated tests do not supply that approval.

Detailed deployment/migration/rollback instructions: [PRODUCTION-WIFI-DEPLOYMENT.md](PRODUCTION-WIFI-DEPLOYMENT.md). Production site/database capability remains unverified because it was unreachable from this environment and production access was not authorized.

Additional changed files: `lib/qr-spool.ts`, `lib/qr-camera.ts`, `components/spool-qr.tsx`, `components/spool-identification.tsx`, QR tests, package manifests/lock; staging overrides in the private config/example firmware and artifact builder. No actual inventory or tag association was modified.
