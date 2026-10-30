#pragma once
#include <stdint.h>
// Conservative starting heuristics, not measured accuracy or rated load capacity.
constexpr uint8_t WINDOW_SIZE = 16;
constexpr uint32_t SAMPLE_INTERVAL_MS = 100, EMIT_INTERVAL_MS = 250;
constexpr uint32_t SAMPLE_FRESH_MS = 500, SENSOR_TIMEOUT_MS = 1500;
constexpr float ZERO_TOLERANCE_G = 0.5f, STABLE_SPREAD_G = 1.0f;
constexpr float STABLE_TREND_G = 0.25f, LATEST_TOLERANCE_G = 0.5f;
constexpr float MIN_REFERENCE_G = 50, MAX_GROSS_G = 5000;
constexpr float MIN_FACTOR = 0.01f, MAX_FACTOR = 1000000;
constexpr float VERIFY_ABS_G = 1, VERIFY_RELATIVE = 0.002f;
constexpr long ZERO_RAW_SPREAD = 50;
constexpr uint32_t RECORD_MAGIC = 0x444C5531;
// Old Wi-Fi factor approximately -108.55 is deliberately NOT a trusted default.
constexpr char FRAME_FORMAT[] = "{\"v\":1,\"deviceId\":\"DLOOP-SCALE-01\",\"seq\":%lu,\"grossG\":%s,\"stable\":%s,\"calibrated\":%s%s}\n";
