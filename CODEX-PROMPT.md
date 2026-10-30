Continue this D Loop 3D Filament Studio project. Read START-HERE.md, inspect the existing implementation, install dependencies and run it locally before changing behavior. Preserve existing records and D Loop branding. Report verification limits accurately.

Requirements for the next phase:
- One inventory shared by phone NFC scan, manual spool selection, and optional future PN532 hardware scan. Manual selection must always work for untagged rolls.
- User has an Android Nothing Phone. Add phone Web NFC only when supported, with permission/error handling and a manual fallback. Verify current platform APIs in official documentation. Do not claim it is tested on a phone without actual device testing.
- 10+ filament brands: product/brand spool profiles with default empty-spool tare, plus per-roll tare overrides. Never use a universal 180 g tare.
- Keep separate physical roll ID, brand, spool type, material, colour, initial filament mass, current gross weight and remaining net filament. Reject gross below tare and invalid numbers. Preserve backups and migrations for old records.
- Anycubic Kobra 3 has ONE slot. Creality SPARKX i7 CFS uses the existing four slot records; printer assignments are manual.
- Printer usage stays estimated from manual slicer entries until a real compatible integration is verified. Include purge/flush once. Reweigh reconciles the balance.
- PN532 is not required now. Existing USB firmware is a prototype; do not treat firmware compilation, calibration, Wi-Fi integration or physical testing as completed.

First explain the current architecture and any setup errors, then implement the requested next feature with meaningful checks. Do not replace cloud persistence with browser-only storage silently. Do not modify production or publish without a separate explicit instruction in this local workflow.
