#pragma once
#include <stdint.h>
#include <stddef.h>

// Diagnostic state only. No member participates in scale eligibility/calibration.
namespace SamplingDiagnostics {
constexpr unsigned CAPACITY = 16;
struct Timing {
  unsigned intervals = 0;
  uint32_t minimum = 0, maximum = 0;
  uint64_t total = 0;
  constexpr double average() const { return intervals ? double(total) / intervals : 0; }
};
struct Samples {
  long raw[CAPACITY] = {};
  uint32_t ms[CAPACITY] = {};
  unsigned count = 0, next = 0;
  uint64_t accepted = 0;
  uint32_t lastMs = 0, lastInterval = 0;
  bool havePrevious = false, saturated = false;
  constexpr void clearWindow() { count = 0; next = 0; }
  constexpr void accept(long value, uint32_t timestamp) {
    if (accepted == UINT64_MAX) { saturated = true; return; }
    ++accepted;
    lastInterval = havePrevious ? uint32_t(timestamp - lastMs) : 0;
    lastMs = timestamp; havePrevious = true;
    raw[next] = value; ms[next] = timestamp;
    next = (next + 1) % CAPACITY;
    if (count < CAPACITY) ++count;
  }
  constexpr unsigned index(unsigned chronological) const {
    return ((count == CAPACITY ? next : 0) + chronological) % CAPACITY;
  }
  constexpr long value(unsigned i) const { return raw[index(i)]; }
  constexpr uint32_t timestamp(unsigned i) const { return ms[index(i)]; }
  constexpr uint64_t firstId() const { return count ? accepted - count + 1 : 0; }
  constexpr Timing timing() const {
    Timing t;
    for (unsigned i = 1; i < count; ++i) {
      uint32_t dt = uint32_t(timestamp(i) - timestamp(i - 1));
      if (!t.intervals || dt < t.minimum) t.minimum = dt;
      if (dt > t.maximum) t.maximum = dt;
      t.total += dt; ++t.intervals;
    }
    return t;
  }
};
struct ResetOnce {
  uint32_t seen = 0;
  constexpr bool take(uint32_t id) {
    if (id == seen) return false;
    seen = id; return true;
  }
};

// A line is never interleaved with another line. Separate protocol slots reserve
// capacity for v1 frames; selection favors protocol only at line boundaries.
template<unsigned N, unsigned SIZE> struct Lines {
  char text[N][SIZE] = {};
  unsigned length[N] = {}, head = 0, count = 0;
  constexpr bool push(const char* line) {
    unsigned len = 0;
    while (line[len] && len < SIZE - 1) ++len;
    if (line[len] || !len || line[len - 1] != '\n' || count == N) return false;
    unsigned slot = (head + count) % N;
    for (unsigned i = 0; i <= len; ++i) text[slot][i] = line[i];
    length[slot] = len; ++count; return true;
  }
  constexpr void pop() { if (count) { head = (head + 1) % N; --count; } }
};
struct Output {
  Lines<2, 512> protocol;
  Lines<8, 1280> diagnostics;
  int active = 0; // 0 none, 1 protocol, 2 diagnostic.
  unsigned offset = 0;
  constexpr const char* peek(unsigned& remaining) {
    if (!active) active = protocol.count ? 1 : diagnostics.count ? 2 : 0;
    if (!active) { remaining = 0; return nullptr; }
    if (active == 1) { remaining = protocol.length[protocol.head] - offset; return protocol.text[protocol.head] + offset; }
    remaining = diagnostics.length[diagnostics.head] - offset;
    return diagnostics.text[diagnostics.head] + offset;
  }
  constexpr void consume(unsigned bytes) {
    unsigned remaining = 0; peek(remaining);
    if (!active) return;
    offset += bytes < remaining ? bytes : remaining;
    unsigned size = active == 1 ? protocol.length[protocol.head] : diagnostics.length[diagnostics.head];
    if (offset == size) {
      if (active == 1) protocol.pop(); else diagnostics.pop();
      active = 0; offset = 0;
    }
  }
};
}
