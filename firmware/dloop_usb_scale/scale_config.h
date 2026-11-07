#pragma once
#include <stdint.h>
// Conservative starting heuristics, not measured accuracy or rated load capacity.
constexpr uint8_t WINDOW_SIZE = 16;
constexpr uint32_t SAMPLE_INTERVAL_MS = 100, EMIT_INTERVAL_MS = 250;
constexpr uint32_t SAMPLE_FRESH_MS = 500, SENSOR_TIMEOUT_MS = 1500;
constexpr float ZERO_TOLERANCE_G = 0.5f;
// Observed response: 29,400 counts / 275 g ~= 106.9 counts/g (not a saved factor).
// Distribution limits + temporal settling, not a relaxed single spread gate.
constexpr long RAW_HARD_RANGE = 400, RAW_CENTRAL_RANGE = 220;
constexpr double RAW_MAD = 70, RAW_HALF_SHIFT = 35, RAW_SLOPE = 2;
constexpr double RAW_LATEST_DELTA = 180, RAW_HOLD_DRIFT = 40;
// Once a candidate factor exists, require the same noise/drift bounds in grams.
constexpr float STABLE_CENTRAL_G = 2.1f, STABLE_MAD_G = 0.7f, STABLE_HOLD_G = 0.4f;
constexpr float MIN_REFERENCE_G = 50, MAX_GROSS_G = 5000;
constexpr float MIN_FACTOR = 0.01f, MAX_FACTOR = 1000000;
constexpr float VERIFY_ABS_G = 1, VERIFY_RELATIVE = 0.002f;
constexpr uint32_t RECORD_MAGIC = 0x444C5531;
// Opt-in approximate mode; strict remains the boot default and calibration gate.
// Experimental availability limits, not a claim of measured accuracy.
constexpr unsigned APPROX_WINDOW = 50, APPROX_TRIM = 5;
constexpr uint32_t APPROX_SETTLE_MS = 3000;
constexpr double APPROX_RANGE_G = 25, APPROX_CENTRAL_G = 6, APPROX_MAD_G = 1.5;
constexpr double APPROX_HALF_G = 2, APPROX_SLOPE_G_S = 0.25, APPROX_LATEST_G = 8;
constexpr double APPROX_HOLD_G = 5; // Accumulated drift since qualification revokes reference approval.
constexpr double APPROX_REFERENCE_MIN_G = 960, APPROX_REFERENCE_MAX_G = 1050;
// Old Wi-Fi factor approximately -108.55 is deliberately NOT a trusted default.
constexpr char FRAME_FORMAT[] = "{\"v\":1,\"deviceId\":\"DLOOP-SCALE-01\",\"seq\":%lu,\"grossG\":%s,\"stable\":%s,\"calibrated\":%s%s}\n";
