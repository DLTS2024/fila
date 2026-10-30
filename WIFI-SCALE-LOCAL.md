# ESP8266 LAN scale setup and verification

## Prepared source and private sketch

Source: `public/scale/esp8266_wifi_sync.ino`.
Arduino sketch: `work/firmware/esp8266_wifi_sync/esp8266_wifi_sync.ino`.
Run `node scripts/prepare-scale.mjs` to stage it. The script initially copies the
existing .dev.vars token into ignored `.scale-secrets.h`; it never prints it.
It preserves an existing header. If the backend token changes, update the private
header locally, then stage again. Never put credentials in public/ or screenshots.
The staged header and compiled binaries contain credentials; keep work/ private.

Edit `.scale-secrets.h` locally: set WIFI_SSID and WIFI_PASSWORD for the home
2.4 GHz network (not a guest network with client isolation). No Wi-Fi password
was supplied or configured by this task. Keep LOCAL_HTTP_TEST=true for this
isolated LAN test. API_URL is http://192.168.1.5:5173/api/scale-reading.
This IP is the PC's current WiFi IPv4 address; check ipconfig after DHCP changes.

## IDE and wiring

Arduino IDE Boards Manager: `esp8266 by ESP8266 Community`.
Select `NodeMCU 1.0 (ESP-12E Module)` (FQBN esp8266:esp8266:nodemcuv2).
Library Manager: `HX711 Arduino Library` by Bogdan Necula/bogde (installed 0.7.5).
ESP8266WiFi, ESP8266HTTPClient, and BearSSL are included with the ESP8266 core;
no ArduinoJson, NFC, or PN532 library is required for this sketch.
Open the staged sketch, Verify only. Upload requires separate approval.

HX711 DT/DOUT -> D5 (GPIO14); SCK -> D6 (GPIO12); common GND.
Use 3.3 V compatible power and signal levels; do not feed 5 V into ESP GPIO.
Connect the load cell to HX711 according to its actual wiring/datasheet.
Calibration factor is -108.55; verify the sign and grams with known masses.
Boot tare zeros only the empty permanent platform. A spool must NOT be present.
Spool tare belongs to the website and must not be subtracted by the firmware.
A failed boot tare prevents sending until reboot; sample timeouts abort a reading.

## LAN server and protocol

`npm.cmd run dev -- --hostname 192.168.1.5`

Bind only this private interface, not 0.0.0.0. Stop an existing project dev server
before starting. No router forwarding, tunnel, public hostname, or public firewall
rule. Keep the network trusted/isolated: HTTP sends the development bearer token
unencrypted. The local app uses mock sign-in, so every trusted LAN client able to
reach it may access the studio. Stop the LAN server after testing and restart with
`npm.cmd run dev -- --hostname 127.0.0.1` for normal local use.
If Windows blocks the board, inspect the firewall; any exception should be Private
profile, TCP 5173, and limited to the board IP. No firewall rule was changed here.

POST /api/scale-reading with Content-Type: application/json and
Authorization: Bearer <the existing local SCALE_DEVICE_TOKEN>.
Exact JSON: {"deviceId":"DLOOP-SCALE-01","grossG":984.6,"stable":true}.
Backend accepts numeric finite 0..20000 grams, boolean stable, this exact device ID,
and a token at least 24 characters long. Firmware sends only stable samples
(max-min <=2 g over eight samples), at most once per five seconds. It sends no UID
and never calls /api/stock. Missing/invalid credentials return 401; invalid payload
returns 400; a missing server token returns 503. Redirect following is disabled.
GET returns device_id, gross_g, stable (0/1), and server recorded_at.

`node scripts/check-scale-local.mjs --lan` tests this PC LAN address using the
private token, including rejection cases and unchanged stock state/revision.
This is a synthetic API test, not a board or cross-device connectivity test.

## Hardware test checklist (after upload approval)

1. Verify the staged sketch; confirm correct board and port before any upload.
2. With the platform empty, boot and watch Serial Monitor at 115200 baud.
3. Check the board joins the 2.4 GHz network and receives a private IP. Do not
   print passwords/tokens. Resolve client isolation/firewall issues if necessary.
4. Place known masses on the platform. Check zero, increasing positive grams,
   calibration accuracy, repeatability, and mechanical clearance.
5. Move the platform: unstable readings should not post. Settle it: expect
   `Gross ... g stable=1 API HTTP 200` roughly every five seconds.
6. GET from another trusted LAN device and open NFC & Scale. Confirm matching
   gross weight, Stable, and a current timestamp; old readings cannot be saved
   after 30 seconds. Polling occurs every four seconds.
7. Select the physical spool manually and verify its saved tare. Do not click
   Confirm/Save during a read-only test. Verify stock and revision stay unchanged.
8. Disconnect HX711 or Wi-Fi and check timeout/recovery behavior. Reboot empty
   after a boot tare fault. Confirm invalid tokens cannot update a reading.
9. Stop LAN access after testing. Do not use the local development token remotely.

Manual spool selection and existing NFC UID/USB flow are unchanged. Phone Web NFC
and PN532 are not currently implemented by this project; this bridge adds neither
and leaves future integration separate. PN532 SPI planning must account for D5/D6
already being used by HX711. No automatic deduction or stock reconciliation occurs.

## Production HTTPS plan (not performed)

Choose an approved real HTTPS endpoint and access-control design for device ingress.
Use a separate production device token, configured privately in firmware and backend.
Set LOCAL_HTTP_TEST=false and install the actual PEM root CA matching that host's
certificate chain; obtain valid NTP time. Verify hostname, chain, expiry, and time on
the device. Never use setInsecure or downgrade to HTTP. Test valid/invalid token,
CA failure, expiry/time failure, GET display, and unchanged stock before rollout.
Production migrations, credentials, deployment, and firmware upload need approval.
