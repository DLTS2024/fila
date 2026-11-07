# Fast-track staging deployment - single checklist

Current user-confirmed gates are accepted: PHP 8.3.36 CLI, private backend/secrets, corrected private permissions, PASS: STAGING_CONFIGURATION and no temporary cron jobs. Do not repeat configuration diagnostics or provision another app key. No hosting action or DB connection occurred during this local preparation.

Release: outputs/staging-public-2026-11-06T04-34-20-536Z. Exactly 13 file checksums plus manifest metadata; public files and ONE new private read-only wrapper. No config/secrets/private backend replacement. Eight migration hashes are recorded and match the previously reviewed package byte-for-byte. Existing backup gate/migrator is unchanged.

Four remaining stages. Stage 1 may be approved now independently. Stages 2-4 require explicit write/deployment approvals.

## 1 - READ-ONLY: one private upload, one preflight cron

Upload only private/bin/staging-readonly-preflight.php to /home4/dltsin/fila-staging-private/bin/staging-readonly-preflight.php. Preserve private access restrictions; do not replace any existing configuration, secrets, loader, migration or validator. Verify transferred code checksum against manifest. If this destination already exists, compare/preserve before replacement.

After read-only connectivity approval, use cPanel Cron schedule * * * * *, with this exact command (output filename must be absent):

```sh
( umask 077; set -C; /opt/cpanel/ea-php83/root/usr/bin/php -d auto_prepend_file= -d auto_append_file= -d display_errors=0 -d display_startup_errors=0 -d log_errors=0 /home4/dltsin/fila-staging-private/bin/staging-readonly-preflight.php > /home4/dltsin/fila-staging-private/var/deployment-evidence/staging-readonly-preflight.txt 2>&1 ) >/dev/null 2>&1
```

Remove this cron immediately when output appears, BEFORE deleting output. Noclobber prevents repeat execution, not repeat scheduling. Do NOT use -n: this phase requires the configured CLI PDO MySQL driver. Prepend/append scripts are explicitly disabled instead. An empty/failed output is a stop.

The wrapper pins config.local.php and verifies exact staging database/user, origin, AUTHENTICATED, production security mode and Wi-Fi=false BEFORE a connection. It then runs the EXISTING production-preflight.php read-only transaction followed by migrate.php --status. Status takes an advisory lock but makes no persistent DB changes. No --apply is accepted/passed by this wrapper.

Require database=dltsin_fila_stage, supported runtime, no CHECKSUM_MISMATCH, no unknown migrations or nonempty untracked schema, and understood counts. On a truly empty DB, absent ledger/all pending is expected. If all eight migrations already match, migration application is unnecessary. The wrapper also checks CLI pdo_mysql; web extension checks are already successful and need not be repeated.

For any later phpMyAdmin write, first select the intended database and run SELECT DATABASE(), CURRENT_USER(), VERSION(); confirm the selected target. phpMyAdmin's account may differ from the application's user; confirm staging runtime/migration grants separately via cPanel/provider. Never select production. If tables exist, inspect installation_state/users and QR counts read-only in staging, without importing personal records.

## 2 - BACKUP: staging export and isolated restore rehearsal

Approval covers ONLY staging backup and writes to a named EMPTY rehearsal database, never restoration into staging/production. Identify/approve the rehearsal database and limited login first. Quiesce staging writers and keep public publish pending.

In authenticated cPanel phpMyAdmin: select dltsin_fila_stage, reconfirm identity, Custom SQL Export structure+data+triggers. Disable DROP statements and CREATE DATABASE/USE statements. Retain a valid nonempty SQL dump even if the DB is empty. Inspect it for source-qualified writes, cross-schema references and DEFINER clauses. An export alone is NOT restore verification. If options/consistency/trigger privileges cannot be assured or the dump exceeds import limits, request provider-assisted export/restore; do not bypass.

In the named isolated EMPTY rehearsal database, independently verify identity then import the inspected dump. Prefer credentials restricted to that rehearsal DB, particularly because cPanel SSO may have broader access. Do not use --force or reset an existing schema. Compare actual table counts, schema/indexes/constraints, ledger/checksums and trigger definitions/definers. Any error blocks migration. For an empty source, verify the corresponding empty restore without creating dummy application records.

After genuine success, upload the SAME uncompressed SQL bytes to /home4/dltsin/fila-staging-private/var/backups/pre-stage.sql. Calculate SHA-256 locally before transfer, download the uploaded copy to verify equality/hash, and keep dumps private. Dump must be >=100 bytes. Store this truthful manifest at /home4/dltsin/fila-staging-private/var/backups/verified-stage.json:

```json
{
  "database": "dltsin_fila_stage",
  "backupFile": "/home4/dltsin/fila-staging-private/var/backups/pre-stage.sql",
  "sha256": "ACTUAL_DUMP_SHA256",
  "restoreVerified": true
}
```

Both files must be private 0600 and resolve beneath the backend's var/backups directory. /home4/dltsin/fila-staging-backups is retention only. No dummy dump or premature restoreVerified=true. Retain rollback copies of existing staging public/private files and config references before changes.

## 3 - MIGRATION: apply only if pending, then initialize auth if needed

Only after stage 1, backup/rehearsal and explicit migration approval, use a separate one-attempt cron (* * * * *) with an ABSENT output filename:

```sh
( umask 077; set -C; DLOOP_CONFIG_FILE=/home4/dltsin/fila-staging-private/config.local.php DLOOP_BACKUP_MANIFEST=/home4/dltsin/fila-staging-private/var/backups/verified-stage.json /opt/cpanel/ea-php83/root/usr/bin/php -d auto_prepend_file= -d auto_append_file= -d display_errors=0 -d display_startup_errors=0 -d log_errors=0 /home4/dltsin/fila-staging-private/bin/migrate.php --apply > /home4/dltsin/fila-staging-private/var/deployment-evidence/staging-migration.txt 2>&1 ) >/dev/null 2>&1
```

Remove cron immediately after output. The variables above contain ONLY nonsecret private paths. The unchanged migrator verifies backup database/path/hash/size/restore attestation before connecting. It checks lexical order 0000-0007, ledger checksums, unknown migrations and schema adoption rules, and uses an advisory lock. Stop on the FIRST failure; DDL can commit partially. Never reset/drop/retry blindly or alter applied migration files. Verify all migrations applied afterward by repeating the stage-1 read-only command with a NEW output name staging-postmigration.txt.

Confirm migration grants before applying: schema-scoped SELECT/INSERT/UPDATE/CREATE/ALTER/TRIGGER and required index operations; no production/global access. The 0007 trigger definer must remain valid with TRIGGER and required SELECT/UPDATE privileges on qr_labels. Do not blindly revoke TRIGGER from its definer after deployment. Runtime privilege reduction is separately reviewed, not an automatic cron step.

Authentication is mandatory for an operational site. If users already exist, preserve them and use the existing authorized staging login. If users=0 AND installation_state.initialized_at IS NULL, obtain explicit approval for one staging administrator. Prepare a 0600 private one-use JSON input file (email/password) at /home4/dltsin/fila-staging-private/var/deployment-evidence/first-admin-input.json; no values in cron arguments, screenshots or logs. Use only a staging password. The native CLI tool refuses setup when already initialized/users exist.

Later approved admin-init cron command, with absent output file:

```sh
( umask 077; set -C; DLOOP_CONFIG_FILE=/home4/dltsin/fila-staging-private/config.local.php /opt/cpanel/ea-php83/root/usr/bin/php -d auto_prepend_file= -d auto_append_file= -d display_errors=0 -d display_startup_errors=0 -d log_errors=0 /home4/dltsin/fila-staging-private/bin/create-admin.php < /home4/dltsin/fila-staging-private/var/deployment-evidence/first-admin-input.json > /home4/dltsin/fila-staging-private/var/deployment-evidence/staging-admin-init.txt 2>&1 ) >/dev/null 2>&1
```

Immediately remove cron, verify generic success privately, then securely remove the one-use input including its File Manager Trash copy. Preserve actual existing credentials/accounts. No password reset. If private secret-input handling cannot be assured, provider assistance is the auth-init blocker.

Collation decision: current latin1_swedish_ci default is NOT a blocker for current payloads. 0000-0003 tables explicitly use utf8mb4_unicode_ci; 0006/0007 inherit the DB default for remaining text/ENUM fields, while identities use explicit ASCII collations. Current frame JSON is Unicode-escaped. Fastest safe path leaves collation unchanged and records mixed defaults. Optional standardization to utf8mb4_unicode_ci needs SEPARATE approval, ideally before pending tables are created; changing a DB default does not convert existing tables. No collation change is included in these commands.

## 4 - PUBLIC DEPLOYMENT: File Manager transfer and smoke checks

Approval covers only /home4/dltsin/public_html/staging-fila. Production root /home4/dltsin/public_html/fila.dlts.in is excluded. Preserve prior staging files and cPanel-generated handler directives. Resolve any existing index.php that would shadow index.html through a reviewed staging-only change; do not blindly delete files.

Upload CONTENTS of package public/ directly to the staging root, preserving these paths:

```text
public/.htaccess
public/api/v1/index.php
public/assets/browser-DGnZlSaT.js
public/assets/esm-Crm5CqZu.js
public/assets/html2canvas-CMvqFnj8.js
public/assets/index-CHCOUumI.js
public/assets/index-DELd5KUX.css
public/assets/index.es-C_bEbRgc.js
public/assets/purify.es-DN166tdv.js
public/assets/qr-label-pdf-bVJwoBIS.js
public/favicon.svg
public/index.html
```

Do not upload the release's private/, manifest or evidence publicly. Manifest stays local/private. No secrets/config/backend/SQL/firmware are in this public tree. The PHP entry pins the private backend and config paths; it contains no credential. The .htaccess denies alternate hostnames before file serving, redirects HTTP to staging HTTPS, forwards Authorization, routes API before SPA and denies indexes/sensitive filenames. These are locally prepared rules, not proven LiteSpeed behavior. Review merged provider handler directives and record any derivative checksum.

Mandatory smoke checks: trusted certificate for staging; HTTP redirects only to staging HTTPS without loops; / and every asset load; GET /api/v1/auth/session returns anonymous JSON/AUTHENTICATED; anonymous stock/QR/scale GETs return 401; unknown API returns JSON 404; GET auth/login returns 405; approved staging login succeeds with host-only Secure/HttpOnly/SameSite cookie. Login writes auth/session state and belongs to this approval, not stage 1. No spool/brand/QR generation, assignment or estimate save.

Verify parent hostname /staging-fila/index.html and known staging asset paths are denied, and the production hostname cannot serve staging content. Parent-domain mappings/aliases and parent .htaccess inheritance must be confirmed; do not change production. Verify private paths have no aliases/public exposure. Current .htaccess forwarding should be confirmed with provider tooling or an approved boolean-only dummy-header probe; disabled Wi-Fi responses alone do not prove Authorization propagation. No real device provisioning or flash.

PHP requirements: 64-bit >=8.2 (confirmed 8.3.36), PDO/pdo_mysql, JSON, sessions, filter, PCRE/hash/random/password functions. CLI pdo_mysql is checked in stage 1; web extensions were already confirmed. mysqli/mbstring are not dependencies of this PHP backend. OpenSSL availability was already confirmed; no repeat broad diagnostics. PHP must recognize HTTPS correctly through LiteSpeed. Missing handler capabilities or isolation are provider blockers.

## Rollback / stop points

Stage 1: remove cron; remove only newly uploaded wrapper if desired; no DB rollback needed. Rehearsal failures: preserve evidence and stop, never target staging for cleanup. Migration failure: keep ledger/dump/logs and stop for inspection; no automatic down migration, DROP or restore over data. Public failure: remove deployment cron(s), pause staging use and restore prior staging public/private COMPATIBLE code pair/config references. On first deployment return staging to prior placeholder/maintenance state, never production. Database restore requires separate approval and reconciliation of post-backup writes. Preserve secrets/sessions/QR history.

Local evidence: fresh build/typecheck/static verification passed; 13 release file hashes verified; eight migration files match historical reviewed release. PHP wrapper and public entry syntax passed. Wrapper tests use stubs only: wrong production identity rejected before preflight, missing CLI PDO driver fails closed, success invokes only read-only preflight plus --status. Initial test expected LF but Windows emitted CRLF; assertion normalization corrected and all tests pass. No database-backed or hosted tests were run.

Estimated remaining stages: FOUR, with conditional admin initialization inside stage 3. If schema/auth already exist, skip their writes after read-only confirmation. No reliable time estimate until restore resources and host/provider capabilities are confirmed. Immediate approval requested: upload the ONE private wrapper and run stage-1 read-only connectivity/status cron only. Backup/rehearsal writes, migration/admin creation and public upload remain separate explicit approvals. STOP before hosted operations.
