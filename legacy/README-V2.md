# Archived V1 implementation

These files preserve the Vinext/Next-style API handlers, D1 schema/migrations,
Cloudflare Worker, connector/auth infrastructure, hosting configuration, build
helpers, package manifests/lockfiles, and original documentation. They are not
part of the V2 TypeScript compilation or frontend dependency graph.

Do not run archived scripts in this relocated folder: their relative paths refer
to the original project layout. Use the baseline Git tag or the full private
backup to recover that layout. Do not apply archived migrations during V2 work.

`lib/stock.ts` in the active root is the original inventory rule implementation,
retained byte-for-byte and covered by `npm run test:stock`. No PHP/MySQL migration
or new hardware protocol has been implemented yet.

The old package lockfiles remain in the private full backup and baseline Git tag;
their local archived copies are ignored to avoid maintaining multiple active locks.
