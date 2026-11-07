# Protected local company workspace

`LOCAL_SINGLE_USER` is an explicit, local-only access mode for the existing single-company database. It removes manual sign-in from ordinary use while retaining authenticated sessions, per-request administrator authorization, CSRF, validation, revision checks, actor history, idempotency and scale/inventory safety. `AUTHENTICATED` remains the default when access_mode is absent and the supported mode for hosted deployment.

**Activated after explicit user approval on 5 November 2026.** Pre-activation inspection found AUTHENTICATED mode with zero personal users/spools. Activation created the approved internal audit actor (ID 1), backed up the private configuration, enabled LOCAL_SINGLE_USER, removed temporary bootstrap database privileges, and restarted only the personal PHP/Vite services. Temporary regression servers used separate ports and isolated test databases.

## Access model

1. The approved launcher binds PHP to `127.0.0.1:8001` and Vite to `127.0.0.1:5173`. The normal app URL is `http://localhost:5173` or `http://127.0.0.1:5173`.
2. A random 256-bit private bridge token is stored in the private local configuration. A CLI-only subprocess supplies it to the launcher in memory; it is inherited by the Vite server, not passed as process arguments or exposed as a VITE/browser environment variable. The proxy removes any client-supplied bridge header and supplies its own token to PHP.
3. Both frontend and backend require a literal loopback Host and loopback peer. PHP also verifies the server bind address. Non-loopback peers, rebinding-style hostnames, forwarded/proxy headers, foreign/null origins, foreign referrers and cross-site/same-site cross-origin Fetch Metadata are rejected. A misbound backend still denies access without the private bridge and loopback checks. The frontend loopback middleware remains in force even if a host flag is accidentally widened.
4. GET `/api/v1/auth/session` supplies an anonymous HttpOnly/SameSite=Strict session and CSRF token plus the access mode; it does not authorize inventory access.
5. The frontend automatically POSTs an empty object to `/api/v1/auth/local-bootstrap`, with the session CSRF token and allowed same-origin Origin. PHP verifies the local boundary, the private bridge, CSRF, and the configured active administrator actor, then rotates the session ID and CSRF token.
6. All other routes still require a valid administrator session. All mutations retain Origin/CSRF checks. The UI enters the existing dashboard with no email/password form or sign-out button in this mode. Failed bootstrap shows a closed local-session error/retry screen, not a bypass. Expiry triggers a fresh bootstrap. Password login in local mode is refused.

No CORS wildcard or HTTP setup endpoint is added. The bootstrap cannot accept a user ID from the request. The configured actor is checked for active/admin status on subsequent requests. Mode, database, actor or bridge changes invalidate incompatible local sessions. Normal authentication remains available after deliberate configuration changes; local bootstrap is disabled there. It is invalid to enable local mode with a production configuration.

This is a boundary for trusted use on the Windows PC, not authentication between different people/processes on that same PC. Other processes running as the same trusted OS user are not isolated from local files/services. Do not publish/tunnel these services or place a public reverse proxy in front of them. Browser cross-site requests and direct LAN access are rejected, but an intentionally privileged proxy that falsifies local request metadata is outside this deployment model.

## Preserving users and inventory

The mode uses the existing schema and inventory services; no schema migration, truncation, deletion or inventory copying is needed. Activity and measurements retain a real `users.id` actor.

Activation helper `backend/bin/local-single-user.php --enable` is restricted to the personal configuration and `dloop_personal`. It backs up the private configuration before changing it. If exactly one active admin exists, its ID is reused without changing its email/password. Multiple admins require manual actor selection rather than guessing. If there are no users and installation is uninitialized, explicit activation approval includes creating one internal `local-operator@localhost.invalid` actor with an unretained random password. That identity is for audit foreign keys, not a manual sign-in workflow. Existing/inactive users are never replaced or activated automatically. Setup does not touch any test database.

The operator creation/config update path rolls back the new row and restores configuration on failure. Its database and configuration actions cannot be one filesystem/database atomic transaction, so a process/OS crash during activation still requires inspection rather than blind retry. An existing access-mode backup prevents accidental repeated activation. The original configuration backup remains inside the existing ACL-protected private directory.

On the current uninitialized personal database, the temporary first-admin database grants are needed to insert this audit actor. After activation, `setup-personal-local.php --finalize` removes those bootstrap grants, as in ordinary first-admin setup. No user password is printed or requested for local mode.

## Activation and restart, only after approval

From the repository root, the operator selects the exact existing personal configuration in `DLOOP_CONFIG_FILE` and runs the CLI activation. Do not run these steps until the live access-mode change and restart have been approved:

```powershell
$env:DLOOP_CONFIG_FILE = (Resolve-Path backend/var/personal/config.local.php).Path
& C:\xampp\php\php.exe backend/bin/local-single-user.php --inspect
& C:\xampp\php\php.exe backend/bin/local-single-user.php --enable
& C:\xampp\php\php.exe backend/bin/setup-personal-local.php --finalize
```

After deliberately stopping only the existing personal PHP/Vite instances, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local-single-user.ps1
```

The launcher refuses occupied ports rather than killing another service, validates backend readiness, and stops its own hidden PHP child when the frontend exits. Config, sessions, passwords and bridge token must remain outside the public root; the existing private-directory Windows ACL is retained. Do not run Vite directly without the private launcher environment after local mode is enabled: the backend will reject requests lacking the bridge token.

Refresh the browser at the local URL. Protected session bootstrap should open Overview without a login form; all seven views, including NFC & scale and Printers, remain available. This authentication change does not calibrate a scale or authorize automatic inventory updates.

## Hosted mode and rollback

`AUTHENTICATED` remains the default and uses the existing password login, session rotation, role checks and throttling. Production configuration cannot opt into LOCAL_SINGLE_USER. Hosting must retain the existing HTTPS/private-configuration deployment requirements.

To undo an approved activation, deliberately stop the local launcher, inspect and restore the private `.before-local-single-user` configuration, and restart the authenticated local server using the documented ordinary launcher commands. Do not delete the local actor or inventory/history rows. The retained actor's random password is not a known credential: before exposing a hosted studio, deliberately establish/recover a real administrator through trusted CLI access. Rollback is an access-configuration operation and also requires approval; it is never performed automatically.

## Verification

No real personal or retained test inventory was used for mutation tests. New databases named `dloop_test_local_mode_*` were created solely for isolated fixtures; their existing setup/HTTP suites were exercised and left isolated. Test server ports were 8110/8111 and 5174, separate from the real studio.

- PHP syntax and 21 existing validation/password checks pass.
- 30 backend local-boundary/config checks pass: remote peers, unsafe bind, hostile Host, proxy headers, origin, referrer, Fetch Metadata, token and production-mode rejection.
- 19 frontend local-boundary checks pass.
- 97 local HTTP/proxy checks pass across the API route/method matrix: every endpoint rejects missing bridge; inventory endpoints remain session-protected; every mutation remains CSRF-protected; bootstrap rotates cookie/token; old-cookie replay fails; password login is not used; all reads succeed after bootstrap; a real inventory mutation increments revision; unstable/uncalibrated measurement metadata still returns invalid_scale_reading. Real Vite/PHP integration verifies bridge injection, foreign-origin/header rejection, inaccessible private files and no token in served HTML/environment.
- Existing normal-mode HTTP anonymous/session, database login/logout/throttle, 68 inventory HTTP requests/assertions and 24 scale endpoint checks pass on a fresh isolated fixture.
- Dashboard component tests pass: all seven views, automatic local CSRF bootstrap, no login/logout controls, fail-closed bootstrap error, and normal-mode login preserved. These are jsdom tests, not physical browser/device acceptance.
- TypeScript/Vite production build and static verification pass. Existing 154 serial/protocol checks, preview 24 checks and scale-review component safety tests pass. No scale firmware, thresholds, calibration or measurement acceptance logic changed in this work.

Commands:

```powershell
& C:\xampp\php\php.exe backend/tests/local-access.php
node scripts/check-local-loopback.mjs
node scripts/check-local-single-user.mjs  # requires a NEW isolated fixture prepared under work/local-single-user-test
node scripts/check-ui.mjs
npm.cmd run build
```

The full HTTP harness assumes a freshly initialized disposable fixture for the existing inventory regression suite; it refuses a non-test fixture name and does not reset a used database. `--local-only` is available for local-boundary regression on that isolated fixture. It never switches the active studio configuration or restarts its services.

## Files for this change

Backend: `src/LocalAccess.php`, `src/Auth.php`, `src/Api.php`, `src/Config.php`, `src/bootstrap.php`, `config.example.php`, `bin/local-single-user.php`, `bin/local-bridge.php`, `tests/local-access.php`.

Frontend/launcher: `app/authenticated-studio.tsx`, `lib/api.ts`, `lib/local-loopback.ts`, `vite.config.ts`, `scripts/start-local-single-user.ps1`.

Tests/docs: `scripts/check-local-single-user.mjs`, `scripts/check-local-loopback.mjs`, `scripts/check-ui.mjs`, `package.json`, `README.md`, `docs/LOCAL-SINGLE-USER.md`.

These are separate from earlier preview/investigation/password-recovery changes already present in the working tree.

## Approved activation verification

The launcher is running the frontend on loopback port 5173 and personal PHP on loopback port 8001. Live verification through the actual proxy confirms anonymous session discovery, denied anonymous inventory access, required CSRF, successful local bootstrap and HTTP 200 for stock, dashboard, brands, tare profiles, spools, catalogue, activity, printers and scale-reading. Direct access to the backend without the private bridge and requests with foreign Origin both return 403. No mutation endpoint was used against the real personal inventory during verification.

Personal stock remains empty at revision 0, with one approved local audit operator. All original table row counts across the eight retained test databases still match the pre-personal-setup snapshot. Detailed non-secret verification is retained in `work/local-single-user-activation-verification.json`; session cookies, CSRF tokens and private bridge material are not written there. The Vite watcher now excludes private backend, work, capture and backup trees to avoid Windows EBUSY errors from unrelated private artifacts.
