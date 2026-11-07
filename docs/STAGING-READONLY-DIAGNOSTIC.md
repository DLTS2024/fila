# Read-only staging diagnostic - delivery and approval checklist

Local implementation/tests only. No hosted changes, cron, DB connection, permission changes, migration, key generation or public deployment performed.

## Deliverable

Package: outputs/staging-diagnostic-2026-11-06T04-18-42-757Z

Exactly two files:

- diagnose-staging-config.php
- manifest.json

Diagnostic SHA-256: 6e1c1287eb3cba72cff67e4bd1641bf087e20c73f02589a03e77b15d75522c1d

Source: backend/bin/diagnose-staging-config.php. Packaging: scripts/prepare-staging-diagnostic.mjs. Tests: scripts/check-staging-diagnostic.mjs. No actual secrets, secrets example, archive, firmware or public entry is packaged. Embedded base64 references are reviewed NONSECRET PHP source for the staging file-backed template, Config.php and LocalAccess.php; they are used only for byte comparisons, never eval. No secret is hashed. The manifest records only the diagnostic code hash, not configuration data.

## Behavior and limits

The diagnostic reports ONLY the first failing fixed category. Exit 0 means success, exit 1 means category failure. Non-CLI requests receive HTTP 404 with an empty body. Errors/exceptions and unexpected buffered output are suppressed. A shutdown handler emits a fixed stage category for unexpected termination after registration; exception messages, stack traces, absolute paths, IDs, sizes, secret values and secret hashes are never emitted. Interpreter failures before the script starts can still yield an empty evidence file; empty is never success.

The script reads file metadata, bounded JSON and code files. It changes only process-local error/output handling and a nonsecret configuration selector. It never opens files for writing, changes permissions/ownership, starts sessions, invokes application bootstrap/admin tools, constructs PDO or makes network requests. The shell in the proposed cron alone creates the private output file.

Only byte-matching reviewed configuration/Config/LocalAccess code is loaded, after read-only access, JSON and session checks. CRLF/LF differences are normalized; other changes fail closed. This avoids executing arbitrary edited PHP configuration while claiming a read-only guarantee. Full bootstrap is unnecessary and deliberately not loaded. The two approved class files contain declarations only; their configuration validation is preserved, including LocalAccess::validate(). Database connection code is never included.

Keep the private files stable while diagnosing. Like other filesystem code checks, comparison followed by require assumes no concurrent trusted-account replacement of the checked files. The diagnostic does not defend against a malicious process with the same filesystem ownership.

## Fixed output codes

| Output | Meaning |
| --- | --- |
| PASS: STAGING_CONFIGURATION | All inspected checks passed; this is not a DB or LiteSpeed connectivity test |
| FAIL: RUNTIME | Unsupported PHP/word size or required built-in function unavailable |
| FAIL: INVOCATION | Script arguments or CLI argument state unexpected |
| FAIL: CONFIGURATION_PATH | Config/secrets missing, unreadable, non-file, outside the private tree, or inside a checked public root; path inspection may also be restricted |
| FAIL: PRIVATE_OWNERSHIP | Owner metadata unavailable or ownership differs from configuration owner |
| FAIL: PRIVATE_PERMISSIONS | Metadata unavailable or group/world bits set on checked private paths |
| FAIL: JSON_READ | Bounded read failed or JSON exceeds the accepted bound |
| FAIL: JSON_SYNTAX | Invalid JSON, UTF-8, BOM or decoding depth |
| FAIL: JSON_SCHEMA | Required two-string schema, password/key requirements or NUL checks fail |
| FAIL: SESSION_DIRECTORY | Private sessions directory absent, non-directory, unwritable or inside checked public root |
| FAIL: CONFIGURATION_VERSION | Config or loader code missing, unreadable or differs from reviewed nonsecret versions |
| FAIL: CONFIGURATION_LOAD | Reviewed loader/template raised an exception or rejected configuration; process selector may also have failed |
| FAIL: STAGING_IDENTITY | Returned configuration differs from required staging/security settings |
| FAIL: UNEXPECTED_OUTPUT | Unexpected output was captured and discarded |

Categories group failures and do not reveal which object/owner/value failed. No permissions are repaired or checks bypassed. Matching ownership is checked; actual account UID is never printed or hard-coded. Operator/provider still confirms owner dltsin. Only known public_html, supplied DOCUMENT_ROOT and application/public boundaries can be checked by this tool; provider vhost/alias mappings remain a separate hosting verification.

## Local verification

24 subprocess cases passed. Every failure category plus success was exercised, including secret-bearing exception/unexpected-output redaction. Multiple malformed JSON/schema cases, oversized JSON and altered code were covered. Each diagnostic invocation was surrounded by fixture snapshots showing identical file contents and directory membership afterward. No diagnostic-created files were found.

CGI PHP executed the actual shipped diagnostic and returned HTTP 404 with no body. Source guards reject filesystem mutations, external calls, PDO construction and application/admin bootstrap invocation. Package membership, SHA-256 and byte equality with source passed. Existing configuration/validator/loaders were not modified.

Tests used synthetic fixtures under ignored work/. Test harness creation writes those fixtures; the diagnostic itself does not write. Linux ownership/mode/error branches were modeled by test-only namespaced filesystem shims because the available local interpreter is PHP 8.4.27 on Windows and Linux/WSL is not installed. No test switches/shims are present in the shipped file. Syntax is compatible with PHP 8.3; actual hosted PHP 8.3.36/Linux metadata behavior remains for the approved hosted execution.

## Exact next steps - require explicit approval

1. Confirm cPanel still has no diagnostic cron. Preserve the existing validator output and configuration backup privately.
2. In File Manager upload ONLY diagnose-staging-config.php to:
   /home4/dltsin/fila-staging-private/bin/diagnose-staging-config.php
   If a file already exists there, stop and preserve/compare it before replacing. Do not overwrite config.local.php, staging-secrets.json, Config.php, LocalAccess.php or validate-staging-config.php.
3. Keep manifest local or in private evidence only. Do not upload any file to public_html. Verify transferred diagnostic hash by downloading its code and comparing locally. This hash is for code, never secrets.
4. Preserve existing owner/modes. Confirm private-root access restrictions and that the uploaded file is readable by the account. No permission/ownership repair is authorized by this diagnostic task; stop for review if access fails. Keep the original secrets, app key, backups, sessions and staging data unchanged.
5. Confirm this NEW output file is absent:
   /home4/dltsin/fila-staging-private/var/deployment-evidence/staging-config-diagnostic.txt
   Do not delete prior evidence merely to reuse a name. If it exists, stop and choose a separately reviewed new evidence filename.
6. Only after explicit execution approval, create the cron below. Delete that specific cron immediately when the output file appears, BEFORE deleting output. Read only its fixed category. Do not enable broad PHP error output or dump configuration to debug.
7. Keep approved nonsecret evidence, or remove its output after review. No public diagnostic is needed. A FAIL or empty output is a stop, not permission to rerun migrations or alter credentials.

## One-attempt private cron

Minute *, Hour *, Day *, Month *, Weekday *.

```sh
( umask 077; set -C; /opt/cpanel/ea-php83/root/usr/bin/php -n -d display_errors=0 -d display_startup_errors=0 -d log_errors=0 /home4/dltsin/fila-staging-private/bin/diagnose-staging-config.php > /home4/dltsin/fila-staging-private/var/deployment-evidence/staging-config-diagnostic.txt ) >/dev/null 2>&1
```

The schedule repeats until removed; noclobber permits only the first output-file creation/execution attempt. It is NOT a self-removing cron. -n avoids INI/prepend scripts and deliberately does not test the configured extension set. No secret values or environment dump appear in arguments. The output file is created with owner-only permissions by umask; existing file/directory permissions are not changed.

## Rollback and approval

Remove this cron first and confirm no duplicate remains. Remove only the newly uploaded diagnostic after retaining evidence; if a pre-existing diagnostic was replaced under approval, restore its saved version. Keep the existing validator, configuration, secrets, keys, application source and private data unchanged. No DB, credential, application or public-deployment rollback is necessary because none was changed.

Explicit approval requested: this one new private PHP upload and one diagnostic-only cron with immediate cleanup. No migration/status/preflight, DB connection, permission changes, secrets edits, key rotation, inventory/QR action, public upload or hardware operation is included. STOP pending approval.
