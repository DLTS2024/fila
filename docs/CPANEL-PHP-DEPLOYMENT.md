# cPanel PHP deployment preparation — not deployed

Use PHP 8.2+ with PDO MySQL and sessions, Apache 2.4 rewrite support, HTTPS for
filament.dlts.in, and MySQL 8.0.16+ / MariaDB 10.6+. Verify with the host before
cutover. Do not publish phpinfo or a database/setup web page.

Example layout (replace ACCOUNT and actual subdomain document root):

```text
/home/ACCOUNT/dloop-backend/
  src/ bin/ migrations/
  config.local.php
  var/sessions/
/home/ACCOUNT/filament-public/     # filament.dlts.in document root
  index.html assets/ favicon.svg scale/   # built dist contents
  .htaccess                              # backend/public/.htaccess
  api/v1/index.php                        # backend/public/api/v1/index.php
```

Keep config.local.php and session storage outside ALL public roots. Prefer 0600
for config and 0700 for private directories when PHP runs as your cPanel user;
use host-required minimal permissions otherwise. Never make them world-writable.
Do not upload backups, .tools, .git, .wrangler, work, node_modules or legacy code.

1. Build locally with npm run build. Upload only dist contents and the two files
   under backend/public. PHP code/configuration remain in the private sibling tree.
2. Configure the absolute private backend path for the entry point. Where your
   PHP handler supports it, use `SetEnv DLOOP_APP_DIR /home/ACCOUNT/dloop-backend`
   in .htaccess. If PHP-FPM does not propagate SetEnv, edit only the public entry's
   `$appRoot` assignment to that literal absolute path. Paths are not passwords.
   Do not put secrets in SetEnv, .htaccess or public bootstrap files.
3. Create private config from config.example.php. Use environment=production,
   allowed_origins=['https://filament.dlts.in'], a fresh random app_key, private
   session_dir and production DB credentials. Set database host=localhost (or
   loopback). Remote production DBs are intentionally rejected until verified TLS
   transport is added. Never copy development secrets to production.
4. Manually provision a NEW MySQL database/user in cPanel. Use the complete
   cPanel-prefixed database/user names in private config. Do not create a production
   DB merely to test this phase. Back up before any future schema application.
5. With cPanel Terminal/SSH and the correct PHP CLI binary, run migrate.php --status,
   then --apply only for the approved new target. Create first admin over CLI
   through secure stdin. If no CLI exists, ask hosting support to run the private
   scripts; do not temporarily expose them as a web installer.
6. Use a separate migration/setup DB user where possible. After setup, the runtime
   user needs SELECT on users/inventory/profile tables, UPDATE(password_hash,
   updated_at) on users for rehash, and SELECT/INSERT/UPDATE on login_throttles.
   It does not need CREATE/DROP/ALTER/GRANT, INSERT users, or UPDATE installation_state.
   Future write endpoints will need separately reviewed grants. Switch private
   config to the restricted runtime account after setup.
7. Ensure PHP display_errors=Off, log_errors=On and logs outside public roots.
   Verify HTTPS reaches PHP as HTTPS=on or SERVER_PORT=443. The API does not trust
   arbitrary X-Forwarded-Proto/For headers. Configure trusted proxies at the host
   layer if necessary. Redirect HTTP to HTTPS at cPanel/Apache before PHP; test the
   resulting secure cookie. Keep the shipped API rewrites before the SPA fallback.
8. Test anonymous session, login/CSRF/logout, protected reads, JSON 404/405, cookie
   flags and private-path denial on staging. There is no auth UI yet. Never use
   PHP's built-in server or Vite preview for production.

The supplied .htaccess routes API requests to PHP and unknown frontend paths to
index.html. It uses [END] (Apache 2.4). Merge carefully with cPanel-generated PHP
handler/HTTPS directives; preserve those directives. API errors must never fall
through to HTML. Validate with the actual hosting stack before cutover.

No Node runtime, continuously running backend process, Cloudflare Worker or D1
binding is used. SQL migrations and maintenance run as explicit CLI tasks.
