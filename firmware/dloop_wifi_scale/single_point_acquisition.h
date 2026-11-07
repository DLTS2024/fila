#pragma once
#include <stdint.h>

namespace SinglePointAcquisition {
constexpr uint32_t RETRY_MS=5;
// Keep a 100 ms target between real reads, but do not wait another whole
// sample period if DOUT was still high at the target. No busy wait/catch-up.
constexpr bool due(uint32_t now,uint32_t lastPoll,uint32_t lastSample,bool haveSample) {
  return uint32_t(now-lastPoll)>=RETRY_MS &&
    (!haveSample||uint32_t(now-lastSample)>=SAMPLE_INTERVAL_MS);
}
}
