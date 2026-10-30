# Start here — Phase 4

Read README.md and docs/PHASE-4-LOCAL.md for the current PHP/Vite commands.
The authenticated React UI now uses PHP/MySQL for inventory. Use Catalogue to
create a brand and verified spool profiles, then Add spool to register physical
rolls. Actual masses start blank and must be reviewed before confirmation.

The retained disposable verification config is referenced by
backend/var/phase4/active-config.txt. It must never be deployed. Create a separate
local studio database/admin for real inventory; never reuse public fixture users.

Do not run legacy D1/Vinext scripts or flash firmware. See docs/PHASE-4-REPORT.md
for verification, limitations and rollback. No production deployment is performed.


For Phase 5A USB scale/simulator setup and isolated test inventory, read docs/PHASE-5A-LOCAL.md and docs/PHASE-5A-REPORT.md. USB needs supported desktop Chromium on localhost or HTTPS. The existing Wi-Fi firmware remains unchanged; physical compatibility is not verified. Manual inventory entry remains.

Phase 5B adds a separate USB-only NodeMCU sketch without overwriting the Wi-Fi firmware. See [firmware setup, calibration and physical acceptance](docs/PHASE-5B-FIRMWARE.md) and [executed verification](docs/PHASE-5B-REPORT.md). No board has been flashed or physically tested.
