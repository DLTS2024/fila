# Browser USB scale protocol — Phase 5A

The browser implementation reads an ESP8266-compatible serial stream; it does not
flash, calibrate, tare or send commands to the board. The existing ESP8266 Wi-Fi
sketch is unchanged and DOES NOT emit this protocol. Its diagnostic text will be
rejected. A compatible firmware implementation is separate future work.

## Frames

115200 baud, UTF-8, one JSON object followed by LF (`\n`); CRLF is accepted.
The requested `stable` and `calibrated` fields are booleans with explicit values:

```json
{"v":1,"deviceId":"DLOOP-SCALE-01","seq":123,"grossG":984.6,"stable":true,"calibrated":true}
```

| Field | Contract |
| --- | --- |
| v | Integer 1, no string/other protocol versions |
| deviceId | DLOOP-SCALE-01 |
| seq | Integer 0–4294967295, strictly increasing in one connection |
| grossG | Finite JSON number, 0–100000 grams; never a numeric string |
| stable | Boolean; false displays an unstable sample but cannot be confirmed |
| calibrated | Boolean; false displays uncalibrated status but cannot be confirmed |
| uid | Optional 4/7/10-byte hexadecimal UID, without separators; never required |
| fault | Optional null or fault code; any non-null fault blocks measurements |

Fault example (status only, never a measurement):

```json
{"v":1,"deviceId":"DLOOP-SCALE-01","seq":124,"grossG":null,"stable":false,"calibrated":true,"fault":"HX711_TIMEOUT"}
```

Recognized display labels include HX711_NOT_READY, HX711_TIMEOUT,
HX711_DISCONNECTED, CALIBRATION_REQUIRED and OUT_OF_RANGE. Unknown fault codes
are displayed generically rather than echoing raw device strings. Raw serial
diagnostics, passwords, tokens and arbitrary frame contents are never logged or
rendered as diagnostic output. No private firmware header is exposed.

Frames over 1024 characters, malformed JSON/UTF-8, unknown fields/devices, missing
flags, invalid numbers, negative weights and duplicate/out-of-order sequences
are rejected. Oversized lines are discarded through the next newline. Parsing
supports fragmented bytes and multiple frames in one chunk. A reboot or sequence
wrap requires explicit disconnect/reconnect; new connections get a new browser
UUID and reset sequence tracking. NFC affects neither parsing nor eligibility.

Gross values are normalized to two decimal places for the existing inventory
DECIMAL contract. This is storage/display precision, not a claim of scale accuracy.
Stable/calibrated are firmware assertions, not proof of physical calibration.
Verify actual hardware against known reference masses in a later hardware phase.

## Review and confirmation

1. Connect USB in a supported desktop browser and choose the NodeMCU COM port.
2. Select the physical spool manually. A saved, known effective tare is required.
3. Wait for a fresh, stable, calibrated, fault-free sample. Receive alone writes
   nothing to inventory, tag links or measurement history.
4. Review the frozen gross, tare, previous mass, proposed net and difference.
5. Explicitly acknowledge and confirm. Manual entry has its own labelled review
   and is available even when Web Serial is missing or disconnected.

Samples expire after 5000 ms from browser receipt. Confirmation rechecks the live
controller at click time, not only the display timer. The connection must remain
open, latest sample must be safe, and current gross must remain within 0.5 g of
the frozen preview. A moved spool, stale stream, fault, invalid frame, disconnect
or inventory version change blocks confirmation. New frames never silently
replace the frozen preview. Optional UID data can prefill the optional tag field,
but cannot select a roll or save a tag automatically.

The protocol has no device capture timestamp. Receipt age and increasing seq
detect stalled/replayed browser streams, but cannot attest how long a first frame
was buffered on the device. Browser/server clocks must be synchronized. Firmware
claims and client timestamps are not cryptographically authenticated hardware.

## Existing PHP endpoint

POST `/api/v1/spools/{uuid}/measurements` retains revision/version, session auth,
CSRF, explicit confirmation and Idempotency-Key. Its optional `reading` object is:

```json
{
  "v":1,"deviceId":"DLOOP-SCALE-01","seq":123,"grossG":984.6,
  "stable":true,"calibrated":true,"receivedAt":"2026-10-30T05:00:00.123Z",
  "connectionId":"00000000-0000-4000-8000-000000000001","transport":"usb"
}
```

The timestamp above is an example, not usable live data. Use the actual browser
receipt time. PHP rejects unsafe flags, unsupported metadata, mismatched gross or
tare, timestamps older than 5 s or more than 1 s ahead of its clock, and duplicate
connection/device/sequence tuples. The duplicate check runs inside the existing
serialized inventory transaction. No new schema/migration or device credential
is required. Manual clients without reading metadata retain their old behavior.

USB confirmation uses the saved physical tare; changing tare is a separate spool
edit. Device/sequence and receipt time use existing measurement columns; calibration
and connection metadata remain in activity JSON. Transport usb stores source usb.
Transport simulator stores source manual and explicit simulator activity text,
never claims a physical USB measurement. NFC UID is not an identity/authorization
credential and is deliberately absent from measurement metadata.

Each frame uses a stable confirmation key. Double clicks are guarded immediately.
After an ambiguous network failure, Retry this confirmation uses the exact original
body/key. PHP acknowledges a previously committed request even after its sample
expires, without another write; an expired uncommitted sample is rejected. Retry
still requires a safe live connection. If it is disconnected/faulted, reload stock
to resolve the result. After a definitive validation/conflict error, cancel the
review and review a fresh sample; never change the payload under the old key.

## Browser/hosting requirements

Use a top-level localhost page in supported desktop Chrome/Edge during development,
or HTTPS on filament.dlts.in later. The UI checks isSecureContext and navigator.serial
and requests a port only from the Connect USB click. It does not auto-reconnect or
enumerate devices in the background. Close Arduino Serial Monitor/other port users.
Some boards can reset when opening a port; keep the platform clear when checking
the existing firmware's boot-tare behavior. No physical board was opened in tests.

On cPanel this remains static browser JavaScript plus the existing PHP REST API.
No Node production server, local bridge, Worker or continuously running service is
needed. If host/embedding policy disables serial, use an allowed same-origin top-level
page or manual entry; do not disable browser security to bypass it.

Primary references: [Chrome Web Serial](https://developer.chrome.com/docs/capabilities/serial)
and [requestPort secure-context/permission requirements](https://developer.mozilla.org/en-US/docs/Web/API/Serial/requestPort).
