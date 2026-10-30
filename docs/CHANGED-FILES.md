# Changed files ? Phase 1?2

Relative to Git tag `phase1-source-baseline`. `R100` means an unchanged file
was archived at the new path. `A` = added, `M` = modified, `D` = removed from
the active source layout (the old pnpm lock remains in recovery backups).

```text
M	.gitignore
M	CODEX-PROMPT.md
M	README.md
M	START-HERE.md
M	app/connections.tsx
M	app/page.tsx
M	components.json
A	docs/API-CONTRACT.md
A	docs/PHASE-1-2-REPORT.md
A	docs/ROLLBACK.md
A	index.html
R100	.openai/hosting.json	legacy/.openai/hosting.json
A	legacy/CODEX-PROMPT.md
A	legacy/README-V2.md
A	legacy/README.md
A	legacy/START-HERE.md
A	legacy/WIFI-SCALE-LOCAL.md
A	legacy/WIFI-SYNC-START-HERE.md
R100	app/api/scale-reading/route.ts	legacy/app/api/scale-reading/route.ts
R100	app/api/stock/route.ts	legacy/app/api/stock/route.ts
R100	app/chatgpt-auth.ts	legacy/app/chatgpt-auth.ts
R100	app/layout.tsx	legacy/app/layout.tsx
R100	cloudflare-env.d.ts	legacy/cloudflare-env.d.ts
R100	components/connector-error.tsx	legacy/components/connector-error.tsx
R100	db/index.ts	legacy/db/index.ts
R100	db/schema.ts	legacy/db/schema.ts
R100	drizzle.config.ts	legacy/drizzle.config.ts
R100	drizzle/0000_nosy_thunderbolts.sql	legacy/drizzle/0000_nosy_thunderbolts.sql
R100	drizzle/0001_scale_readings.sql	legacy/drizzle/0001_scale_readings.sql
R100	drizzle/meta/0000_snapshot.json	legacy/drizzle/meta/0000_snapshot.json
R100	drizzle/meta/_journal.json	legacy/drizzle/meta/_journal.json
R100	eslint.config.mjs	legacy/eslint.config.mjs
R100	examples/d1/app/api/notes/route.ts	legacy/examples/d1/app/api/notes/route.ts
R100	examples/d1/db/schema.ts	legacy/examples/d1/db/schema.ts
R100	lib/connector-context.ts	legacy/lib/connector-context.ts
R100	lib/connector-contract.mts	legacy/lib/connector-contract.mts
R100	lib/connector-errors.mts	legacy/lib/connector-errors.mts
R100	lib/connector-preview.d.ts	legacy/lib/connector-preview.d.ts
R100	lib/connectors.ts	legacy/lib/connectors.ts
R100	next.config.ts	legacy/next.config.ts
A	legacy/package.json
R100	pnpm-workspace.yaml	legacy/pnpm-workspace.yaml
R100	scripts/build-verified.sh	legacy/scripts/build-verified.sh
R100	scripts/check-scale-local.mjs	legacy/scripts/check-scale-local.mjs
R100	scripts/connector-preview/connector-preview-session.mjs	legacy/scripts/connector-preview/connector-preview-session.mjs
R100	scripts/connector-preview/host-binding.mjs	legacy/scripts/connector-preview/host-binding.mjs
R100	scripts/connector-preview/protocol.mjs	legacy/scripts/connector-preview/protocol.mjs
R100	scripts/connector-preview/worker.mjs	legacy/scripts/connector-preview/worker.mjs
R100	scripts/execution-profile.mjs	legacy/scripts/execution-profile.mjs
R100	scripts/init-local-db.mjs	legacy/scripts/init-local-db.mjs
R100	scripts/install-ci.mjs	legacy/scripts/install-ci.mjs
R100	scripts/install-ci.sh	legacy/scripts/install-ci.sh
R100	scripts/install-pnpm.sh	legacy/scripts/install-pnpm.sh
R100	scripts/npm-install.mjs	legacy/scripts/npm-install.mjs
R100	scripts/pnpm-install.mjs	legacy/scripts/pnpm-install.mjs
R100	scripts/prepare-scale.mjs	legacy/scripts/prepare-scale.mjs
R100	scripts/run-framework.mjs	legacy/scripts/run-framework.mjs
R100	scripts/sites-env.mjs	legacy/scripts/sites-env.mjs
R100	scripts/sites-env.sh	legacy/scripts/sites-env.sh
R100	scripts/tool-environment.mjs	legacy/scripts/tool-environment.mjs
R100	scripts/vite/connector-preview-plugin.mjs	legacy/scripts/vite/connector-preview-plugin.mjs
R100	scripts/vite/sites-vite-plugin.LICENSE	legacy/scripts/vite/sites-vite-plugin.LICENSE
R100	scripts/vite/sites-vite-plugin.ts	legacy/scripts/vite/sites-vite-plugin.ts
A	legacy/tsconfig.json
A	legacy/vite.config.ts
R100	worker/index.ts	legacy/worker/index.ts
R100	wrangler.local.json	legacy/wrangler.local.json
A	lib/api.ts
M	package-lock.json
M	package.json
D	pnpm-lock.yaml
A	scripts/check-api.mjs
A	scripts/check-ui.mjs
A	scripts/verify-static.mjs
A	src/main.tsx
M	tsconfig.json
M	vite.config.ts
A	docs/CHANGED-FILES.md
```

Local-only artifacts intentionally excluded from Git: the private full backup,
consistent SQLite snapshot/JSON export/hash manifest, sanitized source ZIP,
dist/, installed node_modules, and archived copies of the original lockfiles
and generated next-env.d.ts. Existing .wrangler/, firmware and private headers
remain untouched. The active inventory rules and CSS are unchanged.
