# PHP inventory backend

Phase 4 implements authenticated inventory read/write endpoints, exact masses,
immutable code allocation, verified profile snapshots, version/idempotency checks,
usage/undo, assignments, dashboard aggregates and actor history. No Composer or
resident backend process is required.

Only public/ belongs under a web document root. src/, bin/, migrations/,
config.local.php and var/ remain private. Never upload local test credentials.

Read docs/PHASE-4-API.md, docs/PHASE-4-LOCAL.md and docs/PHASE-4-REPORT.md (relative
to the repository root) for contracts, commands, executed tests and rollback.
Production layout is documented in docs/CPANEL-PHP-DEPLOYMENT.md.

Use PHP 8.2+ with PDO MySQL and sessions, MySQL 8.0.16+ or MariaDB 10.6+.
Actual Phase 4 verification used PHP 8.5.12 and MariaDB 10.11.16. Other engines,
cPanel deployment, browser visual QA and physical hardware remain unverified.
