# Phase 3 — PHP/MySQL backend foundation

## Delivered

- Lightweight PHP 8.2+ REST entry point under /api/v1; private application code
  and configuration separated from the public root. PDO MySQL uses native
  prepared statements, strict SQL mode, nonpersistent connections and UTC.
- Versioned InnoDB migrations for all requested tables plus login_throttles and
  installation_state. DECIMAL(10,2) masses, unique spool codes/tags/assignments,
  FK/CHECK constraints, indexed lookups, UTC timestamps and a checksum ledger.
- Session admin authentication, bcrypt cost 12, strict password byte limits,
  session fixation prevention, rotation, expiry, active-user authorization,
  exact-origin/CSRF checks for login and logout, atomic DB-backed throttling.
- GET auth/session, POST auth/login, POST auth/logout, GET dashboard, brands,
  tare-profiles and spools. Consistent JSON errors and bounded/validated filters.
- CLI-only first administrator setup with secure stdin helper and permanent
  initialization marker. No public setup route exists. Reinitialization is
  blocked by a locked marker and existing-user check inside a transaction.
- Local router, Vite proxy guidance, Apache rewrite template, cPanel paths,
  private permissions/grants guidance and opt-in disposable-DB test suites.

Migration files:

1. backend/migrations/0000_schema_migrations.sql — migration ledger/bootstrap.
2. backend/migrations/0001_inventory_foundation.sql — users, brands, tare profiles,
   products, spools, code sequences, measurements, activity, printers/slots,
   NFC associations and future mutation idempotency storage.
3. backend/migrations/0002_auth_and_installation.sql — login throttles and
   one-time installation state.

Migration execution is explicit CLI --apply, serialized by advisory lock, with
checksum and unknown-version rejection. A nonempty DB without the migration
ledger is refused. No DROP, automatic reset, or destructive down migration exists.
MySQL DDL implicitly commits: partially applied migrations require inspection.

## Executed verification

No PHP/MySQL/MariaDB executables were on PATH, and no MySQL/MariaDB service or
Docker executable was discovered. To execute PHP checks, a portable PHP 8.4.27
Windows runtime was downloaded from the official PHP Windows release service,
verified against its published SHA-256 and extracted under ignored .tools/.
The system installation/PATH was not changed. PDO MySQL was enabled for the
local test process. No database server was installed or started.

| Check | Actual result |
| --- | --- |
| npm run test:php | PASS: PHP syntax for backend PHP files; 21 validation/password checks |
| npm run test:php:http | PASS against a real local PHP HTTP server: anonymous session, HttpOnly/SameSite flags, fixation rejection, four unauthorized read endpoints, CSRF, hostile Origin, strict fields/types/JSON, size/content-type limits, closed setup, method errors |
| Missing DB HTTP response | PASS: valid-shaped login fails with generic JSON 503 and a request ID; no SQL/credentials exposed |
| Vite /api/v1 proxy | PASS: real session cookie/JSON passes through and hostile-origin login returns 403 |
| Private development paths | PASS: backend source, private PHP configuration and portable tool requests return 403 |
| npm run typecheck | PASS |
| npm run test:stock | PASS |
| npm run test:api | PASS |
| npm run test:ui | PASS: all seven existing views in jsdom |
| npm run build | PASS: TypeScript, static client build and 8-file static validation |
| Protected D1/firmware hashes | PASS: all 15 files match the Phase 3 baseline |
| Original CSS/inventory rules | PASS: byte-for-byte unchanged from original private backup |
| mysql/mariadb schema application and SQL validation | NOT RUN: no database server available |
| Migration --status | Database connection failed safely; no schema/records changed |
| Successful admin initialization/login/logout and session rotation | NOT RUN against a DB; opt-in test suites supplied |
| Authenticated dashboard/profile/spool SQL, constraints and throttle concurrency | NOT RUN against a DB; requires disposable MySQL/MariaDB |
| Apache/cPanel rewrite, permissions, production HTTPS/Secure cookie | NOT RUN on hosting |

Syntax validation is not SQL validation. The PHP/HTTP tests do not establish
MySQL or MariaDB compatibility; apply the migrations and run the supplied DB
tests on the actual target engine before deployment. No successful DB test is
claimed. Unit password checks do not replace a successful authenticated DB flow.

## Scope and security limitations

- This is an admin-only, single-studio foundation. No MFA, password reset,
  additional-admin UI or recovery workflow exists. Protect the hosting account
  and CLI access; do not create a temporary web installer to work around this.
- The existing UI/screens/business rules are intact. They still use the pending
  /stock facade, so they remain disconnected; no auth UI/read-model adapter or
  inventory mutation endpoints were added. Normalized read endpoints are API-only.
- Idempotency and sequence tables reserve future write safety; no writer or
  code allocator is implemented yet. Measurement confirmation and history writes
  must be implemented transactionally in the next phase.
- DB foreign keys and CHECK constraints require the documented minimum versions.
  Only the application PDO connection sets UTC/strict mode; external/manual SQL
  clients must use equivalent settings. Configuration and deployment instructions
  deliberately reject remote production DB hosts until verified TLS is supported.
- Throttling needs a working database; DB failure fails closed. Account quotas
  can temporarily deny a legitimate login under attack; proxies may share an IP
  quota. No distributed proxy trust is inferred from client headers. Add host-level
  request limiting and a reviewed retention/pruning policy for old throttle rows.
- Production requires private session storage, correct PHP handler permissions,
  HTTPS detection and correct Apache/API rewrites. These hosting controls remain
  unverified. The application does not enable CORS or trust forwarded TLS headers.
- Secrets remain outside public roots and Git. The local test config uses a random
  nonproduction key and fictitious DB fields; it is ignored, as are session files
  and the portable runtime. None is copied to dist.
- Error responses are deliberately generic; private logs include request ID and
  exception class only. Host-level PHP logs must also remain private.

PHP implementation references: [session security settings](https://www.php.net/manual/en/session.security.ini.php),
[PDO prepared statements](https://www.php.net/pdo.prepare),
and [MariaDB constraints](https://mariadb.com/docs/server/reference/sql-statements/data-definition/constraint).

## Rollback and recovery

No existing D1 inventory, firmware, or production database was changed. The
Phase 2 recovery tag remains phase2-static-frontend (commit e4ceb01).
The private Phase 1 backup and sanitized source ZIP remain intact. A separate
Phase 3 protected-file hash manifest is in ignored backups/phase3-baseline/.

For source rollback, export phase2-static-frontend into a NEW empty folder and
open it separately. Preserve the current folder/configuration until validated;
do not run git reset --hard, git clean, database drops or mirrored deletions.
The Phase 2 tag recovers its source only; private configuration and local inventory
are preserved separately. See ROLLBACK.md for full original-project recovery.

If future staging migration application fails, stop and inspect the NEW target
DB. DDL is not transactionally reversible. Do not run these migrations on D1,
reset an existing schema, or import old JSON until the import phase is authorized.
Any future DB restore must use a separately approved backup/restore procedure.

See PHASE-3-CHANGED-FILES.md for the complete changed-path list. Next: execute
disposable DB tests on both intended engine versions, validate cPanel staging,
then implement the frontend auth/read bridge and confirmed inventory mutations.
