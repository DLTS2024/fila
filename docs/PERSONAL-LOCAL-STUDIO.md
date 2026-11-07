# Personal local studio setup

The user approved creating a separate local `dloop_personal` database and its first administrator. Provisioning is complete; **the personal administrator must still be entered privately by the user**. No admin email/password has been supplied through chat or hardcoded.

## Target and preservation

- Personal database: `dloop_personal` on XAMPP MariaDB, loopback port 3306.
- Private configuration: `backend/var/personal/config.local.php`; private sessions in its `sessions` subdirectory.
- The private directory's Windows ACL is restricted to the current Windows account and SYSTEM. Database password/app key were generated randomly and are not printed or passed on command lines.
- The existing eight DLoop test databases remain separate. Every table's row count was compared before/after provisioning and was unchanged. No test administrator or inventory was updated, copied or deleted.
- All four existing migration files were applied only to the newly created personal database; migration status verifies their checksums. Initial verification: zero users, spools and measurements; first-admin initialization remains open.
- Dedicated database login is restricted to `dloop_personal`, with no schema/global administration privileges. The same login has local connection entries for localhost and 127.0.0.1. Temporary INSERT users / UPDATE installation_state permissions exist only for first-admin bootstrap and are removed by the private setup wrapper after success.

## Create your first administrator privately

From the project root in your own PowerShell terminal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\bin\create-personal-admin.ps1
```

Type the displayed database name to confirm. Then enter your new email locally and a new password at the hidden prompt (12–72 UTF-8 bytes). The existing `create-admin.php` receives JSON through stdin and creates the first admin under its transactional installation lock; it refuses to create another account once initialized. It stores bcrypt at cost 12. Do not paste credentials into chat, process arguments, config files or a saved script. The personal password is distinct from the generated application database login.

The wrapper automatically removes bootstrap database privileges afterward. If account creation succeeds but finalization reports an error, do not rerun first-admin creation or delete anything; report only the safe error text for inspection. No administrator has been created automatically during provisioning.

## Local frontend

The running frontend at `http://localhost:5173` (also `http://127.0.0.1:5173`) now proxies API calls to the **personal** PHP server at `127.0.0.1:8001`. An anonymous session request returns HTTP 200. Existing test DB service/configuration is not repointed or migrated. Refresh the login page after private administrator creation and use your new credentials.

For future restarts, terminal 1:

```powershell
$env:DLOOP_CONFIG_FILE = (Resolve-Path backend/var/personal/config.local.php).Path
& C:\xampp\php\php.exe -S 127.0.0.1:8001 -t backend/public backend/router.php
```

Terminal 2:

```powershell
$env:DLOOP_API_PROXY = 'http://127.0.0.1:8001'
npm.cmd run dev -- --port 5173 --strictPort
```

Do not use the README's retained phase4/phase5a test launch command for your personal inventory. The personal studio starts empty; importing old inventory would be a separate explicitly approved operation.

## Implementation and checks

`backend/bin/setup-personal-local.php` refuses an existing target schema, existing dedicated database login or existing personal configuration. It uses the installed private XAMPP operator configuration internally, never printing it. DDL failures retain partial state for inspection instead of dropping databases or retrying blindly. Its `--provision` action was run only after explicit user approval. `--finalize` is called after user-run first-admin creation and only revokes the personal bootstrap grants.

`backend/bin/create-personal-admin.ps1` selects only the personal configuration, delegates private prompts to the existing first-admin helper, then finalizes privileges. Both scripts pass syntax checks. All migrations pass status checks and the frontend/API responds successfully. The user-supplied private administrator creation and sign-in still need to be completed; no fabricated successful login is claimed.
