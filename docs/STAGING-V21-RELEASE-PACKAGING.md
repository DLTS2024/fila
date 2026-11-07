# Staging v2.1 release packaging

Local packaging only. No deployment, migrations, databases, credentials, hosting or firmware are touched.

Run from the project root:

```text
npm run test:staging:package
npm run typecheck
npm run build
node scripts/prepare-staging-public.mjs
node scripts/check-staging-public.mjs outputs/STAGING_DIRECTORY_PRINTED_ABOVE
```

The staging-only CLI accepts no target overrides. Its manifest fixes staging-fila.dlts.in, the staging public/private destinations, and deployed/credentialsIncluded/configurationIncluded/migrationsExecuted=false. The validator verifies complete inventory, exact source/build bytes, hashes, staging identity, symlink exclusion and migration pins. Runtime source files are copied only from the explicit dependency allowlist; frontend files come from the current build with both HTML and lazy chunk references checked. Build immediately before packaging. This is a release artifact, not proof of live hosting readiness.

scripts/staging-migrations.reviewed.json pins the exact raw-byte SHA-256 of migrations 0000 through 0008, including their exact names. Earlier migrations were compared byte-for-byte with the prior reviewed staging artifact before pinning. A missing, extra or changed migration fails before output creation. Do not regenerate this lock to bypass a failed check; any migration change requires review, including line-ending changes. Production packaging scripts/configuration remain unchanged.

Contents:

- public/index.html, public/favicon.svg and all allowlisted public/assets build files. dist/scale is excluded.
- public/api/v1/index.php and public/.htaccess derived from reviewed backend/public sources, retaining staging-only hostname guards, HTTPS redirect, private backend/config pinning, API-before-SPA rewrites, private-file denial and bearer forwarding.
- private/src: complete 12-file runtime dependency set, including current Inventory.php and Config.php.
- private/migrations: exactly the nine reviewed SQL files.
- private/bin: common.php, migrate.php, production-preflight.php, staging-readonly-preflight.php, validate-staging-config.php and diagnose-staging-config.php. Packaging copies these tools; it never executes them. production-preflight.php is an existing helper whose database comes from configuration; use the staging identity-checking wrapper for preflight, never assume a filename establishes database identity.
- manifest.json: every payload path and SHA-256, migration hashes, staging destinations and review-only flags.

No config.local.php, config templates, environment files, secrets, credential provisioning/reset tools, sessions, test fixtures, source frontend files, archives or firmware are included. Preserve the deployed staging private configuration/secrets and independently verify their compatibility with the included Config.php and optional explicit Wi-Fi profile before an authorized deployment. Existing two-file configuration overlays are separate from this artifact.

Future deployment remains separately authorized. Follow MOBILE-MANAGEMENT-STAGING.md for backups, migration rehearsal, maintenance/write isolation, staged assets, backend activation, index-last activation, grants, read-only reconciliation and data-preserving rollback. Review routing files against the current hosting handler rather than blindly overwriting provider directives. Deploy only to the confirmed staging destinations; nothing here authorizes production access or readiness claims.
