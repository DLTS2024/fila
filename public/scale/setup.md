# Archived prototypes ? do not flash

The files in this directory are historical, incompatible prototypes. The ESP8266 prototype is compile-blocked. Supported NodeMCU sources are `firmware/dloop_usb_scale` (USB) and `firmware/dloop_wifi_scale` (Wi-Fi), sharing the current protocol and acquisition code. See `docs/PRODUCTION-WIFI-DEPLOYMENT.md`. New release packages exclude this directory. Hardware operations require separate approval.

# D Loop 3D budget USB NFC scale — prototype

Status: firmware draft; not compiled or tested on hardware. No Wi-Fi synchronization.
Use an experienced electronics assembler to check your exact module pinout and voltage requirements before powering it.

## Parts
- Classic ESP32-WROOM DevKit with USB data cable
- 5 kg load cell and HX711 module
- PN532 module with SPI mode and 3.3 V-compatible logic
- One unique NFC tag per physical spool (e.g. NTAG215)
- Wires, rigid platform, load-cell mounting hardware
- OLED and touch sensor are not required

## Proposed pins (only for classic ESP32-WROOM)

| ESP32 | Module signal |
| --- | --- |
| GPIO26 | HX711 DOUT / DT |
| GPIO27 | HX711 SCK |
| GPIO18 | PN532 SCK |
| GPIO19 | PN532 MISO |
| GPIO23 | PN532 MOSI |
| GPIO5 | PN532 SS / SSEL |
| GND | Shared ground |

Supply each module according to its own datasheet. ESP32 GPIO is 3.3 V logic; do not connect 5 V logic directly. Load cell wire colours vary: identify E+, E−, A+, A− from the cell datasheet. Mount the fixed end and platform end with clearance; no other part may carry the platform's load. Keep NFC antenna clear of metal. Switch PN532 to SPI before booting.

## Firmware & calibration
1. Arduino IDE: install the Espressif ESP32 board package and select the exact board.
2. Install HX711 by bogde and Adafruit PN532 (including Adafruit BusIO).
3. Put dloop_scale.ino into a folder named dloop_scale. Review the pin settings, compile, then upload. Compilation and hardware acceptance remain to be verified.
4. Open Serial Monitor at 115200 baud, newline ending. Remove all objects and send `tare`.
5. Place a verified reference weight (for example 500 g). Send `cal 500` using its actual grams. The factor is stored in the ESP32's nonvolatile preferences.
6. Verify with a second known weight and repeat loading/removal. Never calibrate using a nominal filament spool weight.
7. Each reboot requires empty-platform `tare`; the firmware intentionally does not zero a loaded platform. Close the app USB port to use Serial Monitor; close Serial Monitor before connecting in the app.

## App workflow
1. Add product specifications in Catalogue; use Add roll for each physical spool.
2. Set the roll's verified empty spool weight (Reweigh can update it).
3. Open NFC & scale in desktop Chrome/Edge. Connect USB scale.
4. Put the tagged spool on the platform. Link the received UID to its physical roll once.
5. After a stable reading, verify roll identity and tare, then Confirm & save.
6. Keep logging slicer usage while the spool is on a printer. Reweigh corrects this estimate when you remove the roll.

One JSON line per reading: `{"uid":"04A1B2C3D4E5F6","gross":900,"stable":true}`.
The browser matches the NFC UID and saves only after confirmation. This is not original FilaMan firmware or a compatible replacement for its device API. No secrets are stored on the scale. Direct Wi-Fi operation needs a separate authenticated gateway that has not been implemented.

## Acceptance checklist
- Compile against actual selected board and library versions
- Verify wiring, load mounting and NFC detection on both sides/orientations used
- Verify empty zero, 500 g and another reference weight
- Reject moving readings; remove tag and change rolls to check matching
- 900 g gross − 220 g tare must save 680 g net; repeat/reload must not double-deduct
- USB disconnect/reconnect and app login/reload

Library references: https://github.com/bogde/HX711 and https://github.com/adafruit/Adafruit-PN532 . Install their licenses with their dependencies. This prototype is independently written for D Loop 3D.
