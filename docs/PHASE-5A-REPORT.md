# Phase 5A — Browser USB smart scale integration

Baseline c762c9a / phase4-inventory-verified. Verified locally 30 October 2026
with existing PHP 8.5.12, MariaDB 10.11.16, React/TypeScript/Vite and Node test
tooling. No software/package installation, firmware action or deployment occurred.

## Delivered

- Reusable bounded NDJSON parser, read-only Web Serial connection manager and
  React lifecycle hook. Connect prompts for a port from a click at 115200 baud;
  disconnect, unplug, cancellation, reconnect and unmount release owned readers,
  listeners/ports. Failed cleanup remains visible and can be retried.
- Browser secure-context/support detection, connection/sensor status, continuous
  gross display, stable/unstable/calibration/fault state, timestamp and 5 s expiry.
  Invalid protocol data/duplicates/faults cannot supply a confirmable sample.
- NFC-independent manual spool selection and a frozen gross/tare/previous/net/
  difference preview. Stable/fresh/calibrated/no-fault state is rechecked at click
  time. No incoming frame can call an inventory mutation. Manual weight review
  stays available independently; optional tag links/records are preserved.
- Browser-only simulator using the same byte stream/parser path, with stable,
  calibrated, fault, pause and custom-frame controls. Explicit simulator warnings,
  acknowledgement and stored provenance distinguish it from physical readings.
- Existing authenticated measurement endpoint reused, preserving CSRF, integer
  decimal arithmetic, revision/version and idempotency. Optional reading metadata
  adds server-side freshness/flags/tare checks and duplicate connection/sequence
  rejection. No schema/migration, auth rule or ordinary manual workflow changed.
- Network ambiguity retains the original confirmation body/key. Already committed
  requests can be acknowledged after expiry without another measurement; expired
  uncommitted samples fail closed. Simulator records use manual source with an
  explicit simulator event note/metadata, never physical usb provenance.

## Actual verification

Final clean test DB: dloop_test_p4_p5a_20261030_055015_919e66. A new dedicated
random local DB user was scoped to that DB. All four existing migrations and
fixtures applied; no Phase 4 or production records were changed.

| Executed test | Result |
| --- | --- |
| Parser/connection suite | PASS: 154 checks; fragmented bytes, multi-frame chunks, CRLF, bad JSON/UTF-8/types/ranges/version, no NFC, UID optional, oversized-line recovery, duplicate/out-of-order seq, stale/future receipt, statuses, user-initiated chooser, cancellation, late open, unplug/reconnect, cleanup failure/retry, unsupported/insecure context and simulator cleanup |
| Scale component safety suite | PASS: no chooser on mount; zero writes before acknowledgement; unsafe states blocked; immediate double-click guard; exact intent/key retry; manual fallback; unmount/reconnect cleanup |
| Scale PHP endpoint suite | PASS: 24 checked requests/statuses including logout; invalid/fault/stale/future/CSRF/tare mismatch rejection, duplicate-frame rejection, committed retry after expiry and backward-compatible manual measurement |
| Simulator → React → Vite → PHP → MariaDB | PASS: an untagged spool, no frame UID, stable/calibration/fault/malformed/stale controls, zero pre-confirmation writes, 984.60−220=764.60 g, lost-acknowledgement retry after expiry, exactly one simulator write, disconnect/reconnect and 900−220=680 g manual fallback |
| Scale database ledger | PASS: 12 read-only assertions on exact masses, single records/history, status evidence and distinct USB/simulator/manual provenance |
| Existing PHP auth/security regression | PASS: login/logout, session/CSRF rotation, authorization, invalid inputs and throttling |
| Existing inventory HTTP regression | PASS: 68 checked requests plus balances, profiles, codes, retry/conflict, undo, assignments, dashboard and history assertions |
| Existing concurrency regression | PASS: six independent PHP/PDO writers; monotonic unique codes, one success/one conflict, one registration for identical concurrent retries |
| Existing live inventory UI + ledger | PASS: real PHP/MariaDB with jsdom; lost response and gateway failure retry safety, conflict/reload, 16 ledger assertions |
| Schema regression | PASS: 120 assertions; same 17 InnoDB tables, four migration checksums, 16 FKs, 19 named indexes, 20 CHECK constraints and 13 DECIMAL mass columns |
| PHP syntax + validation/password checks | PASS; 21 existing validation/password unit checks |
| Frontend typecheck, original inventory/API/UI tests and static build | PASS; 8 static files, no Node/Vinext/Worker/D1 server dependency |
| Existing Phase 4 MariaDB data | PASS: read-only hashes of all 17 prior database tables unchanged across the final verification run |
| D1/firmware integrity | PASS: all 15 saved SHA-256 hashes unchanged; original lib/stock.ts rules unchanged |

The browser connection tests use mock ports/native streams. Component unit saves
are spies and are not claimed as database operations. The live simulator test uses
the actual endpoint/database, deliberately discards a committed acknowledgement,
then proves retry does not create another measurement. Synthetic API metadata
exercises usb provenance, not physical USB hardware.

Private evidence: backend/var/phase5a/server-scale-results.json,
ui-scale-results.json, prior-database-baseline.json and retained per-run configs.
Initial test timing warnings were corrected with proper React act handling; the
final run passed without those warnings. Test DBs and evidence were retained,
not reset/dropped. Verification-only PHP/Vite servers were stopped afterward;
pre-existing XAMPP services were left running.

## Limits

- Physical COM selection, ESP8266/HX711 wiring, calibration, mass accuracy, real
  USB hot-plug and desktop/mobile visual browser rendering were NOT tested. The
  existing ESP8266 firmware remains Wi-Fi based and cannot provide accepted v1
  USB frames. No working physical-scale integration is claimed until compatible
  firmware and hardware acceptance are separately completed.
- Browser checks target native Web Serial in supported desktop Chromium on
  localhost/HTTPS. cPanel TLS/permissions policy and actual browser/device drivers
  remain untested; manual entry is the fallback. No Node production server or
  serial bridge is needed.
- Stable/calibrated and receipt time are client/firmware assertions. They are
  validated but not cryptographic attestation. The protocol has no absolute
  hardware capture timestamp, so receipt freshness cannot detect a first frame
  already buffered on the device. Keep browser/server clocks synchronized.
- A frozen USB preview expires after 5 s and blocks if live gross differs by
  more than 0.5 g. Expired retries only acknowledge an existing committed request;
  otherwise PHP rejects them. A disconnect/fault requires review/reconnection
  or stock reload to resolve an ambiguous result.
- Simulator confirmation changes the explicitly selected record only after its
  test-data acknowledgement. Use disposable inventory for simulation. It is not
  automatically disabled on a future production origin; it remains explicitly
  labelled and recorded as simulated/manual input.
- No NFC hardware, Wi-Fi ingestion, phone Web NFC, firmware flashing, remote
  credential exposure, schema migration, production DB or deployment was added.

See USB-SCALE-PROTOCOL.md for the corrected JSON contract, PHASE-5A-LOCAL.md for
run/test/rollback commands and PHASE-5A-CHANGED-FILES.md for all changed paths.
