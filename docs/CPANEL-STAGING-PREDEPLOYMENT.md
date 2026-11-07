# cPanel staging pre-deployment runbook - 2026-11-06

Status: PREPARATION ONLY. No upload, server configuration change, database access, migration, account initialization, QR action or hardware operation has been performed by this verification. Every action below that changes hosting/data waits for explicit deployment approval.

Operator reports the subdomain and dedicated database/user already created:

| Target | Exact value |
| --- | --- |
| HTTPS origin | https://staging-fila.dlts.in |
| Staging database | dltsin_fila_stage |
| Staging database user | dltsin_fila_stage |
| Excluded production database/user | dltsin_fila / dltsin_fila |
| Excluded personal database | dloop_personal |

Do not create these staging resources again, reset their passwords, import production/personal data or reuse the existing 100 labels. Their creation is operator-reported; grants, contents and host settings have not been independently inspected.

## Current package verdict

Use only `outputs/staging-fila-2026-11-06T01-55-50-807Z` from this project. Revalidated: 57 manifest file hashes, staging environment/target, exact staging config template, all migrations 0000?0007, public/private layout and legacy firmware exclusion. No rebuild or package edits performed.

Manifest SHA-256: `ead09dd88f59afceb7354171a9d9dfd6474be7f12bfb8bbb8a00509d94485d1c`.

The artifact's `DEPLOYMENT.md` and `QR-STAGING-READINESS.md` are historical instructions: old proposed database names and missing-diagnostics text are superseded by this runbook. Keep the original package/manifest unchanged as evidence. This runbook is a separate deployment companion. `create-admin.ps1` is not in this artifact; use the packaged CLI `create-admin.php` procedure below. Firmware is review source only and must not be uploaded.

DNS resolved staging to `162.55.25.67`. A TLS-verifying curl HEAD attempt could not connect to port 443; the web reader also could not access the origin. This does not establish an invalid certificate or a server outage: network restrictions may contribute. Certificate, HTTPS response, root isolation and routing remain UNVERIFIED. Confirm the IP belongs to the intended hosting account with the provider.

## 1. Verify separate document root in cPanel

Open Domains, find **staging-fila.dlts.in**, and record its actual Document Root and redirect configuration. Compare with production using the panel; do not change production. Staging must not share or symlink to the production root or be an alias. Prefer a sibling directory outside production public_html; a nested staging directory under production public_html may also be publicly reachable through the production hostname and requires provider resolution before deployment. Inspect parent .htaccess inheritance and domain aliases.

Use File Manager Settings - Show Hidden Files to inspect the staging root. Record existing files, any default index.php/index.html and provider-generated PHP handler directives. Preserve them privately before an approved deployment; a stale index.php can override the new index.html. Do not blindly overwrite or delete files. Keep staging unavailable to ordinary users until the private backend and schema are ready.

Reference: [cPanel Domains](https://docs.cpanel.net/cpanel/domains/domains/).

## 2. Verify HTTPS certificate

In Security - SSL/TLS Status (or SSL/TLS Certificates), inspect staging's certificate: SAN includes staging-fila.dlts.in, valid dates, trusted complete chain, renewal/AutoSSL coverage. Do not regenerate a valid certificate unnecessarily. Any issuance/configuration action waits for approval. Do not alter production certificates.

From an operator workstation, after confirming the intended DNS target:

```sh
curl -I --connect-timeout 10 --max-time 20 https://staging-fila.dlts.in/
curl -I --connect-timeout 10 --max-time 20 http://staging-fila.dlts.in/
openssl s_client -connect staging-fila.dlts.in:443 -servername staging-fila.dlts.in -verify_hostname staging-fila.dlts.in -verify_return_error </dev/null
```

Use trusted local CA roots, no -k/browser exceptions. Require TLS validation and HTTP redirect to this staging hostname, never production. PHP must see HTTPS=on or SERVER_PORT=443; do not trust arbitrary forwarded headers. A proxy/handler mismatch can cause redirect loops and https_required. Have the provider confirm HTTPS propagation without restarting services in this task.

Reference: [cPanel SSL/TLS Status](https://docs.cpanel.net/cpanel/security/ssl-tls-status/).

## 3. PHP and database platform requirements

In Software - MultiPHP Manager inspect only the staging domain: provider-maintained PHP >=8.2, 64-bit, matching CLI and web versions. Do not apply an account-wide PHP change or change production. Ask the provider to enable missing features through the appropriate handler/extension manager after approval.

Required PHP extensions: PDO, pdo_mysql, json, session; openssl available for the hosting security/tooling checks. Require password_hash/password_verify with bcrypt, random_bytes, hash/HMAC, DateTime support, file locking and writable private sessions. No PHP Node.js runtime, Composer install, GD or Imagick is needed by this package. Frontend assets are already built.

Confirm the absolute CLI binary (example only `/opt/cpanel/ea-php83/root/usr/bin/php`) rather than assuming `php` selects the domain's version:

```sh
PHP=/CONFIRMED/ABSOLUTE/PHP_BINARY
"$PHP" -v
"$PHP" -r 'echo PHP_INT_SIZE*8," bits\n"; foreach (["pdo","pdo_mysql","json","session","openssl"] as $e) echo $e,": ",extension_loaded($e)?"yes":"NO","\n";'
```

Do not publish phpinfo. Confirm web handler separately in panel/provider tooling. Require MySQL >=8.0.16 or MariaDB >=10.6, InnoDB, utf8mb4, enforced CHECK constraints, generated columns, transactions, triggers and GET_LOCK. The application refuses unsupported DB versions. Current production-mode configuration permits only local DB hosts; if this host requires remote MySQL, STOP for a separately reviewed software/configuration change. Do not weaken validation.

Reference: [MultiPHP Manager](https://docs.cpanel.net/cpanel/software/multiphp-manager-for-cpanel/).

## 4. Staging-only privileges

In Databases - Manage My Databases (older panels: MySQL Databases), verify user **dltsin_fila_stage** is associated only with **dltsin_fila_stage**, never dltsin_fila or dloop_personal. Inspect existing grants first; do not change passwords or recreate users. Do not grant GLOBAL privileges, GRANT OPTION, SUPER, FILE or production access.

For the approved migration window only, schema-scoped SELECT, INSERT, UPDATE, CREATE, ALTER, INDEX, REFERENCES and TRIGGER are needed by the migration set. Backup tools may additionally need SHOW VIEW for views if any exist. Avoid blanket ALL PRIVILEGES. MySQL trigger creation under binary logging may require provider support; do not request global privileges or modify server settings as a workaround.

After migration and first-admin initialization, remove DDL grants from the web runtime. Preferred table grants below use this same staging user; if the panel only supports schema-wide privileges, ask hosting support to implement the table grants or approve a separate migration identity. No extra identity has been created.

| Runtime permission | Staging tables |
| --- | --- |
| SELECT | All application tables, including schema_migrations and installation_state |
| INSERT, UPDATE | brands, tare_profiles, catalogue_products, spool_code_sequences, spools, printer_slots, login_throttles, idempotency_keys, nfc_tags |
| UPDATE | studio_revision, users (password hash rehash) |
| INSERT | measurements, activity_events, activity_changes, qr_batches, qr_label_events |
| INSERT, UPDATE | qr_labels (never DELETE) |
| DELETE | nfc_tags only, required by explicit unlink/relink workflows |
| Later, device enablement approval only | UPDATE scale_devices; INSERT/UPDATE scale_device_boots and scale_live_readings |

First-admin CLI additionally needs INSERT users and UPDATE installation_state; remove these initialization-only privileges afterward. Device registration tools need separate reviewed grants later. Do not grant QR deletion or runtime schema changes. Confirm grants using the staging connection with `SELECT DATABASE(), CURRENT_USER(); SHOW GRANTS;` in the private hosting terminal after inspection approval. Expected DB is exactly dltsin_fila_stage. Stop if the target differs. Do not print passwords.

Reference: [cPanel database associations and privileges](https://docs.cpanel.net/cpanel/databases/mysql-databases/).

## 5. Confirm private paths and environment propagation

The following are path proposals, not observed server paths. Resolve ACCOUNT and actual provider home path before approval:

| Purpose | Proposed path requiring confirmation |
| --- | --- |
| Staging public root | /home/ACCOUNT/staging-fila-public |
| Private release | /home/ACCOUNT/dloop-staging/releases/staging-fila-2026-11-06T01-55-50-807Z/private |
| Private release evidence | /home/ACCOUNT/dloop-staging/releases/staging-fila-2026-11-06T01-55-50-807Z/evidence |
| Config | PRIVATE/config.local.php |
| Sessions/selection store | PRIVATE/var/sessions |
| Backup files/manifests | PRIVATE/var/backups |
| Backup connection option file | /home/ACCOUNT/dloop-staging/secrets/staging-backup.cnf |
| Restore connection option file | /home/ACCOUNT/dloop-staging/secrets/staging-restore.cnf |
| Restore rehearsal DB/login | Must be separately identified/approved; never staging or production |
| PHP binary, private error log | Provider must confirm both absolute paths |

All private locations must be outside EVERY web root, including aliases and production roots, and accessible within any open_basedir restriction. Restrict private directories to owner/handler (0700 where compatible), files/config/options to 0600; never 0777. Public files can normally be 0644/directories 0755. Confirm ownership and handler UID. Keep session directory separate from production. The exact template uses release-local sessions, not a stable external path. Preserve that directory across rollback, or separately review a stable-path configuration and its checksum; do not silently edit the artifact.

Use the provider's private per-domain PHP/FPM environment mechanism. MultiPHP INI settings and shell exports alone do not establish that web PHP receives environment values. Do not put secrets in public .htaccess, .user.ini, VITE variables, source control or logs. Do not use public setup endpoints. If private per-domain environment injection cannot be supported without service operations, deployment remains blocked for provider resolution.

Required values (password/key entered privately later; no credential changes now):

```text
DLOOP_APP_DIR=CONFIRMED_PRIVATE_RELEASE_PATH
DLOOP_CONFIG_FILE=CONFIRMED_PRIVATE_RELEASE_PATH/config.local.php
DLOOP_STAGING_ORIGIN=https://staging-fila.dlts.in
DLOOP_STAGING_DB_NAME=dltsin_fila_stage
DLOOP_STAGING_DB_USER=dltsin_fila_stage
DLOOP_STAGING_DB_PASSWORD=<existing staging password, entered privately>
DLOOP_STAGING_APP_KEY=<independent staging key, at least 32 characters, provision only after approval>
DLOOP_STAGING_WIFI_SCALE_ENABLED=0
```

Never supply DLOOP_DB_* production fallback values. The template's environment=production selects HTTPS/cookie hardening; it does not select production data. Config uses localhost:3306. Keep AUTHENTICATED access mode. CLI commands need the same private staging environment loaded securely; avoid secret exports typed into shell history and do not run printenv/phpinfo.

## 6. Exact upload mapping

In File Manager, use separate public/private transfers; show hidden files so .htaccess is included. Never extract the complete release archive into a document root. SFTP is also acceptable after approval. Preserve cPanel-generated handler directives: any merged .htaccess is a reviewed host-specific derivative with its own recorded checksum; do not pretend it matches the original manifest.

- Copy the CONTENTS of package `public/` to the confirmed staging root, with the same relative paths (not an extra public/ directory).
- Copy the CONTENTS of package `private/` to the confirmed private release path, preserving hierarchy.
- Copy manifest.json plus this runbook to private evidence only; keep package deployment notes there for historical reference.
- Do not upload firmware/, local tests, .dev.vars, local config, databases, personal QR PDFs/labels, captures, node_modules or production artifacts.
- Verify transferred file hashes against the original manifest, using the mapping below. Empty private var/sessions and var/backups directories are not file entries; create them privately only after approval.

Exact public file inventory:

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

Exact private file inventory:

```text
private/bin/common.php
private/bin/create-admin.php
private/bin/device-credential.php
private/bin/migrate.php
private/bin/production-preflight.php
private/bin/reset-admin-password.php
private/config.local.php
private/migrations/0000_schema_migrations.sql
private/migrations/0001_inventory_foundation.sql
private/migrations/0002_auth_and_installation.sql
private/migrations/0003_inventory_management.sql
private/migrations/0004_brand_tare_defaults.sql
private/migrations/0005_spool_tag_identity.sql
private/migrations/0006_wifi_scale.sql
private/migrations/0007_preprinted_qr.sql
private/src/Api.php
private/src/Auth.php
private/src/bootstrap.php
private/src/Config.php
private/src/Database.php
private/src/Http.php
private/src/Inventory.php
private/src/LocalAccess.php
private/src/QrLabels.php
private/src/SpoolSelection.php
private/src/Validation.php
private/src/WifiScale.php
```

Keep the site unpublished/restricted until migration and initialization succeed. Choose with the provider an isolated release switch or staging-only maintenance mechanism before uploading. Do not use HTTP Basic Auth for the final device API: its Authorization header conflicts with bearer-token ingestion.

## 7. Backup, restore rehearsal and migrations - commands for later approval

These commands are NOT executed. Replace every path placeholder first. Use cPanel Terminal/SSH with the confirmed PHP CLI and secure staging environment. Without CLI/private execution access, STOP; do not expose migrate.php through the browser or import individual SQL files ad hoc in phpMyAdmin.

```sh
PRIVATE=/CONFIRMED/PRIVATE/RELEASE/PATH
PHP=/CONFIRMED/ABSOLUTE/PHP_BINARY
cd "$PRIVATE"
"$PHP" bin/production-preflight.php
"$PHP" bin/migrate.php --status
```

Require database=dltsin_fila_stage, AUTHENTICATED, no checksum mismatches/unknown migrations. Nonempty untracked schema is a STOP. A newly created DB is not assumed empty. Inspect users, inventory and QR counts in staging only before writes. Never query personal/production data as part of this procedure.

Before migration, snapshot existing staging public/private trees and config references privately with checksums. Quiesce staging writes. Use provider/vendor-compatible mysqldump/mariadb-dump and mysql/mariadb. The two protected option files contain ONLY their approved staging or rehearsal connections, respectively; create them privately after approval, never place passwords in arguments.

```sh
umask 077
mysqldump --defaults-extra-file=/CONFIRMED/PRIVATE/staging-backup.cnf --single-transaction --quick --triggers --hex-blob --no-tablespaces --result-file="$PRIVATE/var/backups/pre-stage.sql" dltsin_fila_stage
sha256sum "$PRIVATE/var/backups/pre-stage.sql"
mysql --defaults-extra-file=/CONFIRMED/PRIVATE/staging-restore.cnf CONFIRMED_EMPTY_REHEARSAL_DB < "$PRIVATE/var/backups/pre-stage.sql"
```

Check each command exit status before continuing. Confirm dump is nonempty and has >100 bytes; a valid empty-DB dump still needs the gate. Do not use --databases: restore must not select/create the source staging DB. Inspect dump for source-qualified schema references/DEFINER issues before rehearsal. Rehearsal credentials must have no access to staging/production. Do not add --force. Compare schema, table counts, migration ledger/checksums and triggers after restore. Missing rehearsal database, restricted trigger support or an untested restore blocks migration.

Create PRIVATE/var/backups/verified-stage.json (0600) only after successful rehearsal:

```json
{
  "database": "dltsin_fila_stage",
  "backupFile": "/CONFIRMED/PRIVATE/RELEASE/PATH/var/backups/pre-stage.sql",
  "sha256": "ACTUAL_DUMP_SHA256",
  "restoreVerified": true
}
```

Both dump AND manifest must resolve inside this release's private var/backups directory; arbitrary external paths fail the current gate. Staging uses production security mode, so the backup gate applies even on first install.

Only after specific migration approval:

```sh
export DLOOP_BACKUP_MANIFEST="$PRIVATE/var/backups/verified-stage.json"
"$PHP" bin/migrate.php --apply
"$PHP" bin/migrate.php --status
"$PHP" bin/production-preflight.php
unset DLOOP_BACKUP_MANIFEST
```

Require all eight migrations applied with matching hashes. On first failure STOP, preserve logs/ledger, do not rerun blindly: MySQL DDL may already have committed. Do not DROP/reset the DB or relax checks. Migration seed rows are schema initialization, not an authorized import of inventory/QR records. Review resulting table counts before publishing.

## 8. First administrator initialization

After migrations, verify users count is zero AND installation_state.initialized_at is NULL in staging. The packaged create-admin.php locks this state and refuses initialization when users already exist. If setup is closed, preserve accounts and use their authorized login; do not reset passwords.

Only after separate approval to create the staging admin, provide JSON via standard input to the private PHP CLI. Do not type secrets into command arguments/history or use production credentials. If python3 exists on the host, this prompts on the terminal and sends JSON directly to PHP:

```sh
python3 -c 'import getpass,json,sys; sys.stderr.write("Staging admin email: "); sys.stderr.flush(); email=open("/dev/tty").readline().strip(); password=getpass.getpass("New staging admin password: "); sys.stdout.write(json.dumps({"email":email,"password":password}))' | "$PHP" bin/create-admin.php
```

Require a terminal, Python3 availability and a 12?72 UTF-8-byte password satisfying application validation. If unavailable, ask the provider for an approved hidden-input/stdin method; no public setup script or plaintext credential file in the web root. Confirm CLI success, remove initialization-only grants, then login through HTTPS UI. Verify secure HttpOnly SameSite=Strict host-only dloop_session cookie at /api/v1. Do not set a shared .dlts.in cookie domain. Login/logout can update auth/session state; these are approved smoke-test actions later, never inventory writes.

## 9. API routing and Authorization forwarding

The packaged .htaccess disables indexes/MultiViews, redirects HTTP to staging, routes ^api/v1 before the SPA fallback, and denies hidden/secret-like files. It requires Apache 2.4 rewrite/authz support or provider-confirmed equivalent (e.g. LiteSpeed). Confirm AllowOverride permits its Options/RewriteRule/Require directives and END flag. Frontend and API live at this origin's root, not a subdirectory. Do not replace the API route with index.html.

The current .htaccess has NO explicit Authorization forwarding directive. PHP reads HTTP_AUTHORIZATION, falling back to REDIRECT_HTTP_AUTHORIZATION. Ask the provider which method matches this exact PHP handler; forwarding is an unresolved gate, not established by a browser login.

For supported CGI/FastCGI handling the provider may use `CGIPassAuth On` in the staging-only vhost/directory. A reviewed mod_rewrite alternative is:

```apache
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
```

Place it after RewriteEngine On and before the API rewrite if the provider confirms it is necessary and supported. Do not add both blindly; do not put tokens into rewrite rules or logs. Any host-specific .htaccess change requires review and a new derivative checksum. Reference: [Apache CGIPassAuth](https://httpd.apache.org/docs/2.4/mod/core.html#cgipassauth).

To verify propagation after deployment approval while ingestion stays disabled, use provider tooling or an approved temporary boolean-only probe restricted to operator access: send a dummy nonsecret Authorization header and return only whether HTTP_AUTHORIZATION or REDIRECT_HTTP_AUTHORIZATION is present. Do not echo server environment/header values; remove the probe immediately. No probe has been created. A disabled-device response alone does NOT prove forwarding because ingestion checks its enable flag first. Real bearer authentication requires later separately approved staging device provisioning; do not enable ingestion/provision tokens for this smoke pass.

## 10. Smoke tests and rollback

After an approved staging-only publish, run these non-inventory tests and retain status/header evidence without secrets:

| Check | Expected |
| --- | --- |
| HTTPS / | 200 app HTML, trusted certificate, staging origin |
| HTTP / | Redirect only to staging HTTPS |
| Every manifest asset | 200, correct content type, no missing chunks |
| GET /api/v1/auth/session, anonymous | 200 JSON, authenticated=false, accessMode=AUTHENTICATED; protect csrfToken/cookie |
| GET /api/v1/stock, /scale-reading, /qr-batches, anonymous | 401 JSON |
| GET /api/v1/not-a-route | 404 JSON, never SPA HTML |
| GET /api/v1/auth/login | 405 JSON with Allow: POST |
| Missing CSRF on a harmless login attempt | 403 csrf_failed, no account/inventory change |
| Staging admin login | Success; secure host-only cookie; stock/QR GETs work |
| Read-only inventory/QR UI | Exactly the verified staging DB contents, no imported personal records |
| Wi-Fi UI | Disabled/unavailable, no generated device credential |
| Private paths, SQL/config/manifest URLs | Never disclose private content; SPA fallback alone is not proof of isolation?verify filesystem mapping |
| Mobile camera permission/cancel | HTTPS camera prompt on explicit Start; cancel stops stream; do not scan/assign personal labels |

Do not POST stock, create spools/brands/QR batches, assign/replace QR labels, save estimates or consume any existing labels during this smoke pass. Empty staging data is acceptable. Full QR/weight acceptance needs a separately approved disposable staging fixture plan; no automatic import/generation. No hardware actions.

Before publish record previous staging public/private tree locations, config references, hashes, DB backup and restore evidence, and the provider-supported paired release switch. If smoke tests fail, stop staging writes and restore the previous compatible staging code pair only after rollback authorization. Preserve sessions/private state and logs. For first deployment with no previous release, return staging to its prior placeholder/maintenance state; NEVER redirect/fall back to production. Do not drop additive schema or restore an old dump over new history. Database restoration is a separate approved recovery with post-backup write reconciliation. Do not rotate credentials or restart hosting services in this task.

## Remaining blockers / approval boundary

1. Confirm actual account/home, staging root, production root comparison, private paths, ownership/open_basedir, release-switch/maintenance and backup paths.
2. Confirm intended DNS IP and reachable trusted HTTPS certificate; port 443 verification failed from this environment.
3. Confirm web/CLI PHP binary/version/extensions and database engine/trigger/generated-column support.
4. Confirm staging-only user association/grants, DB host/port and read-only contents/ledger inspection.
5. Confirm provider private environment injection to web AND CLI without public secrets or service restarts.
6. Approve/provision a separate empty restore-rehearsal DB/connection and verify backup restore before any migration.
7. Confirm Authorization propagation for the PHP handler; exact host-specific directives/probe require review.
8. Confirm first-admin status and approved hidden-input CLI method (Python3/TTY availability if using the example).

Only local documentation and checksum validation were performed. No cPanel access was assumed. No production/personal database, inventory, QR registry, password, hosting configuration or hardware was modified. STOP before upload/deployment/migration; await explicit approval after the above nonsecret details are confirmed.
