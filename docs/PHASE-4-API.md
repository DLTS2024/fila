# Phase 4 inventory API

All routes are under `/api/v1`, same-origin, authenticated admin sessions. Every
mutation requires a valid `Origin`, `X-CSRF-Token`, JSON body, current inventory
`revision`, and an `Idempotency-Key` (8–100 ASCII letters/digits/underscore/hyphen).
Login/logout retain their Phase 3 CSRF/session contract and do not require a key.
No actor/user ID is accepted from a client: activity actors come from the session.

## Existing UI adapter

GET `/stock` returns `{revision,state:{spools,history,slots,catalogue,brands,profiles}}`.
Spools include UUID, immutable code, version, brand/profile IDs, colour name/hex,
physical spool type, nominal capacity, initial/current mass, tare default snapshot,
nullable tare override, effective tare, latest gross, measured flag, registration
kind, location, status and optional product/NFC references.

POST `/stock` accepts `{revision,action}`. Supported actions:

| type | Main fields |
| --- | --- |
| brand | `brand:{id?,version?,name,active}` |
| profile | `profile:{id?,version?,brandId,spoolType,capacity,tare,verified,active,notes}` |
| add | `spool`, `confirmed:true` |
| update | `id`, `version`, full `spool`, `confirmed:true` |
| weigh | `id`, `version` or versions map, `gross`, explicit `tare`, `confirmed:true` |
| print | `name`, `printer`, `note`, `lines:[{id,grams}]`, `versions`, `confirmed:true` |
| assign | `slot`, `id` (blank unloads), `versions`, `confirmed:true` |
| undo | event `id`, `versions`, `confirmed:true` |
| catalogue | `filament:{name,brandId,material,colorName,color,diameter,temperature,bed,price,profileId}` |
| link | spool `id`, `uid` (blank unlinks), `versions`, `confirmed:true` |

`versions` maps affected spool UUIDs to their current integer versions. For a
single-spool update, `version` is sufficient. Assignment requires the versions
of the old target occupant and the newly selected spool. Print lines are grouped
by spool before validating/consuming stock, including repeated usage lines.

Full spool input:

```json
{
  "name":"Black PLA roll", "brandId":"2", "material":"PLA",
  "colorName":"BLACK", "color":"#222222", "spoolType":"Plastic 1 kg",
  "capacity":"1000", "initial":"998.50", "remaining":"998.50",
  "mode":"manual", "registrationKind":"sealed", "profileId":"2",
  "tareOverride":null, "location":"Shelf", "catalogueId":null,
  "status":"active", "refreshProfile":false
}
```

For gross entry use `mode:"gross"` and `gross` instead of `remaining`. The server
computes net using exact integer hundredths and stores DECIMAL(10,2). Gross below
tare, negative/invalid numbers, more than two decimals and values over 100,000 g
are rejected. Starting mass must cover remaining mass at registration. Nominal
capacity is a label, not proof of actual mass or a hard fill ceiling: independently
known 998.50 g or 1005 g can both accompany a nominal 1 kg label. No sealed-spool
mass is inferred. Absolute reweigh corrections follow the existing rules and may
exceed a previously estimated initial balance; they never deduct print usage twice.

New registrations need an active brand and either a verified matching profile
or an explicitly entered physical tare override. A profile must match brand,
spool type and label capacity. Unverified profiles do not supply a new default.
An existing spool keeps its own `tare_default_g` snapshot after profile edits.
To adopt a changed verified default explicitly, send `refreshProfile:true`; this
does not recalculate manual remaining mass. An override wins over the snapshot.
Inactive brands/profiles cannot be used for new registrations; existing physical
records remain reconcilable. Profiles cannot be moved between brands.

## Resource routes

These use the same transaction/validation service as `/stock`, not a second set
of inventory rules. Mutation responses are the authoritative snapshot above.

| Method | Route | Body after common revision/key/CSRF |
| --- | --- | --- |
| GET, POST | /brands | POST `{revision,brand}` |
| PATCH | /brands/{id} | `{revision,brand:{version,name,active}}` |
| GET, POST | /tare-profiles | POST `{revision,profile}` |
| PATCH | /tare-profiles/{id} | `{revision,profile:{version,...fields}}` |
| GET, POST | /spools | POST `{revision,spool,confirmed:true}` |
| PATCH | /spools/{uuid} | `{revision,version,spool,confirmed:true}`; full validated form |
| POST | /spools/{uuid}/measurements | `{revision,version,gross,tare,confirmed:true}` |
| POST | /print-jobs | `{revision,name,printer,note,lines,versions,confirmed:true}` |
| PUT | /printer-slots/{kobra-1 or sparkx-1..4} | `{revision,id,versions,confirmed:true}` |
| POST | /activity/{uuid}/undo | `{revision,versions,confirmed:true}` |
| GET, POST | /catalogue | POST `{revision,filament}` |
| GET | /activity | `limit`/`offset`, full history pagination |
| GET | /printers | Fixed printer/slot records and manual assignments |
| POST | /nfc-tags/link | `{revision,id,uid,versions,confirmed:true}` |
| GET | /dashboard | Active physical count, grams, low/empty counts, grouped counts/masses, recent actor history |

Dashboard `groups` has material/brand/colorName entries with name, count and exact
decimal-string remainingG. Archived count is separate. Low stock remains
0 < remaining < 200 g; empty spools are a separate alert. Manual assignments
support exactly one Anycubic Kobra 3 slot and four Creality SPARKX i7 CFS slots.
Assigning a spool to another slot unloads its prior assignment transactionally.
Unload a spool before archiving it. Archiving never deletes or releases its code.

## Concurrency, retries and undo

The singleton revision row serializes writes for this small shared studio.
Affected spool/version checks, code sequence allocation, data writes, history,
revision increment and idempotency record commit in one InnoDB transaction.
Unrelated concurrent changes can also cause a 409: reload and review; no overwrite
or automatic merge is attempted. Sequence rows are locked, pre-existing codes
(including archived ones) are skipped, and DB uniqueness is the final guard.
Changing material/colour later never changes the assigned code or UUID.

Retries reuse the SAME key and exact body. Matching retries return the current
inventory snapshot without repeating a write. A reused key with a different body
returns 409. Ledger records are compact; full inventory copies are not saved per
key. No automatic key pruning is enabled. The expires_at column is reserved for
a future reviewed retention policy, not used to forget retries in this phase.
The frontend preserves the key after a network/ambiguous server failure and reloads
the authoritative snapshot after success. It never automatically resubmits after
a page reload. An operator starting a new form is a new intent.

Registration, print usage, absolute corrections, measurements, tare changes and
assignments record actor and before/after masses. Metadata-only changes have no
consumption delta. Measurement rows are immutable evidence; undo appends a
compensating event. Only the latest active stock entry can be undone, it must be
a print/weigh/correction (not registration), and current masses must still equal
the recorded after values. Undo restores prior mass/measured flags, never deletes
history or silently rewrites tare metadata. Archived spools cannot be undone until
explicitly restored. The UI only offers eligible undo actions.

The snapshot serves up to 5,000 physical spools and the latest 50,000 events; the
existing Activity view displays its latest 500. Older events remain available
through paginated GET /activity. JSON export is a loaded-state review copy,
not a full database disaster-recovery backup. Legacy restore/import remains
disabled until a dedicated migration phase. D1 is never used as a fallback.

GET /scale-reading returns null: hardware ingestion is deferred. Existing USB/NFC
review UI is preserved, but no ESP8266 firmware/protocol change, live Wi-Fi gateway
or automatic inventory update is introduced.
