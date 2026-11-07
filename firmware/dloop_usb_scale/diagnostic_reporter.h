#pragma once
#include <stdio.h>
#include <stdarg.h>
#include "sampling_diagnostics.h"
#include "raw_stability.h"

namespace SamplingDiagnostics {
constexpr char TIMING_FORMAT[] = "#DIAG %s ms=%lu accepted=%llu count=%u firstId=%llu lastMs=%lu lastDt=%lu intervals=%u dtMin=%lu dtMax=%lu dtAvg=%.3f";
constexpr char RESET_FORMAT[] = " resetId=%lu reason=%s value=%.6f limit=%.6f discardedPending=%u discardedHold=%u prevValid=%s prevCentre=%.6f delta=%.6f span=%.6f";
constexpr char STATS_FORMAT[] = " centre=%.6f central=%.6f mad=%.6f half=%.6f slope=%.6f latest=%.6f spread=%ld hold=%u pending=%u";
struct Failure { double value = 0, limit = 0; bool numeric = false; };
constexpr Failure failure(const RawStability::Hold& h, uint32_t now, uint32_t observedMs, long raw) {
  const auto why = h.lastReset;
  Failure f{h.resetValue, h.resetLimit, why >= RawStability::Hold::ResetReason::FULL_RANGE &&
    why <= RawStability::Hold::ResetReason::CENTRE_SPAN};
  if (why == RawStability::Hold::ResetReason::STALE)
    return {double(uint32_t(now - observedMs)), SAMPLE_FRESH_MS, true};
  if (why == RawStability::Hold::ResetReason::RAW_RANGE && (raw <= -8388600L || raw >= 8388600L))
    return {double(raw), double(raw < 0 ? -8388600L : 8388600L), true};
  return f;
}
struct Builder {
  char text[1280] = {};
  unsigned used = 0;
  bool ok = true;
  void clear() { used = 0; ok = true; text[0] = 0; }
  void append(const char* fmt, ...) {
    if (!ok) return;
    va_list args; va_start(args, fmt);
    int n = vsnprintf(text + used, sizeof(text) - used, fmt, args);
    va_end(args);
    if (n < 0 || unsigned(n) >= sizeof(text) - used) { ok = false; return; }
    used += unsigned(n);
  }
};
struct Reporter {
  Samples samples;
  Output output;
  ResetOnce resets;
  Builder line; // Static reporter member avoids a large formatter on the MCU stack.
  bool enabled = false, full = false, endPending = false;
  uint32_t lastStatus = 0, resetObserved = 0, resetQueued = 0, recordsLost = 0;
  uint32_t protocolLost = 0;
#ifdef DLOOP_WIFI_ENABLED
  uint32_t diagnosticLost = 0, formatLost = 0;
#endif
  uint32_t firstLostReset = 0;
  bool lostReset = false;
  const char* endReason = "USER";

  void overflow() {
    ++recordsLost; enabled = false; endPending = true; endReason = "OUTPUT_OVERFLOW";
  }
  bool queueDiagnostic(const char* text) {
    if (output.diagnostics.push(text)) return true;
#ifdef DLOOP_WIFI_ENABLED
    ++diagnosticLost;
#endif
    overflow(); return false;
  }
  bool finish() {
    line.append("\n");
#ifdef DLOOP_WIFI_ENABLED
    if (!line.ok) ++formatLost;
#endif
    if (!line.ok) { overflow(); return false; }
    return queueDiagnostic(line.text);
  }
  void protocol(const char* frame) {
    if (!output.protocol.push(frame)) { ++protocolLost; overflow(); }
  }
  void base(const char* kind, uint32_t now, const RawStability::Hold& h) {
    line.clear();
    const auto t = samples.timing();
    line.append(TIMING_FORMAT, kind, static_cast<unsigned long>(now),
      static_cast<unsigned long long>(samples.accepted), samples.count,
      static_cast<unsigned long long>(samples.firstId()), static_cast<unsigned long>(samples.lastMs),
      static_cast<unsigned long>(samples.lastInterval), t.intervals,
      static_cast<unsigned long>(t.minimum), static_cast<unsigned long>(t.maximum), t.average());
    line.append(" haveSample=%s windowAge=%lu saturated=%s", samples.havePrevious ? "true" : "false",
      static_cast<unsigned long>(samples.havePrevious ? uint32_t(now - samples.lastMs) : 0),
      samples.saturated ? "true" : "false");
    RawStability::Stats s;
    if (samples.count == CAPACITY) {
      long ordered[CAPACITY];
      for (unsigned i = 0; i < CAPACITY; ++i) ordered[i] = samples.value(i);
      s = RawStability::analyse(ordered);
    }
    line.append(STATS_FORMAT, s.centre, s.centralRange, s.mad, s.halfShift, s.slope,
      s.latestDelta, s.spread, h.count, h.pending);
  }
  void values() {
    line.append(" raw=[");
    for (unsigned i = 0; i < samples.count; ++i) line.append("%s%ld", i ? "," : "", samples.value(i));
    line.append("] times=[");
    for (unsigned i = 0; i < samples.count; ++i)
      line.append("%s%lu", i ? "," : "", static_cast<unsigned long>(samples.timestamp(i)));
    line.append("]");
  }
  void begin(bool detailed, uint32_t now, const RawStability::Hold& h) {
    // Drain a prior END before beginning another capture; no unbounded backlog.
    if (endPending || enabled) return;
    enabled = true; full = detailed; lastStatus = now;
    resetObserved = 0; resetQueued = 0; recordsLost = 0; protocolLost = 0;
    lostReset = false; firstLostReset = 0;
    resets.seen = h.resetId;
    base("BEGIN", now, h);
    line.append(" version=1 mode=%s pollMs=%lu halfLimit=%.6f slopeLimit=%.6f bandLimit=%.6f startResetId=%lu",
      full ? "FULL" : "SUMMARY", static_cast<unsigned long>(SAMPLE_INTERVAL_MS),
      RAW_HALF_SHIFT, RAW_SLOPE, RAW_HOLD_DRIFT, static_cast<unsigned long>(h.resetId));
    finish();
  }
  void stop(const char* reason) {
    if (!enabled) return;
    enabled = false; endPending = true; endReason = reason;
  }
  void snapshot(uint32_t now, const RawStability::Hold& h) {
    base("SNAPSHOT", now, h); values(); finish();
  }
  void accepted(uint32_t now, const RawStability::Hold& h) {
    if (!enabled) return;
    if (samples.saturated) { enabled = false; endPending = true; endReason = "COUNTER_SATURATED"; return; }
    if (full && samples.accepted % CAPACITY == 0) {
      base("WINDOW", now, h); values(); finish();
    }
  }
  void reset(const RawStability::Hold& h, uint32_t now, long observedRaw,
             uint32_t observedMs, bool observed) {
    if (!resets.take(h.resetId) || !enabled) return;
    ++resetObserved;
    base("RESET", now, h);
    const auto f = failure(h, now, observedMs, observedRaw);
    line.append(RESET_FORMAT, static_cast<unsigned long>(h.resetId), RawStability::Hold::resetName(h.lastReset),
      f.value, f.limit, h.resetPending, h.resetCount,
      h.resetPreviousValid ? "true" : "false", h.resetPrevious, h.resetDelta, h.resetSpan);
    line.append(" numeric=%s observed=%s observedRaw=%ld observedMs=%lu", f.numeric ? "true" : "false", observed ? "true" : "false",
      observedRaw, static_cast<unsigned long>(observedMs));
    if (full) values();
    if (finish()) ++resetQueued;
    else if (!lostReset) { lostReset = true; firstLostReset = h.resetId; }
  }
  void tick(uint32_t now, const RawStability::Hold& h) {
    if (endPending && output.diagnostics.count < 8) {
      base("END", now, h);
      line.append(" reason=%s resetObserved=%lu resetQueued=%lu recordsLost=%lu protocolLost=%lu lostReset=%s firstLostReset=%lu",
        endReason, static_cast<unsigned long>(resetObserved), static_cast<unsigned long>(resetQueued),
        static_cast<unsigned long>(recordsLost), static_cast<unsigned long>(protocolLost),
        lostReset ? "true" : "false", static_cast<unsigned long>(firstLostReset));
      // Clear only after successfully reserving the marker. Formatting is bounded.
      line.append("\n");
      if (line.ok && output.diagnostics.push(line.text)) endPending = false;
    }
    if (enabled && uint32_t(now - lastStatus) >= 1000) {
      lastStatus = now; base("STATUS", now, h); finish();
    }
  }
};
}
