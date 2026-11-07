# Staging provisioning plan — approval pending

Target approved in principle: **https://staging-fila.dlts.in/**. This approves the hostname only, not resource creation, credentials, deployment, migrations or flashing. DNS, SSL, account access and database existence remain UNKNOWN. Production `https://fila.dlts.in/`, `dltsin_fila`, the local personal database and its 100 labels are excluded. No external resource was accessed or changed for this plan.

## 1. Operator information and decisions

Provide nonsecret hosting details: control-panel/provider, account name, server address, SSH availability, PHP CLI path, PHP-FPM handler/environment mechanism, document-root mapping, database host/port, allowed database-name length/prefix, certificate issuer/chain, trusted proxy arrangement and release-switch mechanism. Confirm which paths are outside **every** public root. Do not post passwords, tokens, private keys or configuration contents in chat.

Proposed names, subject to provider limits:

- document root `/home/ACCOUNT/staging-fila-public` (never production public_html);
- private release `/home/ACCOUNT/dloop-staging/releases/RELEASE/private`;
- stable private state `/home/ACCOUNT/dloop-staging/state` for sessions/backups/provisioning files;
- staging database `dltsin_filastg`, runtime login `dltsin_fstgrun`, separate migration login if supported;
- separate disposable restore-rehearsal database, provisioned only after approval.

Required secrets entered privately: staging DB passwords, independent staging app key, staging administrator login, device token, 2.4 GHz SSID/password, hosting login. Production credentials are unnecessary. Each staging credential must differ from local and production. No existing credentials are rotated by this plan.

## 2. Provision resources after specific approval

1. In the hosting panel create the subdomain with its own document root and verify it is not a production alias. Create only the necessary DNS A/AAAA/CNAME records for the actual hosting destination; omit unsupported IPv6 rather than pointing it elsewhere.
2. Issue a valid trusted certificate covering `staging-fila.dlts.in`, configure complete chain/renewal and HTTPS redirect to this hostname. Do not use a self-signed certificate or browser exception. Disable directory indexes. Configure `Permissions-Policy: camera=(self)` and avoid an iframe. Keep a same-origin frontend/API.
3. Create the dedicated database/logins through the panel. Do not clone production/local inventory. Record exact names and grants privately. Restrict migration privileges to the staging schema, including CREATE/ALTER/INDEX/TRIGGER and migration-lock support. Runtime grants must be reviewed per schema: read access plus required table-specific INSERT/UPDATE permissions, no DDL/GRANT/DROP or broad production access. Device clients receive no DB login.
4. Provision private directories with restrictive ownership/permissions (0700 directories/0600 secret files where compatible with the handler). Ensure PHP can write only required state/session paths. Do not put private files, SQL, firmware binaries or backups under any public root.

## 3. Compatibility and HTTPS checks

Commands below are a plan, NOT executed. Linux commands run in the hosting private terminal, using the provider's PHP binary and staging-only private config. Stop on errors; never continue a failed migration.

```sh
php -v
php -r 'echo PHP_INT_SIZE*8," bits\n"; foreach (["pdo_mysql","json","session","openssl"] as $e) echo $e,": ",extension_loaded($e)?"yes":"NO","\n";'
```

Confirm PHP meets repository requirement >=8.2 with 64-bit integers and password hashing/randomness/session support; select a provider-maintained release. CLI and web handler must match. Database adapter enforces MySQL >=8.0.16 or MariaDB >=10.6. Verify InnoDB, utf8mb4, enforced CHECK constraints, transactions, generated columns/triggers and GET_LOCK. Keep UTC clock synchronized. Do not publish phpinfo. Verify handler version privately through provider tools; CLI alone does not prove web configuration.

After DNS/certificate provisioning, operator workstation checks:

```sh
nslookup staging-fila.dlts.in
curl --fail --head https://staging-fila.dlts.in/
openssl s_client -connect staging-fila.dlts.in:443 -servername staging-fila.dlts.in -verify_hostname staging-fila.dlts.in -verify_return_error </dev/null
```

Use trusted local CA verification; the server-supplied chain alone is not an independently trusted anchor. Verify HTTP redirects to staging, never production. PHP must receive HTTPS=on or port 443; do not trust arbitrary forwarded headers. Verify Authorization reaches PHP without logging its value.

## 4. Prepare/review release locally — no upload yet

After build/artifact approval, PowerShell:

```powershell
npm.cmd run prepare:staging
```

The staging option pins the approved staging origin, selects the staging-only configuration template and records the environment/template plus all file checksums in the manifest. Run `node scripts/check-production-artifact.mjs RELEASE_DIRECTORY` before transfer. All migrations including 0007 must be present. No manual template replacement is needed. Older artifacts remain historical and must not be deployed as current releases.

Only `public/` goes to staging document root. `private/` goes outside public roots. Firmware is never uploaded to hosting. API entry uses private `DLOOP_APP_DIR`; set it to the release's private directory. Select the private staging config via `DLOOP_CONFIG_FILE`. Secrets are not embedded in the artifact or manifest.

Hosting PHP-handler private environment:

```text
DLOOP_APP_DIR=/home/ACCOUNT/dloop-staging/releases/RELEASE/private
DLOOP_CONFIG_FILE=/home/ACCOUNT/dloop-staging/releases/RELEASE/private/config.local.php
DLOOP_STAGING_ORIGIN=https://staging-fila.dlts.in
DLOOP_STAGING_DB_NAME=dltsin_filastg
DLOOP_STAGING_DB_USER=dltsin_fstgrun
DLOOP_STAGING_DB_PASSWORD=<private>
DLOOP_STAGING_APP_KEY=<independent private random key>
DLOOP_STAGING_WIFI_SCALE_ENABLED=0
```

Use actual provisioned names; template defaults DB host to localhost:3306—adapt privately if provider differs. AUTHENTICATED is mandatory; LOCAL_SINGLE_USER stays disabled. Use separate staging session storage. Existing cookies are host-only; do not set a `.dlts.in` shared cookie domain. Verify production and staging logins cannot cross-authenticate. Private CLI environment must select the same staging target explicitly.

## 5. Preflight, backup, restore rehearsal and migrations

After approval for uploading private code and read-only staging inspection:

```sh
cd /home/ACCOUNT/dloop-staging/releases/RELEASE/private
php bin/production-preflight.php
php bin/migrate.php --status
```

Confirm database name/access mode, counts and ledger checksums before any write. Nonempty untracked schema or mismatch is a STOP requiring reconciliation. Never assume empty. Set CLI-only migration credentials privately when authorized; do not change the web runtime login's grants for convenience.

Backup uses a 0600 private MySQL option file outside public roots, containing only the staging connection. Never put passwords on command lines:

```sh
mysqldump --defaults-extra-file=/PRIVATE/staging-backup.cnf --single-transaction --quick --triggers --hex-blob --result-file=/PRIVATE/RELEASE/private/var/backups/pre-stage.sql dltsin_filastg
sha256sum /PRIVATE/RELEASE/private/var/backups/pre-stage.sql
mysql --defaults-extra-file=/PRIVATE/staging-restore.cnf APPROVED_RESTORE_DATABASE < /PRIVATE/RELEASE/private/var/backups/pre-stage.sql
```

Use the matching vendor dump utility on MariaDB. The restore option file/user must target only a separate empty rehearsal DB. Check exit codes, restored row counts/schema/triggers/checksums; do not restore into staging or production. Even an empty staging DB needs a nonempty valid dump and rehearsal to satisfy the production-mode migration backup gate. No concurrent writes during this checkpoint.

Write a protected manifest under this release's private `var/backups/` with actual database, absolute dump path under that directory, actual SHA-256 and `restoreVerified:true` **only after** verified restore. Both manifest and dump must be inside that directory for the current migrator:

```sh
export DLOOP_BACKUP_MANIFEST=/PRIVATE/RELEASE/private/var/backups/verified-stage.json
php bin/migrate.php --apply
php bin/migrate.php --status
php bin/production-preflight.php
```

These are approval-gated staging commands only. Migrator applies pending files 0000–0007 and validates existing checksums; it does not reapply successful files. DDL is not transactionally reversible. Stop on partial failure; never auto-drop/reinitialize. Preserve backup/ledger and pre/post counts. Production and local migrations remain untouched.

## 6. Authentication, publish and isolated test identities

If preflight proves staging has zero users and first-admin setup is open, approve creating one staging administrator. Use the existing private `create-admin.ps1` (email and secure password prompts, stdin to PHP); never pass passwords as arguments or use a public setup page. Preserve existing staging users if present. Do not reset them without ownership verification and approval.

After approval transfer the reviewed public tree into the **staging** release document root (for example `rsync -a --checksum REVIEW/public/ HOST:/home/ACCOUNT/staging-fila-public/`; no `--delete`, no production path). Upload private files separately over approved SFTP/SSH. For later releases use provider-supported atomic release switching; confirm path and rollback before executing. Do not expose partial frontend/API releases.

Verify `/api/v1/auth/session` returns JSON, login uses secure/HttpOnly/SameSite cookies, CSRF/origin checks protect mutations, anonymous stock/scale/QR access is denied, invalid API paths return JSON errors rather than index.html, SPA assets/hash routes work, and secrets/backups/private paths are inaccessible. Verify no public LOCAL_SINGLE_USER bootstrap. Keep device ingestion disabled initially.

After separate approval generate **one staging-only batch of 50** UNUSED labels (minimum supported size), through the existing authenticated QR batch workflow. Do not invent an unsupported tiny batch. Print only staging test sheets and record batch/label identities. Never import, scan for assignment, or consume the existing local 100 labels. Staging spool/brand records and saves are disposable staging writes requiring inclusion in approval.

## 7. Android acceptance sequence

Open `https://staging-fila.dlts.in/` in Android Chrome and authenticate to staging. Confirm the dedicated staging batch first. Add spool → Start QR camera: deny permission and verify manual fallback/no mutations; re-enable permission, start then cancel and confirm camera indicator off. Repeat navigation/background cancellation. Scan one staging UNUSED label, review a disposable spool with known provisional tare and explicitly confirm creation. Record spool ID/code and revision. Rescan the same QR on NFC & Scale: exact same ID/code must open, no count/revision increase. Scan it again in Add spool: already-assigned rejection, no duplicate. Test manual code resolves the same record. Keep credentials/tokens out of screenshots.

## 8. Device provisioning, diagnostic build and separate flash approval

Only after staging device-provisioning approval, using its private config:

```sh
php bin/device-credential.php --register DLOOP-SCALE-01 /APPROVED/SESSION/DIR/staging-device-new.env
```

Registration refuses an existing device; do not rotate it automatically. The new file must be inside configured session_dir, protected and transferred privately; token is never printed. Enable ingestion with the staging environment flag only after provisioning approval. Confirm browser user/session and device token authorize different endpoints.

Prepare ignored `firmware/dloop_wifi_scale/wifi_private.h` privately with SSID/password, staging-only device token, verified CA PEM and:

```cpp
#define DLOOP_SCALE_ENDPOINT "https://staging-fila.dlts.in/api/v1/device/scale-reading"
```

Override the example's production endpoint; never use DB credentials. BearSSL trust/hostname/time checks stay enabled; no setInsecure, redirect or HTTP fallback. Compile the configured NodeMCU Wi-Fi wrapper with the installed core using the Phase 10 command; record image hash and flash settings. Protect the binary because it contains secrets.

Before requesting flash approval, prepare/review a diagnostic-only build: bounded serial `#DEBUG WIFI` records of upload duration/status, retry count, Wi-Fi status/RSSI, free heap, largest free block, heap fragmentation and boot/reset reason. Use ESP8266 heap APIs supported by the installed core. Never log URL query credentials, token/header/body, SSID/password or raw config. Keep metrics at most once per second and avoid per-sample allocation; no changes to calibration/gates or frame protocol. This instrumentation is **planned, not implemented**; present firmware has no heap/upload-duration telemetry. Record browser/API age/round-trip separately. Diagnostic build must pass compile/source/protocol checks before approval.

Real testing after explicit flash approval: join/rejoin, SNTP, verified TLS/auth uploads, load/removal, median/max upload latency and stale fraction, heap minima/fragmentation trend and watchdogs during bounded supervised operation. Power off: 500 ms preview staleness, 10-second server offline threshold plus polling. Reboot: new boot ID and fresh acknowledgement. Reconnect may include eight-attempt backoff and five-minute cooldown. Never widen freshness/stability gates to hide latency. Use a disposable staging spool to verify gross−tare once, UNVERIFIED label, explicit confirmation and exactly one history/revision update. No automatic inventory updates. See Phase 10 for detailed safety cases.

## 9. USB rollback identification — unresolved provenance blocker

Read-only local hashing found these identical 316192-byte candidates:

- `work/live-preview-build/dloop_usb_scale.ino.bin`
- `work/unverified-preview-build/dloop_usb_scale.ino.bin`
- SHA-256 **B747CD3415D70EA08F2203A7DBEFCB9B883FB48717BAAED1EE0681748B9EFFF8**

Historical `work/live-preview-upload-verification.json` records COM3, nodemcuv2, `flashHashVerified:true` and working raw preview frames, but **does not name/hash the binary**. Therefore the exact known-good uploaded image cannot yet be certified from repository evidence. The regression image has different SHA-256 `884098131E61E4102E88D7BFFF42CC51D410BB651E3D4DC4DE5276FFF3C71DCA` and must not be substituted as historically proven.

Before Wi-Fi flash, obtain the original upload command/log linking a candidate digest, or obtain separate approval for read-only esptool flash verification against the candidate on the still-working USB board. The latter opens/resets serial and must wait for approval; it does not write firmware. Confirm installed esptool syntax, application offset and board flash layout before issuing a command. If matched, preserve binary/hash/build metadata in a protected rollback folder. If neither evidence source is available, keep flash blocked rather than claiming an exact known-good image. Re-detect COM port; prior COM3 is not present-day proof.

Actual USB rollback upload is separately approved, uses the verified binary/original settings with Only Sketch/no full-chip erase, preserves EEPROM and sends no calibration commands. Verify v1 preview/load response afterward without inventory writes.

## 10. Hosting rollback and stop gates

Before publish retain checksummed prior public/private trees, config references, backup/restore evidence and a tested release-switch operation. On software failure stop staging test writes and disable ingestion after approval; switch both frontend/backend to the recorded prior compatible staging release. On first deployment with no previous release, take staging offline rather than point it at production. Do not drop additive schema or restore an old dump over new history. Reconcile any post-backup test writes before a separately approved database restore. Credential revocation/rotation requires approval; never alter production tokens.

Approval requested next: confirm actual hosting paths/database names and authorize the bounded staging resource/deployment/migration/administrator/device provisioning plan plus one 50-label staging batch and disposable test writes. Any of these may be approved separately. No action is authorized merely by this document. Firmware diagnostic changes, serial verification/reset and flashing remain separate review/approval steps. Production remains blocked.
