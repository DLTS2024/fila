# DLOOP-SCALE-01 opt-in raw capture on Windows

The existing DEBUG TRACE FULL stream already provides ordered accepted HX711 raw
values, uint64 sample IDs and uint32 MCU read-completion milliseconds. No firmware
change is needed. This workflow sends only diagnostic commands. It does not zero,
calibrate, change thresholds, save inventory or flash the device. Diagnostics have
UART/CPU cost; inspect measured timing rather than assuming acquisition is unaffected.

Prerequisites: the existing Phase 5C firmware is already installed, Node.js is
available, and Python 3 plus pyserial is installed. Disconnect browser USB and
close Serial Monitor. Opening some USB adapters may reboot the board despite the
utility setting DTR/RTS false; allow identity verification to finish and record
warm-up conditions. Each invocation verifies a v1 DLOOP-SCALE-01 identity frame
before enabling capture. The identity is a protocol check, not hardware authentication.

From the repository root in PowerShell:

```powershell
py -3 -m pip install pyserial
py -3 -m serial.tools.list_ports
New-Item -ItemType Directory -Force captures
py -3 scripts/capture-hx711.py capture --port COM5 --seconds 30 --label EMPTY_STATIC --output captures/empty.csv --evidence "Operator: untouched empty platform for entire interval"
py -3 scripts/capture-hx711.py capture --port COM5 --seconds 30 --label 275G_STATIC --output captures/275g.csv --evidence "Operator: independent 275 g reference already stationary before capture"
py -3 scripts/capture-hx711.py capture --port COM5 --seconds 5 --label LOADING --output captures/loading.csv --evidence "Operator/video: continuous loading throughout interval"
py -3 scripts/capture-hx711.py capture --port COM5 --seconds 5 --label UNLOADING --output captures/unloading.csv --evidence "Operator/video: continuous unloading throughout interval"
```

Replace COM5 with the verified port. Use `python` instead of `py -3` if that is your
installed interpreter. No dependency installation or device access happens merely
by importing the script or running offline replay.

Labels are operator ground truth, never inferred from stability flags. Prepare the
static condition before starting. For motion captures, ensure the entire interval
after BEGIN represents the named motion; use video/time annotations to check this.
Do not call a long static plateau LOADING merely because a single placement occurs
somewhere in it. A single-label CSV is useful for sustained-motion trials; for
motion onset/recovery and mixed plateaus retain the original log and use independently
annotated ID intervals with the existing replay CLI, as described in
[offline replay design](RAW-STABILITY-OFFLINE-REPLAY.md). Do not concatenate separate
captures into a continuous hold history. Five-second motion examples alone cannot
test four-centre cold-start false stability; also record sustained motion over 64
samples and continuous mixed captures starting from an established static hold.

The utility sends these exact newline-terminated command batches at 115200 baud:

```text
DEBUG TRACE FULL
DEBUG SNAPSHOT
```

At duration end it sends one batch containing:

```text
DEBUG SNAPSHOT
DEBUG TRACE OFF
```

It waits up to ten seconds for BEGIN/END. Ctrl+C attempts the same stop batch and
retains the log without exporting CSV. If a cable disconnect prevents cleanup,
reconnect a monitor and send DEBUG TRACE OFF, then wait for END before retrying.
Existing active traces are not silently adopted. Output paths cannot be overwritten.

## Files and completeness

Each successful capture produces `name.csv`, `name.csv.json` and `name.csv.log`.
The log preserves received serial bytes including production JSON. CSV columns are
`device_id,sample_id,device_ms,raw,label,reset_before`. The metadata records label
evidence, count, source log, export UTC, timestamp meaning and a CSV SHA-256.
Device milliseconds are not UTC or host reception timestamps; modular timestamp
differences handle rollover. IDs remain decimal strings to retain uint64 precision.

Only samples accepted after BEGIN are exported; the initial snapshot supplies
boundary evidence. The shared offline importer verifies all IDs are contiguous,
duplicates agree, timestamps progress, timing summaries match, reset IDs/counters
are complete, FULL mode is used and END has reason USER, zero recordsLost and
protocolLost, and lostReset=false. The bridge additionally checks coverage from
BEGIN accepted+1; the importer checks coverage through END accepted. A missing
tail, USB loss or overflow fails validation and preserves the log without creating
a valid CSV. CSV modification is detected on replay through its metadata hash.

This proves completeness of the accepted sample stream, not every ADC conversion.
NOT_READY polls and rejected raw values have no accepted ID. Rejected conversion
context appears in RESET records; unobserved ADC conversions cannot be recovered.
Long acquisition gaps need explicit STALE evidence. A reset flood may overflow
the existing bounded output queue; preserve the failure and retry rather than
interpolating data. WINDOW records overlap RESET/SNAPSHOT records intentionally.

All diagnostic wire records start `#DIAG`, never `{`; the production parser already
rejects them. The utility uses JSON frames only to check identity, never as raw
measurements, and never feeds diagnostics into inventory or the browser.

## Offline entry points and tests

```powershell
py -3 scripts/capture-hx711.py replay captures/empty.csv --candidates scripts/fixtures/scale-replay/candidates.json > captures/empty-replay.json
py -3 scripts/capture-hx711.py export --log captures/empty.csv.log --output captures/reexport.csv --label EMPTY_STATIC --evidence "Independent operator annotation"
node scripts/check-capture-bridge.mjs
py -3 scripts/test-capture-hx711.py
node scripts/check-scale-replay.mjs
node scripts/check-sampling-diagnostics.mjs
node scripts/check-firmware-protocol.mjs
node scripts/check-scale.mjs
```

CSV replay uses unchanged threshold defaults or explicit offline slope/half
candidates. It is a cold-start reconstruction with unknown original hold history.
Do not select limits from isolated CSV reset counts: use continuous independently
labelled static/motion captures and the evidence criteria in the replay design.
