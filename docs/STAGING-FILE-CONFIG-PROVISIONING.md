# Private file-backed staging configuration provisioning

Local preparation only. No upload, cron creation, database connection, migration, real secret generation/change or public deployment has occurred.

## Decision and implementation

Use one non-executable JSON secrets file, loaded by a staging-only replacement for the private config.local.php. Both LiteSpeed and CLI consume that same file through the existing Config::load validation. No secret values are copied into environment variables, cron commands or public source. JSON avoids executing secret-file contents as PHP. No .env parser or dependency is needed.

Config.php already defaults to APP_ROOT/config.local.php and validates security settings, private session storage and database configuration. It remains unchanged. The existing environment-backed staging and production templates remain unchanged, as do native CLI scripts, bootstrap, migrations and historical packages. This is an explicit staging-only overlay, not an automatic environment fallback.

The new file template fixes HTTPS staging origin, AUTHENTICATED mode, local DB host/port, database/user dltsin_fila_stage and a default disabled Wi-Fi profile. It sets environment=production solely to retain HTTPS/session security and the existing backup gate. Missing/invalid secrets fail closed. Neither environment credentials nor brand/inventory/QR data are used as defaults.

## Exact hosted layout proposed for later approval

```text
/home4/dltsin/fila-staging-private/                 0700, owner dltsin
  config.local.php                                 0600
  secrets/                                        0700
    staging-secrets.json                           0600
  bin/
    validate-staging-config.php                    0600
    common.php, migrate.php, production-preflight.php ... unchanged
  src/                                            unchanged
  migrations/                                     unchanged
  var/                                            0700
    sessions/                                     0700
    backups/                                      0700
    deployment-evidence/                           0700
```

No symlinks or web aliases should point into this tree. Confirm every document root with the provider, not just staging and production. The file template checks the known /home4/dltsin/public_html tree and the active DOCUMENT_ROOT when available, resolves the secrets path, requires it to remain inside the private root, and on Linux rejects group/world access to the private root, config, secrets directory and secrets file. Ownership must match the configuration file's owner; operator/provider must independently confirm that owner is dltsin. PHP filesystem checks do not establish isolation from another application running as the same Unix user.

Confirm LiteSpeed and CLI run as the account and can traverse/read these paths within open_basedir. If 0700/0600 is incompatible, stop for provider review instead of widening access to world-readable. No service restart is authorized.

Secrets format (example has empty values and deliberately fails validation):

```json
{
  "databasePassword": "",
  "appKey": ""
}
```

Enter the existing staging database password and independent staging app key only after provisioning approval. The app key must be at least 32 characters; use an existing valid staging key if already provisioned. If no key exists, generating a new staging key requires explicit approval. Do not rotate an existing key/password. Preserve characters exactly and use valid JSON escaping for quotes/backslashes. Do not paste values into chat, tickets, screenshots, public files or source control. JSON file must contain exactly these two string keys. Keep editor backup copies and account backups private as well.

## Files prepared locally

- backend/config.staging-file.example.php: install as private config.local.php; reads fixed private JSON path and returns pinned staging configuration.
- backend/staging-secrets.example.json: blank format reference only; not a live secrets file.
- backend/bin/validate-staging-config.php: CLI-only, no arguments; loads bootstrap/config, validates exact staging identity, outputs one generic PASS/FAIL line; no DB connection, session start, inventory read or filesystem write.
- scripts/prepare-staging-file-config.mjs: creates a separately checksummed review overlay from the existing release; verifies the base API-entry checksum. It does not change the existing release or deploy anything.
- scripts/check-staging-file-config.mjs and backend/tests/bootstrap-declarations.php: synthetic configuration and bootstrap regressions.
- .gitignore: excludes actual staging-secrets.json files and backend/secrets.
- This runbook.

The generated future-public-only/api/v1/index.php is a derivative of the existing packaged API entry. Its only intended changes are a staging hostname guard, the literal nonsecret private backend path, and process-local DLOOP_CONFIG_FILE selection of that private config. It preserves existing exception redaction, request handling and security logic. That path selector contains no secrets. Do not upload this public derivative during private provisioning approval. It dispatches the real API and can connect to the database when later deployed; it is not a diagnostic endpoint.

The validator likewise pins its own private config path before loading it, so inherited DLOOP_CONFIG_FILE overrides cannot select production. Existing other CLI commands retain their original selection behavior; future approved commands must explicitly select the same private config using only the nonsecret path. No DLOOP_STAGING_* values are required by this template. Stale environment values do not alter its target or enable Wi-Fi.

## Bootstrap dependency audit

bootstrap.php includes, in order: Http.php, Config.php, LocalAccess.php, Database.php, Validation.php, Auth.php, Inventory.php, SpoolSelection.php, WifiScale.php, QrLabels.php and Api.php. Each contains class declarations only at top level. No constructor, connect(), dispatch(), session_start(), inventory mutation, migration, credential provision or file-writing method is called by inclusion. The token-based regression permits only declarations and bootstrap includes at top level; the complete include list was inspected.

Config::load executes the selected configuration file, reads/decodes JSON through the new template, checks session directory writability and validates settings. It does not connect to a database or start a session. The new template does not call putenv for secrets or perform writes. The validator only sets a nonsecret path, changes process error/output handling and emits its result.

common.php retains its CLI guard, timezone/error settings and bootstrap include. It does not call cliConfig() merely through inclusion. production-preflight.php and migrate.php DO execute database logic at top level when invoked; they are not included or invoked by the new validator. The public API entry emits headers and dispatches requests when invoked; it is not included by the validator either.

## File Manager procedure after explicit approval

1. Reconfirm private path, owner, permissions, all document-root mappings and LiteSpeed/CLI access. Keep staging public deployment unchanged.
2. Download/preserve the existing environment-backed config.local.php privately, including its checksum and permissions. Do not overwrite an unexpected live configuration without review.
3. Create the private directories above if absent. Do not change existing sessions/backups or move inventory/QR data.
4. Upload only overlay private/config.local.php to /home4/dltsin/fila-staging-private/config.local.php and private/bin/validate-staging-config.php to /home4/dltsin/fila-staging-private/bin/validate-staging-config.php. Verify file hashes against the overlay manifest; set 0600.
5. Create the actual secrets JSON privately through File Manager only after secret-provisioning approval. Use the existing staging password; supply an approved independent staging key once. Set 0600. Do not upload the blank example under the live filename and mistake it for configured secrets.
6. Do not upload future-public-only/, review-only/, tests, firmware or the full archive to any web root. Keep evidence/manifest in the private evidence directory if needed. No production file changes.
7. Request/confirm approval for the following validator-only cron. No native preflight or migration script runs in this step.

## Nonsecret validation without SSH - later approval only

Use the confirmed CLI binary with -n to skip PHP INI files and configured prepend scripts. This intentionally tests the configuration loader in isolation, not configured extensions. The command does not print INI values, paths or extensions. It disables displayed/logged errors and the script redacts failures. An output-file creation guard prevents repeated validator execution. First confirm the output filename is absent.

Schedule fields: minute *, hour *, day *, month *, weekday *.

```sh
( umask 077; set -C; /opt/cpanel/ea-php83/root/usr/bin/php -n -d display_errors=0 -d log_errors=0 /home4/dltsin/fila-staging-private/bin/validate-staging-config.php > /home4/dltsin/fila-staging-private/var/deployment-evidence/staging-config-validation.txt ) >/dev/null 2>&1
```

Once the file appears, remove this specific cron immediately before reading/deleting evidence. Do not change unrelated jobs or cron email settings. The entry remains scheduled until removed even though the guard prevents re-execution.

Success output only:

```text
PASS: staging configuration valid; no database connection attempted.
```

Failure output only:

```text
FAIL: staging configuration validation failed.
```

An empty file is also failure: do not infer success or retry database scripts. Review JSON syntax, required values, ownership, permissions, session directory and provider filesystem restrictions privately. Do not print configuration to debug. Remove the cron first, then preserve only approved nonsecret evidence or delete the output. The validator may remain private for later authorized checks or be removed after validation.

This proves only CLI configuration loading. It does not establish LiteSpeed filesystem access, web routing, extension availability, database connectivity/grants, backup restore or public deployment readiness. Web use consumes the same JSON via the future entry and must be verified in a later approved public deployment; no public config-check endpoint is proposed.

## Backup gate and later commands

No migrator logic is modified. The returned environment remains production so --apply still requires DLOOP_BACKUP_MANIFEST. Both dump and manifest must resolve beneath /home4/dltsin/fila-staging-private/var/backups, match database dltsin_fila_stage, satisfy minimum dump size/hash checks and attest a genuinely verified isolated restore. /home4/dltsin/fila-staging-backups remains an optional separate retention directory, not a substitute for that gate.

Configuration validation does not inspect or satisfy backup evidence. Do not create a restoreVerified=true manifest in this step. Any future original CLI invocation must explicitly select DLOOP_CONFIG_FILE=/home4/dltsin/fila-staging-private/config.local.php; this is a nonsecret path, not credentials. No --apply, --status or production-preflight command is scheduled now.

## Local results and limits

Passed syntax checks and 21 existing database-free PHP unit checks. Passed synthetic file-backed config tests: valid pinned staging configuration; inherited production/enablement overrides ignored; missing, malformed, wrong-key/type, short-key and empty-password secrets rejected; bad session/public-root paths rejected; exact generic output with no synthetic secret values. Tests run with no PDO drivers available. Bootstrap and all 11 dependencies passed the top-level declaration audit.

Local interpreter is PHP 8.4.27 on Windows; target CLI is PHP 8.3.36 on Linux. Implementation uses PHP 8.3-compatible syntax, but target runtime execution and Linux mode/ownership enforcement remain unverified until the approved validator cron. No real secrets or database connections were used in tests. Synthetic fixtures remain in ignored work/ only.

## Rollback and approval boundary

If private validation fails: remove the cron, retain generic evidence, restore the prior private config file and its permissions. Quarantine/remove only newly introduced files after confirming they were created by this step. Preserve existing secrets/session/backup data; never delete existing staging key material. No database rollback is needed because this operation makes no DB connection. Do not enable an environment-backed fallback silently; reverting that template may leave staging unconfigured, which is an acceptable fail-closed state.

Next approval requested: private configuration/validator upload, private secrets-directory provisioning, entering the existing staging password and an existing/explicitly approved new staging-only app key once, and one validator-only cron with immediate cleanup. Public API upload, database preflight/status, migration, grants, credential rotation, inventory/QR operations and hardware actions remain separately excluded. STOP here.

## Artifact observation during this pass

The existing staging artifact now contains an unmanifested private/bin.zip. Its 57 recorded file hashes still validate, but the strict complete-directory checker fails because of this extra file. The archive was not created, opened or removed by this pass. Do not upload it or treat that directory as a clean complete release until it is reviewed. The new overlay is separate, contains only its manifest-listed files and no live secrets, and verifies the original API-entry hash before deriving its future entry.

Final local review overlay: outputs/staging-config-overlay-2026-11-06T03-24-48-958Z. Private changes and future public entry have separate paths; public deployment remains excluded.


## Explicit staging Wi-Fi profile (local implementation)

The original disabled setting was a deployment safety gate for the first smoke pass, before separate device provisioning/ingestion approval (see CPANEL-STAGING-PREDEPLOYMENT.md). It remains the default. It is not the acceptance profile for an operating Wi-Fi workflow.

For a reviewed file-backed staging deployment, select `$profile = 'wifi-enabled';` in the private config copied from `backend/config.staging-file.example.php`. Keep `staging_wifi_profile` and the derived boolean together; do not simply force `wifi_scale_enabled=true`. The secret JSON still contains exactly databasePassword and appKey. Environment switches cannot enable this file.

For the environment-backed staging template, explicitly set `DLOOP_STAGING_WIFI_PROFILE=wifi-enabled`. The legacy `DLOOP_STAGING_WIFI_SCALE_ENABLED=1` alone now fails closed; it cannot select the profile. With no profile and no legacy enable request, Wi-Fi stays disabled.

Both profiles require database AND user `dltsin_fila_stage`, localhost:3306, the sole allowed origin and phone origin `https://staging-fila.dlts.in`, AUTHENTICATED access and production HTTPS/session hardening. `Config::load` enforces these requirements at runtime before a database connection. Production config and its separate opt-in are unchanged; staging variables never opt production into Wi-Fi.

After separate deployment authorization, deploy the matching updated Config.php, selected staging template, validator, read-only preflight and diagnostic as a reviewed set. The old two-file configuration overlay alone does not include the new runtime guard. Preserve existing private secrets, sessions and routing. The diagnostic still checks exact reviewed source; it recognizes only the two literal profile selections, not arbitrary edits.

Run `php bin/validate-staging-config.php`, then `php bin/diagnose-staging-config.php` in the private staging backend. These validate configuration without connecting to a database. Run `php bin/staging-readonly-preflight.php` only against the verified staging installation; it performs read-only preflight and migration status checks. Inspect staging-account grants separately to ensure no production privileges. These checks verify configured identity, not hosting document-root isolation or database grants.

No deployment, credential operation, database access, migration, device provisioning or firmware change is performed by this local update. Live balance/history/provenance verification remains outstanding. After an authorized upload, use read-only staging SQL to reconcile the existing 78.99 g save and correction history; configuration validation does not establish persistence or calibrated accuracy.
