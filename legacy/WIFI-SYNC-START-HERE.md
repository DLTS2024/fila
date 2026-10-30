# D Loop 3D Filament Studio — ESP8266 Wi-Fi integration

This is an **edited copy of the uploaded source**, not an update to the published site. Back up live stock first. No live deployment, Arduino compile, physical scale test, or website build was performed.

## What was added
- `app/api/scale-reading/route.ts`: authenticated ESP8266 ingestion (POST) and dashboard polling (GET).
- `drizzle/0001_scale_readings.sql`: D1 table for latest raw scale measurement, separate from stock.
- `app/connections.tsx`: live Wi-Fi reading in NFC & Scale with manual roll selection and explicit confirmation. Unstable, stale (>30s), or gross-below-tare readings cannot be saved.
- `public/scale/esp8266_wifi_sync.ino`: ESP8266 Wi-Fi firmware sketch for D5/D6 HX711. **Do not upload until configured and compiled.**

## Local / Cloudflare DB
Apply `drizzle/0001_scale_readings.sql` to the same D1 DB as the existing `studio` table, both locally and at deployment. Example with Wrangler (replace binding/database configuration appropriately):

`npx wrangler d1 execute YOUR_DB_NAME --local --file=drizzle/0001_scale_readings.sql`

Use `--remote` only when you deliberately deploy and have taken a backup. Set Cloudflare secret `SCALE_DEVICE_TOKEN` to a long random token (24+ chars), and set the exact same value in ESP firmware. Never commit the real token or Wi-Fi password.

## Firmware configuration
1. Configure `WIFI_PASSWORD`, `API_URL`, `DEVICE_TOKEN` and the correct `ROOT_CA` trust anchor. URL must be a real HTTPS deployment of this updated backend; the existing published site will **not** receive readings until you deploy the updated code and DB migration.
2. Set ESP8266 NodeMCU 1.0 and HX711 library. Verify calibration with known weights. Boot with empty permanent platform.
3. Compile and upload. Watch Serial Monitor 115200. Confirm HTTP 200 on sends.
4. Open NFC & Scale. Select the physical roll and confirm a **stable** reading; this writes via the existing stock action and logs a history entry.

## Important limitations
- This first bridge keeps roll selection on the website, not on the ESP. It does not auto-apply stock changes or create brand profiles. Current catalogue already supports per-product tare and rolls support per-roll tare. Add Numaker PLA+ as a product/roll using the existing UI with 180 g tare (a user-provided value, not verified).
- Manual and existing UID linking are preserved. Phone Web NFC and PN532 are **not implemented** in this bridge.
- Device token is required for POST, but the existing app's GET and stock endpoints retain their original authentication/deployment model; audit authorization before making it public. The ESP firmware TLS CA placeholder must be replaced with a valid trust anchor; no insecure TLS bypass.
- Existing exported ZIP contains an older ESP32 prototype; use `esp8266_wifi_sync.ino` for ESP8266, not `dloop_scale.ino`.
- Run `npx --yes pnpm@11.25.0 install --frozen-lockfile`, `node scripts/init-local-db.mjs`, then type-check/build according to `START-HERE.md`. These have not been run here.
