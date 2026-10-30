# Recovery and rollback

## Saved before conversion

- `backups/phase1-original-private/`: full pre-conversion local copy including
  installed dependencies, generated state, private configuration and firmware.
  Never publish, upload, email, or commit this directory.
- Its `inventory-consistent.sqlite` is a SQLite backup made through a read-only
  connection to D1's local database. `inventory-export.json` preserves raw studio
  rows and latest scale readings. The local studio table had zero rows.
- `protected-files-sha256.json` records firmware and D1 file hashes for integrity.
- `backups/phase1-source-distributable.zip`: sanitized original tracked source,
  excluding local databases, secrets, private firmware/builds and dependencies.
  It does not include inventory; inventory stays in the private backup.
- Git tag `phase1-source-baseline`: sanitized source before frontend conversion.

These are local recovery points on the same disk, not off-device disaster recovery.
No remote/live inventory was downloaded or changed.

## Safest complete rollback

1. Stop any local development/preview servers you started for this project.
2. Create a new empty folder outside the current project; do not overwrite V2.
3. Copy the CONTENTS of `backups/phase1-original-private/` into that folder,
   including hidden files. Do not copy its recovery-only export/manifest files
   into a public web directory.
4. Open that folder separately. Its original source/configuration and dependencies
   are restored; follow its `START-HERE.md` only when you intend to run V1.
5. Preserve its `.wrangler/state` and do not run database reset/restore commands.
   Keep `inventory-consistent.sqlite` as an independent recovery copy.

To recover source only, extract `phase1-source-distributable.zip` into an empty
folder or use `git archive phase1-source-baseline` from this repository. Source
rollback alone does not restore credentials, dependencies or inventory data.

Avoid `git reset --hard`, `git clean`, mirrored copy deletion, or running archived
migrations as a rollback method. Reconstruct in a separate folder first.

The sandbox used a per-command Git `safe.directory` override for this exact
workspace because the sandbox account differs from the folder owner. No global
Git trust configuration was changed. The normal owner should use Git normally.
