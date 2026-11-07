# Phases 3–6 and 8: local implementation review

Scope: review completed work, fill safe staging-preparation gaps, then stop after Phase 8. No labels regenerated, migrations applied, inventory or associations changed, deployments performed, credentials issued or firmware flashed in this pass. Phases 2 and 7 are treated as complete. Phases 9–11 are not started or rerun.

## Phase 3 — Add filament with an UNUSED QR

**Completed:** Add spool embeds the existing permission-based camera/paste scanner. The authenticated backend verifies the registered identifier is UNUSED. The review includes its label ID; confirmed registration creates the spool and binds the QR inside the same inventory transaction. Backend rechecks under row locks, independent of frontend status. Failures roll back spool, QR assignment, revision and history. Permanent spool code is allocated automatically by the existing unique sequence, rather than accepted as an editable identifier. Existing brand, material, colour, capacity, starting/current mass and tare fields are reused.

**Tests passed (existing evidence):** 29 QR backend checks, including a forced failure after binding and a two-process assignment race; real PHP QR HTTP authentication/registration tests; Add-form UNUSED/ASSIGNED handling and confirmed-payload UI checks.

**Pending:** actual mobile form/camera behavior on an authenticated HTTPS staging origin. The newer combined QR-to-Wi-Fi application test did not complete: its test harness failed to capture an explicit GET snapshot. It is not counted as a passing end-to-end result and is deferred with Phase 9.

**Blockers:** no configured/approved reachable staging environment. No actual spool is created or modified by this review.

## Phase 4 — Scan an existing assigned QR

**Completed:** registered labels resolve through the authenticated API to one existing active spool. Selection shows its identity, saved balance, tare, recent spool-specific history and the existing live estimate/review panels. Scan does not call registration or save inventory. Legacy code QR, opaque NFC URL, manual code and optional reader selection remain compatible. Unknown, retired and archived mappings are rejected.

**Tests passed (existing evidence):** actual QR encode/decode, QR scanner permission/cleanup/current-inventory checks, assigned-label HTTP resolution, common resolver checks and existing live calculation/review tests.

**Pending:** real-phone scanning and combined staging verification. Inventory history shown in the selection panel is the recent subset; complete history remains preserved in the database/activity workflow.

**Blockers:** same staging access dependency; the incomplete combined harness run is not proof of a product failure or a completed end-to-end pass.

## Phase 5 — One active managed QR per spool

**Completed:** QR primary key, generated active-spool unique index, foreign keys, state CHECKs and lifecycle/no-delete triggers enforce one binding, immutable assigned identity and permanent retirement. Authenticated, explicitly confirmed replacement retires the old label and binds an UNUSED replacement in one transaction. Failed replacement restores the old active QR. Spool ID, balances, NFC mappings and prior history remain intact; QR events are audited.

**Tests passed (existing evidence):** SQL transfer/identity/delete/reuse/uniqueness refusal, duplicate registration rollback, replacement preservation, retirement and concurrent double-assignment checks within the 29-check backend suite; HTTP duplicate and retired-label behavior.

**Pending:** operator usability checks on staging. Any real spool binding/replacement remains an explicit user action, not something performed in this review.

**Blockers:** none identified in local lifecycle implementation; actual shared-host trigger/generated-column support and migration privileges are unverified.

## Phase 6 — Wi-Fi Smart Scale

**Completed:** opt-in NodeMCU network build uses verified HTTPS trust anchors/time/hostname, separate device bearer credentials, bounded reconnect/backoff and latest-only uploads. Backend validates device credentials, timestamps, boot identity and increasing sequence; rotation/revocation invalidate old access. Authenticated browser polling preserves packet age and navigation lifetime. Offline/stale readings are unavailable. Gross-minus-tare remains UNVERIFIED, requires empty-platform gross confirmation and an explicit manual save with revision/version protection. USB remains an explicit diagnostic fallback. No device credential can authenticate an inventory user or automatically update stock.

**Tests passed (existing evidence):** 21 Wi-Fi backend checks; Wi-Fi transport/UI tests; 18 manual-estimate backend checks; previously successful real-app/PHP/MariaDB manual-save integration with simulated USB; strict scale/API/protocol regressions. Both USB and unconfigured Wi-Fi firmware compiled against ESP8266 core 3.1.2. These are software/simulated evidence, not a radio or live-host certificate test.

**Pending:** approved staging-only endpoint, CA and device provisioning; real join/rejoin, power-cycle, upload latency and heap/watchdog behavior. The combined newer QR/Wi-Fi application harness remains incomplete, as above.

**Blockers:** no approved firmware flash or configured staging hardware connection. The 500 ms freshness gate and potential synchronous TLS acquisition pauses remain deliberately fail-closed; no thresholds were relaxed.

## Phase 8 — Separate staging PHP/MySQL preparation

**Completed:** added `backend/config.staging.example.php`. It requires staging-specific environment values, rejects the known production origin/database/login and local personal/test targets, uses AUTHENTICATED mode with HTTPS/cookie hardening, keeps secrets outside public roots and disables device ingestion until explicitly enabled. It never falls back to production credentials. Existing session/CSRF/admin/PDO protections and read-only preflight tooling are reused.

**Tests passed (existing evidence):** existing authentication/CSRF, 68 inventory HTTP, 24 scale endpoint, 102 local-access and backup-gate checks. New staging template receives only a syntax check in this pass; it has not been exercised on shared hosting. No new Phase 9 suite is run.

**Pending/blockers:** select and approve a distinct staging origin/database/login; verify actual host PHP/PDO/MySQL version, HTTPS chain, environment propagation, Authorization forwarding, rewrite rules, private paths and trigger permissions. The production host was previously unreachable from this environment; capability is not assumed. See the staging setup instructions below. Existing review ZIPs predate this managed-QR work and are not a complete current release; artifact refresh belongs to the deferred Phase 11.

## Exact staging preparation instructions — do not execute without approval

1. Choose a separate HTTPS staging hostname and a dedicated staging database/login. Do not use `fila.dlts.in`, `dltsin_fila`, `dloop_personal` or phase5a databases. Obtain approval for provisioning and access changes before creating or configuring them.
2. Confirm maintained 64-bit PHP 8.2+ with PDO MySQL/JSON/sessions, MySQL 8.0.16+ or MariaDB 10.6+, InnoDB/CHECK/generated-column/trigger support and the migration account's required DDL/TRIGGER privileges. Confirm Apache 2.4 or equivalent API-first rewrites, HTTPS reaching PHP correctly, forwarded Authorization availability and same-origin camera permission policy. Do not expose phpinfo or a setup/migration page.
3. Prepare separate directories, using actual approved account paths:

   ```text
   /home/ACCOUNT/dloop-staging-private/  src/ bin/ migrations/ config.local.php var/
   /home/ACCOUNT/staging-public/         index.html assets/ .htaccess api/v1/index.php
   ```

   Keep configuration, sessions, backups and credential files outside every web root. Set the private `DLOOP_APP_DIR` and `DLOOP_CONFIG_FILE` paths through the trusted PHP handler; never put secrets in public `.htaccess`, source, frontend VITE variables, logs or documentation.
4. Copy `backend/config.staging.example.php` to the private staging `config.local.php`, and provide these values through the hosting provider's private environment mechanism:

   ```text
   DLOOP_STAGING_ORIGIN=https://APPROVED-STAGING-HOST
   DLOOP_STAGING_DB_NAME=APPROVED_SEPARATE_STAGING_DATABASE
   DLOOP_STAGING_DB_USER=APPROVED_SEPARATE_STAGING_LOGIN
   DLOOP_STAGING_DB_PASSWORD=<entered privately; never echo>
   DLOOP_STAGING_APP_KEY=<independently generated secret; never echo>
   DLOOP_STAGING_WIFI_SCALE_ENABLED=0
   ```

   These are placeholders, not live configuration. The template's environment=`production` selects security behavior, not the production database/site. There is no need for production credentials during local or staging work.
5. After approval for read-only access, run the private `php bin/production-preflight.php` and `php bin/migrate.php --status` with the staging configuration selected. Inspect actual row counts and ledger checksums; do not assume the database is empty. Stop for schema reconciliation if existing tables are untracked or incompatible.
6. Migration application is a separate approved action. Any existing staging data requires a protected, checksum-verified backup and isolated restore verification first. The existing production-mode migration gate requires its matching private manifest. Do not rerun completed local migrations or modify production. Existing-runtime permissions for QR are SELECT (already schema-wide locally), INSERT on batches/events, and INSERT/UPDATE on labels; no QR DELETE/DDL. Device-table grants and credentials require separate approval.
7. Preserve existing hosted users. Use the private first-admin tool only after proving the staging database has no administrator and setup is legitimately uninitialized. Do not create/reset accounts unnecessarily, and never enable public LOCAL_SINGLE_USER bootstrap.
8. Current printed IDs are registered in the local personal registry. A fresh staging database will not know them automatically. Before using those physical stickers on staging, approve a separate registry/data transfer plan with batch/label/spool/user-ID reconciliation. Do not regenerate their identifiers or register a scanned unknown token automatically. Assigned/retired identities must never be imported as UNUSED.
9. No deployment, staging migration, device credential issuance or flash is executed by this document. The Wi-Fi private header can target the approved staging endpoint and verified CA later, but real hardware actions and the Phase 9–11 verification/deployment work remain deferred by the current instruction.

## Changes in this bounded pass

- Added staging-only environment configuration template.
- Added this phase-by-phase review and staging setup plan.
- No application workflow rewrite, generated label, database write, build/package refresh, service restart or hardware operation.

Stop point: Phase 8 preparation. Production remains blocked.
