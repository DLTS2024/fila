# PHP backend foundation

Requirements: PHP 8.2+ with PDO MySQL, sessions, JSON, hash and filter; MySQL
8.0.16+ or MariaDB 10.6+. Use a currently maintained PHP/DB release supported by
your host. No Composer packages or resident backend process are required.

Only `public/` belongs in a web document root. Keep `src/`, `bin/`, `migrations/`,
configuration and `var/` private. Do not put PHP code into the frontend `dist`.

- [Windows local setup](../docs/PHP-LOCAL-SETUP.md)
- [cPanel deployment](../docs/CPANEL-PHP-DEPLOYMENT.md)
- [API contract](../docs/PHP-API.md)
- [Verification, limitations and rollback](../docs/PHASE-3-REPORT.md)

The Phase 2 UI is unchanged and still expects the legacy-shaped `/stock` facade,
which is deliberately not implemented here. Phase 3 exposes normalized read
endpoints and auth. Connecting the UI and implementing confirmed write endpoints
are subsequent work; no legacy data import or hardware change is performed.
