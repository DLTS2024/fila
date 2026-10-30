# Phase 3 changed files

Relative to phase2-static-frontend (e4ceb01). A = added; M = modified.

```text
M	.gitignore
M	README.md
M	START-HERE.md
A	backend/README.md
A	backend/bin/common.php
A	backend/bin/create-admin.php
A	backend/bin/create-admin.ps1
A	backend/bin/migrate.php
A	backend/config.example.php
A	backend/migrations/0000_schema_migrations.sql
A	backend/migrations/0001_inventory_foundation.sql
A	backend/migrations/0002_auth_and_installation.sql
A	backend/public/.htaccess
A	backend/public/api/v1/index.php
A	backend/router.php
A	backend/src/Api.php
A	backend/src/Auth.php
A	backend/src/Config.php
A	backend/src/Database.php
A	backend/src/Http.php
A	backend/src/Validation.php
A	backend/src/bootstrap.php
A	backend/tests/auth-database.mjs
A	backend/tests/database.php
A	backend/tests/http.mjs
A	backend/tests/unit.php
M	docs/API-CONTRACT.md
A	docs/CPANEL-PHP-DEPLOYMENT.md
A	docs/PHASE-3-REPORT.md
A	docs/PHP-API.md
A	docs/PHP-LOCAL-SETUP.md
M	package.json
A	scripts/check-php.mjs
M	vite.config.ts
A	docs/PHASE-3-CHANGED-FILES.md
```

Local-only ignored artifacts: .tools/php (official portable PHP runtime),
backend/tests/test.local.php (nonproduction test configuration), backend/var/
(local session files), backups/phase3-baseline/protected-files-sha256.json,
and regenerated dist/. No production credentials or databases were created.

All app screens, app/globals.css, lib/stock.ts, legacy sources, D1 files,
and firmware remain unchanged. Existing package-lock.json does not require
a dependency change; new npm commands only invoke local tests.
